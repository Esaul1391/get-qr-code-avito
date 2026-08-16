const $collect = document.getElementById("btn-collect");
const $print   = document.getElementById("btn-print"); // NEW
const $syncListings = document.getElementById("btn-sync-listings");
const $openListings = document.getElementById("btn-open-listings");
const $openOrders = document.getElementById("btn-open-orders");
const $cityFilter = document.getElementById("city-filter");
const $filterByCity = document.getElementById("filter-by-city");
const $selectedCity = document.getElementById("selected-city");
const $citySettingsStatus = document.getElementById("city-settings-status");
const $labelDirectorySettings = document.getElementById("label-directory-settings");
const $labelsDirectory = document.getElementById("labels-directory");
const $saveLabelsDirectory = document.getElementById("btn-save-labels-directory");
const $labelsDirectoryStatus = document.getElementById("labels-directory-status");
const $devBanner = document.getElementById("dev-banner");
const $devBannerText = document.getElementById("dev-banner-text");
const $hint    = document.getElementById("hint");
const btn      = document.getElementById("ping");
const status   = document.getElementById("status");

let currentMode = "none"; // "orders" | "listings" | "none"

// Данные после Collect
let lastOrders = null;

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
  if ($devBanner && $devBannerText) {
    const printEnabled = Boolean(backend.print_enabled);
    $devBannerText.textContent = printEnabled
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

function renderLabelSettings(settings, saved = false) {
  if (!$labelsDirectory || !$labelsDirectoryStatus) return;

  const directory = settings?.labels_directory || "";
  $labelsDirectory.value = settings?.is_custom ? directory : "";
  $labelsDirectory.placeholder = directory || "/home/user/AvitoLabels или C:\\AvitoLabels";
  $labelsDirectoryStatus.textContent =
    `${saved ? "Путь сохранён. " : "Текущая папка: "}${directory}` +
    "\nВнутри автоматически создаётся подпапка с датой.";
}

async function loadLabelSettings() {
  if (!$labelDirectorySettings || !$labelsDirectory || !$saveLabelsDirectory) return;

  $labelDirectorySettings.style.display = "block";
  $labelsDirectory.disabled = true;
  $saveLabelsDirectory.disabled = true;
  if ($labelsDirectoryStatus) $labelsDirectoryStatus.textContent = "Загружаю путь...";

  const response = await sendRuntimeMessage({ type: "GET_LABEL_SETTINGS" });
  if (!response?.ok) {
    if ($labelsDirectoryStatus) {
      $labelsDirectoryStatus.textContent =
        "Не удалось загрузить путь: " + (response?.error || "unknown");
    }
    return;
  }

  renderLabelSettings(response.data || {});
  $labelsDirectory.disabled = false;
  $saveLabelsDirectory.disabled = false;
}

async function persistLabelSettings() {
  if (!$labelsDirectory || !$saveLabelsDirectory || !$labelsDirectoryStatus) return;

  $labelsDirectory.disabled = true;
  $saveLabelsDirectory.disabled = true;
  $labelsDirectoryStatus.textContent = "Проверяю и сохраняю путь...";

  const value = $labelsDirectory.value.trim();
  const response = await sendRuntimeMessage({
    type: "SAVE_LABEL_SETTINGS",
    payload: { labels_directory: value || null },
  });

  $labelsDirectory.disabled = false;
  $saveLabelsDirectory.disabled = false;

  if (!response?.ok) {
    $labelsDirectoryStatus.textContent =
      "Не удалось сохранить путь: " + (response?.error || "unknown");
    return;
  }

  renderLabelSettings(response.data || {}, true);
}

init().catch(console.error);

// ------------------------ INIT ------------------------

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentMode = detectMode(tab?.url);
  await ensureBackendOnPopupOpen();

  const ok = currentMode === "orders";
  if ($collect) $collect.disabled = !ok;
  if ($collect) $collect.style.display = ok ? "block" : "none";

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
  if ($labelDirectorySettings) $labelDirectorySettings.style.display = "none";

  if (currentMode === "orders") {
    $hint.textContent = "Готово: вы на странице заказов.";
    if ($print) $print.style.display = "block"; // показываем только на orders
    await Promise.all([loadCitySettings(), loadLabelSettings()]);
  } else if (currentMode === "listings") {
    $hint.textContent = "Нажмите кнопку, чтобы загрузить все страницы и синхронизировать города объявлений.";
    if ($print) $print.style.display = "none";
  } else {
    $hint.textContent = "Откройте страницу заказов или своих объявлений на avito.ru.";
    if ($print) $print.style.display = "none";
  }

  if ($filterByCity) $filterByCity.onchange = persistCitySettings;
  if ($selectedCity) $selectedCity.onchange = persistCitySettings;
  if ($saveLabelsDirectory) $saveLabelsDirectory.onclick = persistLabelSettings;
  if ($labelsDirectory) {
    $labelsDirectory.onkeydown = (event) => {
      if (event.key === "Enter") persistLabelSettings();
    };
  }

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

      if ($print) $print.disabled = true;
      if ($openOrders) $openOrders.disabled = true;

      const type = "COLLECT_ORDERS";

      if (currentMode === "orders") {
        $hint.textContent = "Загружаю свежие заказы Avito...";
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

      }
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
