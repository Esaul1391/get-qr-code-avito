const BACKEND_URL = "http://127.0.0.1:8011";
const BACKEND_INSTANCE = "codes-harvester-dev";

export async function pingBackend() {
  const res = await fetch(`${BACKEND_URL}/parse/ping`, { method: "GET" });
  if (!res.ok) throw new Error(`Ping failed: ${res.status}`);
  const backend = await res.json();
  if (backend?.instance !== BACKEND_INSTANCE) {
    throw new Error(
      `На порту 8011 запущен другой сервис: ${backend?.instance || "unknown"}`
    );
  }
  return backend;
}

async function postJson(path, payload) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST failed: ${res.status} ${text}`);
  }

  return res.json();
}

async function getJson(path) {
  const res = await fetch(`${BACKEND_URL}${path}`, { method: "GET" });
  if (!res.ok) throw new Error(`GET failed: ${res.status}`);
  return res.json();
}

export function sendOrders(payload) {
  return postJson("/parse/code_bild", payload);
}

export function syncListings(payload) {
  return postJson("/parse/listings/sync", payload);
}

export function getCitySettings() {
  return getJson("/parse/city-settings");
}

export function saveCitySettings(payload) {
  return postJson("/parse/city-settings", payload);
}

export function openListingsDirectory() {
  return postJson("/parse/listings/open-directory", {});
}

export function openOrdersDirectory() {
  return postJson("/parse/orders/open-directory", {});
}

export function printNewOrders() {
  return postJson("/parse/print/orders", {});
}
