// One address per language, for search engines and for shared links: /fr/heroes is the French page of
// /heroes. English, the default language, has no prefix. Used by the server (which language to answer
// in, the hreflang links, the sitemap) and by the browser (the router, the links of a page).
import { DEFAULT_LANGUAGE, LANGUAGES, isLanguage } from "./i18n.js";

/** The language a pathname names, and the page it names: `/fr/heroes` → `{ language: "fr", path: "/heroes" }`. */
export function splitLanguage(pathname) {
  const match = /^\/([a-z]{2})(?=\/|$)(.*)$/.exec(pathname);
  if (!match || !isLanguage(match[1]) || match[1] === DEFAULT_LANGUAGE) {
    return { language: null, path: pathname };
  }
  return { language: match[1], path: match[2] && match[2] !== "/" ? match[2] : "/" };
}

/** The address of `path` in `language` (the bare path for English or an unknown language). */
export function localePath(path, language) {
  if (!isLanguage(language) || language === DEFAULT_LANGUAGE) {
    return path;
  }
  return path === "/" ? `/${language}` : `/${language}${path}`;
}

/** The address of `path` in every language, English first. */
export const alternates = path =>
  LANGUAGES.map(({ code }) => ({ language: code, path: localePath(path, code) }));
