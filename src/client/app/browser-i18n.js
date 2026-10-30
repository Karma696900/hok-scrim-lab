// Browser side of the translations: the active language, its catalog (loaded once, before the first
// render) and t().
import {
  createTranslator,
  DEFAULT_LANGUAGE,
  directionOf,
  formatDate,
  formatDateTime,
  formatList,
  formatNumber,
  formatPercent,
  isLanguage,
  languageInfo
} from "../../shared/i18n.js";

let active = { language: DEFAULT_LANGUAGE, translate: createTranslator(DEFAULT_LANGUAGE) };

/** t("Source text", { name: value }) — the source text is the key. */
export const t = (key, params) => active.translate(key, params);
export const currentLanguage = () => active.language;

let collation = { language: "", collator: null };
/** Puts two texts in the alphabetical order of the active language (capitals and accents do not count). */
export function compareText(a, b) {
  if (collation.language !== active.language) {
    collation = {
      language: active.language,
      collator: new Intl.Collator(active.language, { sensitivity: "base" })
    };
  }
  return collation.collator.compare(a, b);
}

export const number = (value, options) => formatNumber(active.language, value, options);
export const percentage = (ratio, digits) => formatPercent(active.language, ratio, digits);
export const date = value => formatDate(active.language, value);
export const dateTime = value => formatDateTime(active.language, value);
/** "a, b and c" (type "conjunction") or "a, b or c" (type "disjunction"). */
export const list = (items, type) => formatList(active.language, items, type);

/** Downloads the catalog of `language` (English needs none) and makes it the active one. */
export async function useLanguage(language) {
  const code = isLanguage(language) ? language : DEFAULT_LANGUAGE;
  let catalog = {};
  if (code !== DEFAULT_LANGUAGE) {
    try {
      catalog = (await import(`/locales/${code}.js`)).default;
    } catch {
      /* offline or missing catalog: English texts */
    }
  }
  active = { language: code, translate: createTranslator(code, catalog) };
  // The server already wrote both on <html>. Writing them again, even with the same value, makes the browser
  // work out the style of the whole page again (the rules that read :lang()): only a change is written.
  const root = document.documentElement;
  const direction = directionOf(code);
  if (root.lang !== code) {
    root.lang = code;
  }
  if (root.dir !== direction) {
    root.dir = direction;
  }
  return code;
}

export { languageInfo };
