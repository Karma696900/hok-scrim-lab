// casino page, the creator's key: the browser that holds a roulette's key controls it (no account). The key is kept
// in this browser (localStorage `casino-key:<id>`), or in memory for the tab when the browser refuses storage; the
// control link carries it after `#`, which the browser never sends to the server.
const memory = new Map();
const slot = id => `casino-key:${id}`;
const KEY_PATTERN = /^#key=([A-Za-z0-9_-]{16,128})$/;

/** The key this browser holds for roulette `id`, or null. */
export function readKey(id) {
  try {
    return globalThis.localStorage?.getItem(slot(id)) ?? memory.get(id) ?? null;
  } catch {
    return memory.get(id) ?? null;
  }
}

/** Keeps the key of roulette `id` in this browser. */
export function saveKey(id, key) {
  memory.set(id, key);
  try {
    globalThis.localStorage?.setItem(slot(id), key);
  } catch {
    // private browsing or storage turned off: the tab keeps it in memory
  }
}

/** Drops the key of roulette `id` (the server refused it). */
export function forgetKey(id) {
  memory.delete(id);
  try {
    globalThis.localStorage?.removeItem(slot(id));
  } catch {
    // nothing kept there
  }
}

/** The key carried by a control link (`#key=…`): kept, and taken out of the address bar. Null when there is none. */
export function takeKeyFromHash(id, location, history) {
  const found = KEY_PATTERN.exec(location.hash ?? "");
  if (!found) {
    return null;
  }
  saveKey(id, found[1]);
  history.replaceState(history.state ?? null, "", `${location.pathname}${location.search ?? ""}`);
  return found[1];
}

/** The private link that gives control of roulette `id` on another device. */
export const controlLink = (id, key, origin = globalThis.location?.origin ?? "") =>
  `${origin}/casino/${id}#key=${key}`;
