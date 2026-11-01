// The language of a page and its address (shared/locale-path.js): /fr/heroes is the French page of /heroes.
import { localePath, splitLanguage } from "../../../shared/locale-path.js";
import { requestLanguage } from "../server-i18n.js";
import { PRERENDER_HEADER } from "./prerender.js";
import { alternateLinks } from "./page-handler-seo.js";

/**
 * The canonical address of a page (in its language) and, for a page search engines may list, the links to the
 * same page in the other languages.
 */
export function addressesOf(base, request, info) {
  const page = request.path === "/" ? "/" : request.path.replace(/\/+$/, "");
  return {
    canonical: `${base}${localePath(page, request.addressLanguage)}`,
    alternates: info.index && info.status === 200 ? `\n    ${alternateLinks(base, page)}` : ""
  };
}

/**
 * The language of every request: taken from the address when it names one, and the rest of the server sees the
 * page alone (request.originalUrl keeps the prefix); else the saved choice or the browser's language.
 */
export function languageOfRequest(request, response, next) {
  const { language: addressed, path: page } = splitLanguage(request.path);
  if (addressed) {
    request.addressLanguage = addressed;
    const query = request.url.indexOf("?");
    request.url = page + (query === -1 ? "" : request.url.slice(query));
  }
  request.language = requestLanguage(request);
  response.vary("Accept-Language");
  response.vary("Cookie");
  next();
}

/**
 * A person reading in another language, at an address without one, is sent to the same page at the address of
 * their language. A crawler (no cookie, no Accept-Language) and the prerenderer stay on the English page.
 * True when the answer was sent.
 */
export function sentToLanguageAddress(request, response, language, prerender) {
  if (
    request.addressLanguage ||
    language === "en" ||
    !(request.method === "GET" || request.method === "HEAD") ||
    (prerender && request.headers[PRERENDER_HEADER] === prerender.token)
  ) {
    return false;
  }
  const query = request.originalUrl.indexOf("?");
  response.set("Cache-Control", "no-store");
  response.redirect(
    302,
    localePath(request.path, language) + (query === -1 ? "" : request.originalUrl.slice(query))
  );
  return true;
}

/** Internal links of a page in another language than English carry its prefix (/fr/heroes). */
const INTERNAL_LINK =
  /(<a\b[^>]*?\shref=")(\/(?!\/|api\/|auth\/|assets\/|locales\/)[^"?#.]*)(?=["?#])/g;
export const localizeLinks = (html, language) =>
  language === "en"
    ? html
    : html.replace(INTERNAL_LINK, (_match, start, path) => start + localePath(path, language));
