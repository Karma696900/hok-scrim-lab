import { t } from "./browser-i18n.js";
import { state } from "./app-state.js";

export async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // the error carries what the server added (retryAt: the end of a lock, that the sign-in pages write
    // in the person's own clock)
    throw Object.assign(
      new Error(data?.error || t("Request failed ({status}).", { status: response.status })),
      { code: "request_failed" },
      data,
      { status: response.status }
    );
  }
  noteServerTime(data);
  return data;
}

// The server owns the clock: deadlines are server timestamps, so the client tracks its offset.
function noteServerTime(data) {
  const serverTime = Array.isArray(data?.items) ? data.items[0]?.serverTime : data?.serverTime;
  if (Number.isFinite(serverTime)) {
    state.clockOffset = serverTime - Date.now();
  }
}

export function serverNow() {
  return Date.now() + state.clockOffset;
}

export async function fetchSeries() {
  return (await api("/api/series?pageSize=100")).items;
}

export async function fetchTierLists() {
  return (await api("/api/tier-lists?pageSize=100")).items;
}
