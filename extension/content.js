// content.js

(function main() {
  // Ничего не делаем на старте — всё по команде из popup.
})();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Сбор заказов (как было)
  if (msg?.type === "COLLECT_ORDERS") {
    collectOrdersAsync().then(
      (result) => sendResponse({ ok: true, ...result }),
      (err)    => sendResponse({ ok: false, error: err?.message || String(err) })
    );
    return true; // async
  }

  // Сбор всех объявлений. Карточки отправляются на backend как HTML,
  // чтобы название и город извлекались централизованно на Python.
  if (msg?.type === "COLLECT_LISTINGS") {
    collectListingsAllPagesAsync().then(
      (result) => sendResponse({ ok: true, ...result }),
      (err)    => sendResponse({ ok: false, error: err?.message || String(err) })
    );
    return true; // async
  }
});

// ------------------------------------------------------------
// 1) Блок заказов
// ------------------------------------------------------------

const ORDER_ROW_SELECTOR = '[data-marker="order-row"], .orders-list .order, .orders-list__item';

function isOnOrdersPage() {
  try {
    const u = new URL(location.href);
    return u.protocol === "https:" &&
           (u.host === "www.avito.ru" || u.host === "m.avito.ru") &&
           u.pathname.startsWith("/orders");
  } catch { return false; }
}

async function collectOrdersAsync() {
  if (!isOnOrdersPage()) {
    return { orders_data: {} };
  }

  const loaded = await loadAllOrderRowsAsync();
  const rows = loaded.rows;
  const carrierDict = /(авито|сдэк|cdek|почта\s*россии|boxberry|dpd|pek|major|dhl|ems|яндекс|yandex|5\s*post|5post|пятёроч)/i;

  const orders_data = {};
  let surrogateCounter = 1;

  for (const row of rows) {
    try {
      const status = text(row.querySelector('[data-marker="order-status"], h5[data-marker="order-status"], .order-status'));
      if (!status || !/отправьте заказ/i.test(status)) continue;

      const pointRaw = detectPoint(row, carrierDict);
      const point = normalizePoint(pointRaw);
      const isAvito = /авито/i.test(pointRaw || "");

      let title =
        row.querySelector('div[data-marker="images-row"] img[alt]')?.getAttribute('alt') ||
        text(row.querySelector('a[title]')) ||
        text(row.querySelector('[data-marker="item-title"], .item-title, h3, h4')) ||
        "";
      title = title.trim();

      let orderCode = extractInlineCode(row);
      if (!orderCode && isAvito) {
        const detailUrl = getDetailUrl(row);
        if (detailUrl) {
          try {
            orderCode = await askBackgroundForDetailCode(detailUrl);
          } catch (e) {
            console.warn("Авито карточка не обработана:", e.message);
            orderCode = null;
          }
          await sleep(5000);
        }
      }

      if (!orderCode) {
        orderCode = ("000000" + surrogateCounter).slice(-7);
        surrogateCounter++;
      }

      const qty = extractQty(row);

      orders_data[orderCode] = {
        title,
        status: normStatus(status),
        point,
        qty
      };
    } catch (e) {
      console.warn("Ошибка при обработке заказа:", e.message);
    }
  }

  return {
    orders_data,
    scanned_count: rows.length,
    load_rounds: loaded.loadRounds,
  };
}

function getVisibleOrderRows() {
  return Array.from(document.querySelectorAll(ORDER_ROW_SELECTOR));
}

function hashOrderRow(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function getOrderRowKey(row) {
  for (const attribute of ["data-order-id", "data-id", "id"]) {
    const value = row.getAttribute(attribute);
    if (value) return `${attribute}:${value}`;
  }

  const inlineCode = extractInlineCode(row);
  if (inlineCode) return `code:${inlineCode}`;

  const orderLink = row.querySelector('a[href*="/order/"], a[href*="orderId="], a[href*="order_id="]');
  if (orderLink?.href) return `order-link:${orderLink.href}`;

  const itemLink = row.querySelector('a[href*="/item/"], a[href]')?.href || "";
  const rowText = (row.innerText || row.textContent || "").replace(/\s+/g, " ").trim();
  return `fallback:${hashOrderRow(`${itemLink}|${rowText}`)}`;
}

function captureVisibleOrderRows(target) {
  for (const row of getVisibleOrderRows()) {
    // Храним копию: Avito может удалять старые элементы из DOM при прокрутке.
    target.set(getOrderRowKey(row), row.cloneNode(true));
  }
}

function findLoadMoreOrdersButton() {
  const candidates = document.querySelectorAll('button, [role="button"]');
  return Array.from(candidates).find((button) => {
    if (button.closest(ORDER_ROW_SELECTOR)) return false;
    if (button.disabled || button.getAttribute("aria-disabled") === "true") return false;

    const label = text(button).toLowerCase();
    return /^(показать|загрузить)\s+(ещё|больше)(?:\s+\d+)?(?:\s+заказ(?:а|ов)?)?$/.test(label);
  }) || null;
}

function findOrdersScrollContainer() {
  const lastRow = getVisibleOrderRows().at(-1);
  let parent = lastRow?.parentElement || null;

  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent);
    const scrollable = /(auto|scroll)/.test(style.overflowY) &&
      parent.scrollHeight > parent.clientHeight + 20;
    if (scrollable) return parent;
    parent = parent.parentElement;
  }

  return document.scrollingElement || document.documentElement;
}

function scrollOrdersToEnd() {
  const container = findOrdersScrollContainer();
  const pageScroller = document.scrollingElement || document.documentElement;

  if (container === pageScroller || container === document.documentElement || container === document.body) {
    window.scrollTo({ top: pageScroller.scrollHeight, behavior: "auto" });
  } else {
    container.scrollTop = container.scrollHeight;
  }

  getVisibleOrderRows().at(-1)?.scrollIntoView({ block: "end", behavior: "auto" });
}

async function waitForNewOrderRows(target, previousCount, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await sleep(300);
    captureVisibleOrderRows(target);
    if (target.size > previousCount) return true;
  }
  return false;
}

async function loadAllOrderRowsAsync() {
  const capturedRows = new Map();
  const initialScrollY = window.scrollY;
  let stableRounds = 0;
  let loadRounds = 0;

  captureVisibleOrderRows(capturedRows);

  // Два прохода без новых карточек нужны для ленивой загрузки после прокрутки.
  for (let attempt = 0; attempt < 100 && stableRounds < 2; attempt++) {
    const previousCount = capturedRows.size;
    const loadMoreButton = findLoadMoreOrdersButton();

    if (loadMoreButton) {
      loadMoreButton.scrollIntoView({ block: "center", behavior: "auto" });
      loadMoreButton.click();
    } else {
      scrollOrdersToEnd();
    }

    const loadedNewRows = await waitForNewOrderRows(capturedRows, previousCount);
    if (loadedNewRows) {
      loadRounds++;
      stableRounds = 0;
      await sleep(500);
    } else {
      stableRounds++;
    }
  }

  captureVisibleOrderRows(capturedRows);
  window.scrollTo({ top: initialScrollY, behavior: "auto" });

  return {
    rows: Array.from(capturedRows.values()),
    loadRounds,
  };
}

function askBackgroundForDetailCode(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "EXTRACT_CODE_FROM_DETAIL", url }, (resp) => {
      if (!resp?.ok) return reject(new Error(resp?.error || "detail scrape failed"));
      resolve(resp.code);
    });
  });
}

function extractInlineCode(row) {
  const nodes = row.querySelectorAll("p, strong, span");

  for (const el of nodes) {
    const t = el.textContent || "";

    if (!/\u00A0/.test(t)) continue;
    const nbspCount = (t.match(/\u00A0/g) || []).length;
    if (nbspCount < 2) continue;

    const digitCount = (t.match(/\d/g) || []).length;
    if (digitCount < 8) continue;

    if (!/^[A-Za-z0-9\u00A0\s]+$/.test(t)) continue;

    const cleaned = t
      .replace(/[\s\u00A0]+/g, "")
      .toUpperCase();

    if (cleaned.length >= 10 && cleaned.length <= 18) {
      return cleaned;
    }
  }
  return null;
}

function extractQty(row) {
  let qty = 1;
  const els = row.querySelectorAll('p, span, div');
  for (const el of els) {
    const t = (el.textContent || "")
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (!t || !t.includes('товар')) continue;

    const m = t.match(/(\d+)\s*товар(?:а|ов)?/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > 0) { qty = n; break; }
    }
  }
  return qty;
}

function detectPoint(row, carrierRe) {
  const list = row.querySelectorAll("p, span, div");
  for (const el of list) {
    const t = text(el);
    if (t && carrierRe.test(t)) return t.trim();
  }
  return "";
}

function normalizePoint(s) {
  s = (s || "").toLowerCase();
  if (/авито/.test(s)) return "Авито";
  if (/(сдэк|cdek)/.test(s)) return "СДЭК";
  if (/почта\s*россии/.test(s)) return "Почта России";
  if (/boxberry/.test(s)) return "Boxberry";
  if (/dpd/.test(s)) return "DPD";
  if (/pek/.test(s)) return "PEK";
  if (/major/.test(s)) return "Major";
  if (/dhl/.test(s)) return "DHL";
  if (/(яндекс|yandex)/.test(s)) return "Yandex";
  if (/(5\s*post|5post|пятёроч)/.test(s)) return "5post";
  return s.trim() || "неизвестно";
}

function getDetailUrl(row) {
  const a = row.querySelector('a[data-qa="item-title"], a[href*="/item/"], a[href*="/order/"], a[href^="/"]') ||
            row.querySelector("a[href]");
  if (!a) return null;
  try { return new URL(a.getAttribute("href"), location.origin).toString(); }
  catch { return null; }
}

function normStatus(s) {
  s = s.trim().toLowerCase();
  if (/отправьте заказ/.test(s)) return "отправьте заказ";
  if (/получите оплату/.test(s)) return "получите оплату";
  return s;
}

function text(n) { return n?.textContent ? n.textContent.replace(/\s+/g, " ").trim() : ""; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }


// ------------------------------------------------------------
// 2) ОБЪЯВЛЕНИЯ: загрузить все страницы и собрать HTML карточек
// ------------------------------------------------------------

function isOnListingsPage() {
  try {
    const u = new URL(location.href);
    return u.protocol === "https:" &&
           (u.host === "www.avito.ru" || u.host === "m.avito.ru") &&
           (u.pathname.startsWith("/profile/pro/items") ||
            u.pathname.startsWith("/profile/items"));
  } catch { return false; }
}

function getListingRoots() {
  return Array.from(document.querySelectorAll('[data-marker^="item-snippet/"]'));
}

function listingKey(root, index) {
  return root.getAttribute("data-marker") || `listing-${index}`;
}

function collectVisibleListingBlocks(target) {
  getListingRoots().forEach((root, index) => {
    target.set(listingKey(root, index), {
      html: root.outerHTML,
      marker: root.getAttribute("data-marker") || null,
    });
  });
}

function findShowMoreButton() {
  return Array.from(document.querySelectorAll("button")).find((button) => {
    const label = text(button).toLowerCase();
    const disabled = button.disabled || button.getAttribute("aria-disabled") === "true";
    return !disabled && label === "показать ещё";
  }) || null;
}

function waitForMoreListings(previousCount, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const count = getListingRoots().length;
      if (count > previousCount) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 300);
  });
}

async function collectListingsAllPagesAsync() {
  if (!isOnListingsPage()) {
    throw new Error("Откройте страницу «Мои объявления» в личном кабинете Avito");
  }

  const blocksByMarker = new Map();
  let loadMoreClicks = 0;

  // На странице Avito кнопка «Показать ещё» добавляет следующую порцию
  // карточек в текущий DOM. Ограничение защищает от бесконечного цикла.
  for (let attempt = 0; attempt < 100; attempt++) {
    collectVisibleListingBlocks(blocksByMarker);

    const button = findShowMoreButton();
    if (!button) break;

    const previousCount = getListingRoots().length;
    button.scrollIntoView({ block: "center" });
    button.click();

    const loaded = await waitForMoreListings(previousCount);
    if (!loaded) {
      throw new Error("Avito не загрузил следующую страницу объявлений");
    }
    loadMoreClicks++;
    await sleep(500);
  }

  collectVisibleListingBlocks(blocksByMarker);

  return {
    listings: Array.from(blocksByMarker.values()),
    count: blocksByMarker.size,
    pagesLoaded: loadMoreClicks + 1,
    pageUrl: location.href,
  };
}

