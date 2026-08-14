// background.js
import {
  getCitySettings,
  openListingsDirectory,
  openOrdersDirectory,
  pingBackend,
  printNewOrders,
  saveCitySettings,
  sendOrders,
  syncListings,
} from "./backendClient.js";

const NATIVE_BACKEND_HOST = "com.codes_harvester.backend.dev";
let backendStartInFlight = null;

function sendNativeBackendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(NATIVE_BACKEND_HOST, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function ensureBackendRunningOnce() {
  try {
    const backend = await pingBackend();
    return { started: false, backend };
  } catch {
    const nativeResponse = await sendNativeBackendMessage({ type: "START_BACKEND" });
    if (!nativeResponse?.ok) {
      throw new Error(nativeResponse?.error || "Native host не запустил backend");
    }

    const backend = await pingBackend();
    return {
      started: Boolean(nativeResponse.started),
      backend,
      native: nativeResponse,
    };
  }
}

function ensureBackendRunning() {
  if (!backendStartInFlight) {
    backendStartInFlight = ensureBackendRunningOnce().finally(() => {
      backendStartInFlight = null;
    });
  }
  return backendStartInFlight;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const backendActions = {
    SEND_ORDERS: () => sendOrders(message.payload),
    SYNC_LISTINGS: () => syncListings(message.payload),
    GET_CITY_SETTINGS: () => getCitySettings(),
    SAVE_CITY_SETTINGS: () => saveCitySettings(message.payload),
    OPEN_LISTINGS_DIRECTORY: () => openListingsDirectory(),
    OPEN_ORDERS_DIRECTORY: () => openOrdersDirectory(),
    PRINT_ORDERS: () => printNewOrders(),
  };

  let operation;
  if (message.type === "ENSURE_BACKEND" || message.type === "PING_BACKEND") {
    operation = ensureBackendRunning();
  } else if (backendActions[message.type]) {
    operation = ensureBackendRunning().then(backendActions[message.type]);
  } else {
    return undefined;
  }

  operation
    .then(data => sendResponse({ ok: true, data }))
    .catch(err => sendResponse({ ok: false, error: err.message }));
  return true;
});


console.log("[background:dev] loaded");
chrome.action.setBadgeText({ text: "DEV" });
chrome.action.setBadgeBackgroundColor({ color: "#b45309" });

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.declarativeContent.onPageChanged.removeRules(undefined);
  chrome.declarativeContent.onPageChanged.addRules([{
    id: "show-on-avito",
    conditions: [
      new chrome.declarativeContent.PageStateMatcher({
        pageUrl: { hostEquals: "www.avito.ru", pathPrefix: "/orders" }
      }),
      new chrome.declarativeContent.PageStateMatcher({
        pageUrl: { hostEquals: "www.avito.ru", pathPrefix: "/profile" }
      })
    ],
    actions: [ new chrome.declarativeContent.ShowAction() ]
  }]);
});


// ------------------------------------------------------------
// Детальный проход: открыть вкладку карточки -> достать код -> закрыть
// ------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "EXTRACT_CODE_FROM_DETAIL" && typeof msg.url === "string") {
    extractCodeFromDetail(msg.url).then(
      code => sendResponse({ ok: true, code }),
      err  => sendResponse({ ok: false, error: err?.message || String(err) })
    );
    return true;
  }
});

async function extractCodeFromDetail(url) {
  const tabId = await openInactiveTab(url);
  try {
    await waitTabComplete(tabId, 15000);
    await randomSleep(3000, 5000);
    const [{ result: code }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: scrapeDetailPageCode
    });
    if (!code || code === "__FAILED__") throw new Error("code not found");
    return code;
  } finally {
    // всегда закрываем вкладку
    try { await chrome.tabs.remove(tabId); } catch {}
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomSleep(minMs, maxMs) {
  const min = Math.max(0, Number(minMs) || 0);
  const max = Math.max(min, Number(maxMs) || min);
  const ms = Math.floor(min + Math.random() * (max - min + 1));
  return sleep(ms);
}

function openInactiveTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: false }, tab => {
      if (chrome.runtime.lastError || !tab?.id)
        return reject(new Error(chrome.runtime.lastError?.message || "cannot create tab"));
      resolve(tab.id);
    });
  });
}

function waitTabComplete(tabId, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    const timer = setInterval(() => {
      if (Date.now() - start > timeout) {
        chrome.tabs.onUpdated.removeListener(listener);
        clearInterval(timer);
        reject(new Error("timeout loading detail page"));
      }
    }, 300);
  });
}

// ------------------------------------------------------------
// Код исполняется внутри карточки
// ------------------------------------------------------------
function scrapeDetailPageCode() {
  try {
    const scope = document.querySelector("main") || document.body;
    const nodes = scope.querySelectorAll("p, strong, span");

    for (const el of nodes) {
      const t = el.textContent || "";
      if (!/\u00A0/.test(t)) continue;
      const nbspCount = (t.match(/\u00A0/g) || []).length;
      if (nbspCount < 2) continue;
      const digitCount = (t.match(/\d/g) || []).length;
      if (digitCount < 8) continue;
      if (!/^[A-Za-z0-9\u00A0\s]+$/.test(t)) continue;

      const cleaned = t.replace(/[\s\u00A0]+/g, "").toUpperCase();
      if (cleaned.length >= 10 && cleaned.length <= 18) return cleaned;
    }
    return "__FAILED__";
  } catch (e) {
    console.error(e);
    return "__FAILED__";
  }
}
