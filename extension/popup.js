const $collect = document.getElementById("btn-collect");
const $send    = document.getElementById("btn-send");
const $print   = document.getElementById("btn-print"); // NEW
const $syncListings = document.getElementById("btn-sync-listings");
const $openListings = document.getElementById("btn-open-listings");
const $openOrders = document.getElementById("btn-open-orders");
const $cityFilter = document.getElementById("city-filter");
const $filterByCity = document.getElementById("filter-by-city");
const $selectedCity = document.getElementById("selected-city");
const $citySettingsStatus = document.getElementById("city-settings-status");
const $devBanner = document.getElementById("dev-banner");
const $hint    = document.getElementById("hint");
const btn      = document.getElementById("ping");
const status   = document.getElementById("status");
const $summary = document.getElementById("summary");

let currentMode = "none"; // "orders" | "reviews" | "listings" | "none"

// Данные после Collect
let lastOrders = null;
let lastReviews = null;

function sendRuntimeMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

async function ensureBackendOnPopupOpen() {
  if (!status) return false;

  status.textContent = "Проверяю и запускаю DEV backend на порту 8011...";
  status.className = "";
  const response = await sendRuntimeMessage({ type: "ENSURE_BACKEND" });

  if (!response?.ok) {
    status.textContent = "Backend не запустился: " + (response?.error || "unknown");
    status.className = "err";
    return false;
  }

  status.textContent = response.data?.started
    ? "DEV backend запущен автоматически ✔"
    : "DEV backend доступен на порту 8011 ✔";
  status.className = "ok";

  const backend = response.data?.backend || {};
  if ($devBanner) {
    const printEnabled = Boolean(backend.print_enabled);
    $devBanner.textContent = printEnabled
      ? "DEV · порт 8011 · ВНИМАНИЕ: печать включена"
      : "DEV · порт 8011 · печать отключена";
    $devBanner.classList.toggle("print-enabled", printEnabled);
    if ($print) {
      $print.textContent = printEnabled ? "Печатать этикетки" : "Проверить печать";
    }
  }
  return true;
}

function formatCityCounts(cityCounts) {
  const counts = cityCounts || {};
  return `Москва: ${Number(counts["Москва"]) || 0}, Энгельс: ${Number(counts["Энгельс"]) || 0}`;
}

async function loadCitySettings() {
  if (!$cityFilter || !$filterByCity || !$selectedCity || !$citySettingsStatus) return;

  $cityFilter.style.display = "block";
  $filterByCity.disabled = true;
  $selectedCity.disabled = true;
  $citySettingsStatus.textContent = "Загружаю настройки...";

  const response = await sendRuntimeMessage({ type: "GET_CITY_SETTINGS" });
  if (!response?.ok) {
    $citySettingsStatus.textContent = "Не удалось загрузить настройки: " + (response?.error || "unknown");
    return;
  }

  const settings = response.data || {};
  $filterByCity.checked = Boolean(settings.filter_enabled);
  $selectedCity.value = settings.selected_city || "Москва";
  $filterByCity.disabled = false;
  $selectedCity.disabled = false;
  $citySettingsStatus.textContent =
    `Синхронизировано: ${Number(settings.listings_count) || 0}. ` +
    formatCityCounts(settings.city_counts);
}

async function persistCitySettings() {
  if (!$filterByCity || !$selectedCity || !$citySettingsStatus) return;

  $filterByCity.disabled = true;
  $selectedCity.disabled = true;
  $citySettingsStatus.textContent = "Сохраняю...";

  const response = await sendRuntimeMessage({
    type: "SAVE_CITY_SETTINGS",
    payload: {
      filter_enabled: $filterByCity.checked,
      selected_city: $selectedCity.value,
    },
  });

  $filterByCity.disabled = false;
  $selectedCity.disabled = false;

  if (!response?.ok) {
    $citySettingsStatus.textContent = "Не удалось сохранить: " + (response?.error || "unknown");
    return;
  }

  const settings = response.data || {};
  $citySettingsStatus.textContent =
    `Настройки сохранены. Объявлений: ${Number(settings.listings_count) || 0}. ` +
    formatCityCounts(settings.city_counts);
}

init().catch(console.error);

// ------------------------ SUMMARY UI ------------------------

function hideSummary() {
  if (!$summary) return;
  $summary.style.display = "none";
  $summary.innerHTML = "";
}

function renderSummary(selectionData) {
  if (!$summary) return;

  if (!Array.isArray(selectionData) || selectionData.length === 0) {
    $summary.style.display = "block";
    $summary.innerHTML = `
      <h4>Сводка по отзывам</h4>
      <div class="muted">Нет “прибыльных” товаров (backend мог отфильтровать результаты).</div>
    `;
    return;
  }

  const rows = selectionData
    .filter(x => Array.isArray(x) && x.length >= 2)
    .map(([title, cnt]) => `
      <div class="summary-item">
        <div>${escapeHtml(String(title))}</div>
        <div class="badge">${Number(cnt) || 0}</div>
      </div>
    `)
    .join("");

  $summary.style.display = "block";
  $summary.innerHTML = `
    <h4>Сводка по отзывам (top)</h4>
    ${rows}
    <div class="muted" style="margin-top:8px;">
      Число справа — сколько раз товар встретился в отзывах.
    </div>
  `;
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ------------------------ INIT ------------------------

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentMode = detectMode(tab?.url);
  await ensureBackendOnPopupOpen();

  const ok = currentMode === "orders" || currentMode === "reviews";
  if ($collect) $collect.disabled = !ok;
  if ($collect) $collect.style.display = ok ? "block" : "none";

  if ($send) $send.disabled = true;

  hideSummary();

  if ($print) {
    $print.disabled = true;
    $print.style.display = "none";
  }

  if ($syncListings) {
    $syncListings.disabled = currentMode !== "listings";
    $syncListings.style.display = currentMode === "listings" ? "block" : "none";
  }

  if ($openListings) {
    const showOpenListings = currentMode === "orders" || currentMode === "listings";
    $openListings.style.display = showOpenListings ? "block" : "none";
    $openListings.disabled = !showOpenListings;
  }

  if ($openOrders) {
    $openOrders.style.display = currentMode === "orders" ? "block" : "none";
    $openOrders.disabled = true;
  }

  if ($cityFilter) $cityFilter.style.display = "none";

  if (currentMode === "orders") {
    $hint.textContent = "Готово: вы на странице заказов.";
    if ($send) $send.style.display = "none";
    if ($print) $print.style.display = "block"; // показываем только на orders
    await loadCitySettings();
  } else if (currentMode === "reviews") {
    $hint.textContent = "Готово: вы на странице отзывов продавца.";
    if ($send) $send.style.display = "block";
    if ($print) $print.style.display = "none";
  } else if (currentMode === "listings") {
    $hint.textContent = "Нажмите кнопку, чтобы загрузить все страницы и синхронизировать города объявлений.";
    if ($send) $send.style.display = "none";
    if ($print) $print.style.display = "none";
  } else {
    $hint.textContent = "Откройте страницу заказов, отзывов или своих объявлений на avito.ru.";
    if ($send) $send.style.display = "none";
    if ($print) $print.style.display = "none";
  }

  if ($filterByCity) $filterByCity.onchange = persistCitySettings;
  if ($selectedCity) $selectedCity.onchange = persistCitySettings;

  if ($openListings) {
    $openListings.onclick = async () => {
      $openListings.disabled = true;
      const response = await sendRuntimeMessage({ type: "OPEN_LISTINGS_DIRECTORY" });
      $openListings.disabled = false;

      if (!response?.ok) {
        $hint.textContent = "Не удалось открыть папку: " + (response?.error || "unknown");
        return;
      }

      $hint.textContent = "Папка с синхронизированными объявлениями открыта ✔";
    };
  }

  if ($openOrders) {
    $openOrders.onclick = async () => {
      if (currentMode !== "orders") return;

      $openOrders.disabled = true;
      const response = await sendRuntimeMessage({ type: "OPEN_ORDERS_DIRECTORY" });

      if (!response?.ok) {
        $hint.textContent = "Не удалось открыть папку заказов: " + (response?.error || "unknown");
        $openOrders.disabled = false;
        return;
      }

      $hint.textContent = "Папка с заказами за сегодня открыта ✔";
      $openOrders.disabled = false;
    };
  }

  if ($syncListings) {
    $syncListings.onclick = async () => {
      if (currentMode !== "listings" || !tab?.id) return;

      $syncListings.disabled = true;
      $hint.textContent = "Загружаю все страницы объявлений...";

      try {
        const collected = await chrome.tabs.sendMessage(tab.id, { type: "COLLECT_LISTINGS" });
        if (!collected?.ok) {
          throw new Error(collected?.error || "Не удалось собрать объявления");
        }

        const listings = Array.isArray(collected.listings) ? collected.listings : [];
        if (listings.length === 0) {
          throw new Error("На странице не найдено ни одного объявления");
        }

        $hint.textContent = `Собрано объявлений: ${listings.length}. Сохраняю на backend...`;
        const saved = await sendRuntimeMessage({
          type: "SYNC_LISTINGS",
          payload: {
            source: "avito",
            collectedAt: Date.now(),
            pageUrl: collected.pageUrl || tab.url || null,
            listings,
          },
        });

        if (!saved?.ok) {
          throw new Error(saved?.error || "Backend не сохранил объявления");
        }

        const result = saved.data || {};
        const conflicts = Array.isArray(result.conflicts) ? result.conflicts.length : 0;
        $hint.textContent =
          `Синхронизация завершена ✔\n` +
          `Сохранено: ${Number(result.saved_count) || 0}. ${formatCityCounts(result.city_counts)}.` +
          (result.ignored_count ? ` Не распознано: ${result.ignored_count}.` : "") +
          (conflicts ? ` Конфликтующих названий: ${conflicts}.` : "");
      } catch (error) {
        console.error(error);
        $hint.textContent = "Ошибка синхронизации: " + (error?.message || String(error));
      } finally {
        $syncListings.disabled = false;
      }
    };
  }

  if ($collect) {
    $collect.onclick = async () => {
      if (!ok || !tab?.id) return;

      hideSummary();

      if ($print) $print.disabled = true;
      if ($openOrders) $openOrders.disabled = true;

      const type = currentMode === "orders" ? "COLLECT_ORDERS" : "COLLECT_REVIEWS";

      if (currentMode === "orders") {
        $hint.textContent = "Загружаю всю историю заказов Avito...";
      }

      let resp;
      try {
        resp = await chrome.tabs.sendMessage(tab.id, { type });
      } catch (e) {
        console.error(e);
        $hint.textContent =
          "Не удалось связаться с контент-скриптом.\n" +
          "Обнови страницу Avito и попробуй ещё раз.";
        return;
      }

      if (!resp?.ok) {
        $hint.textContent = "Ошибка: " + (resp?.error || "unknown");
        return;
      }

      // ---------------- ORDERS ----------------
      if (currentMode === "orders") {
        lastOrders = resp.orders_data || {};
        const count = Object.keys(lastOrders).length;
        const scannedCount = Number(resp.scanned_count) || count;

        $hint.textContent =
          `Просмотрено заказов: ${scannedCount}. Подготовлено к сбору: ${count}. ` +
          "Отправляю на backend...";

        const payload = {
          orders_data: lastOrders,
          source: "avito",
          collectedAt: Date.now(),
          pageUrl: tab.url || null,
        };

        chrome.runtime.sendMessage({ type: "SEND_ORDERS", payload }, (r) => {
          if (!r?.ok) {
            $hint.textContent = "Не отправилось на backend: " + (r?.error || "unknown");
            if ($print) $print.disabled = true;
            if ($openOrders) $openOrders.disabled = true;
            return;
          }

          const result = r.data || {};
          const selectedCount = Number.isInteger(result.selected_count)
            ? result.selected_count
            : count;

          if (result.filter_enabled) {
            const unmatchedCount = Number(result.unmatched_count) || 0;
            $hint.textContent =
              `Город: ${result.selected_city}. Подготовлено заказов: ${selectedCount} из ${count}.` +
              (unmatchedCount ? ` Без привязки к городу: ${unmatchedCount}.` : "");
          } else {
            $hint.textContent = `Отправлено на backend ✔ (заказов: ${selectedCount})`;
          }

          if ($print) $print.disabled = selectedCount === 0;
          if ($openOrders) $openOrders.disabled = selectedCount === 0;
        });

        return;
      }

      // ---------------- REVIEWS (RAW) ----------------
      lastReviews = Array.isArray(resp.reviews) ? resp.reviews : [];
      const count = lastReviews.length;

      $hint.textContent = `Собрано отзывов (raw): ${count}.`;
      if ($send) $send.disabled = count === 0;
    };
  }

  if ($send) {
    $send.onclick = async () => {
      if (currentMode !== "reviews") return;
      if (!tab?.id) return;

      const reviews = Array.isArray(lastReviews) ? lastReviews : [];
      const count = reviews.length;

      if (count === 0) {
        $hint.textContent = "Нечего отправлять: сначала нажми Collect.";
        return;
      }

      hideSummary();
      $hint.textContent = `Отправляю отзывы на backend... (count: ${count})`;

      const payload = {
        source: "avito",
        collectedAt: Date.now(),
        pageUrl: tab.url || null,
        reviews,
      };

      chrome.runtime.sendMessage({ type: "SEND_FEEDBACK", payload }, (r) => {
        if (!r?.ok) {
          $hint.textContent = "Не отправилось на backend: " + (r?.error || "unknown");
          return;
        }

        const selectionData = r?.data?.data || null;

        $hint.textContent = `Отправлено отзывов ✔ (sent: ${count})`;
        renderSummary(selectionData);
      });
    };
  }

  if ($print) {
    $print.onclick = () => {
      if (currentMode !== "orders") return;

      const count = lastOrders ? Object.keys(lastOrders).length : 0;
      if (count === 0) {
        $hint.textContent = "Нечего печатать: сначала нажми Collect.";
        $print.disabled = true;
        return;
      }

      $hint.textContent = "Отправляю команду печати на backend...";
      $print.disabled = true; // защита от дабл-клика

      chrome.runtime.sendMessage({ type: "PRINT_ORDERS" }, (r) => {
        if (!r?.ok) {
          $hint.textContent = "Печать не выполнена: " + (r?.error || "unknown");
          // вернём кнопку назад, чтобы можно было повторить
          $print.disabled = false;
          return;
        }

        const printed = r?.data?.printed;
        const dryRun = Boolean(r?.data?.dry_run);
        if (dryRun) {
          const matched = Number(r?.data?.matched_labels) || 0;
          $hint.textContent =
            `Тест печати завершён ✔ Найдено этикеток: ${matched}. ` +
            "Физическая печать в DEV-режиме отключена.";
          $print.disabled = false;
          return;
        }

        if (typeof printed === "number") {
          const printer = r?.data?.printer;
          if (printed === 0) {
            $hint.textContent = "За сегодняшний день нет этикеток для печати.";
          } else {
            $hint.textContent =
              `Печать выполнена ✔ (отправлено этикеток: ${printed}` +
              (printer ? `, принтер: ${printer}` : "") +
              ")";
          }
        } else {
          $hint.textContent = "Печать выполнена ✔";
        }

        // Оставляем кнопку активной, если требуется повторная печать.
        $print.disabled = false;
      });
    };
  }
}

// ------------------------ URL DETECTION ------------------------

function detectMode(url) {
  if (!url) return "none";
  try {
    const u = new URL(url);
    if (isOrdersUrl(u))  return "orders";
    if (isReviewsUrl(u)) return "reviews";
    if (isListingsUrl(u)) return "listings";
    return "none";
  } catch {
    return "none";
  }
}

function isListingsUrl(u) {
  return (
    u.protocol === "https:" &&
    (u.host === "www.avito.ru" || u.host === "m.avito.ru") &&
    (u.pathname.startsWith("/profile/pro/items") ||
     u.pathname.startsWith("/profile/items"))
  );
}

function isOrdersUrl(u) {
  return (
    u.protocol === "https:" &&
    (u.host === "www.avito.ru" || u.host === "m.avito.ru") &&
    u.pathname.startsWith("/orders")
  );
}

function isReviewsUrl(u) {
  if (!(u.host === "www.avito.ru" || u.host === "m.avito.ru")) return false;

  if (u.pathname.startsWith("/brands/") && u.searchParams.has("sellerId")) {
    return true;
  }

  if (
    /\/user\//.test(u.pathname) &&
    (u.search.includes("review") || /review|otzyv|otzyvy/i.test(u.pathname))
  ) {
    return true;
  }

  return false;
}

// ------------------------ PING BUTTON ------------------------

if (btn && status) {
  btn.addEventListener("click", () => {
    status.textContent = "Проверка...";
    status.className = "";

    chrome.runtime.sendMessage({ type: "ENSURE_BACKEND" }, (response) => {
      if (!response) {
        status.textContent = "Нет ответа от background";
        status.className = "err";
        return;
      }

      if (response.ok) {
        status.textContent = "DEV backend доступен на порту 8011 ✔";
        status.className = "ok";
      } else {
        status.textContent = `Ошибка: ${response.error}`;
        status.className = "err";
      }
    });
  });
}
