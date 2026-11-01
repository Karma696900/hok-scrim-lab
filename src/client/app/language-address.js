// The address keeps the language of the page: /fr/heroes while the site is in French, /heroes in English
// (shared/locale-path.js). The pages write bare addresses (history.pushState(null, "", "/items/12")); the
// language prefix is added here, in one place, so that no page has to know about it.
import { LANGUAGE_COOKIE } from "../../shared/i18n.js";
import { localePath, splitLanguage } from "../../shared/locale-path.js";
import { currentLanguage } from "./browser-i18n.js";

/** `path` (with its query and hash) in the language of the page; an address that names a language is kept. */
export function addressOf(path, language = currentLanguage()) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    return path;
  }
  const at = path.search(/[?#]/);
  const pathname = at === -1 ? path : path.slice(0, at);
  const rest = at === -1 ? "" : path.slice(at);
  if (splitLanguage(pathname).language) {
    return path;
  }
  return localePath(pathname, language) + rest;
}

/** Every address a page writes into the history carries the language of the page. */
export function keepLanguageInAddresses() {
  for (const name of ["pushState", "replaceState"]) {
    const original = history[name].bind(history);
    history[name] = (data, unused, url) =>
      original(data, unused, url == null ? url : addressOf(String(url)));
  }
}

/** Another language: remembered, and the same page opened at its address in that language. */
export function changeLanguage(code) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LANGUAGE_COOKIE}=${code}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  const page = splitLanguage(location.pathname).path;
  location.assign(localePath(page, code) + location.search + location.hash);
}
