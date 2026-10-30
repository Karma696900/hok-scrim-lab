// Translation core, shared by the browser and the server (no DOM, no Node API). The source text IS
// the key: t("Sign out"). English needs no catalog; every other language has
// public/locales/<code>.js, and i18n.test.js fails when a catalog misses a key used anywhere
// in the code (or keeps one that is no longer used). Plurals and variables use a small ICU subset:
// "{count, plural, one {# game} other {# games}}" and "{name}".

/**
 * Languages offered by the site. `rtl` flips the whole layout. `camp` is the language code Camp
 * Global uses for hero data.
 */
export const LANGUAGES = [
  { code: "en", name: "English", camp: "en" },
  { code: "fr", name: "Français", camp: "fr" },
  { code: "es", name: "Español", camp: "es" },
  { code: "pt", name: "Português", camp: "pt" },
  { code: "de", name: "Deutsch", camp: "de" },
  { code: "it", name: "Italiano", camp: "it" },
  { code: "ru", name: "Русский", camp: "ru" },
  { code: "tr", name: "Türkçe", camp: "tr" },
  { code: "id", name: "Bahasa Indonesia", camp: "id" },
  { code: "vi", name: "Tiếng Việt", camp: "vi" },
  { code: "th", name: "ไทย", camp: "th" },
  { code: "ar", name: "العربية", camp: "ar", rtl: true },
  { code: "ja", name: "日本語", camp: "ja" },
  { code: "ko", name: "한국어", camp: "ko" },
  { code: "zh", name: "简体中文", camp: "zh" }
];
export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_COOKIE = "hok_lang";
const CODES = new Set(LANGUAGES.map(language => language.code));

export const isLanguage = code => typeof code === "string" && CODES.has(code);
export const languageInfo = code =>
  LANGUAGES.find(language => language.code === code) ?? LANGUAGES[0];
export const directionOf = code => (languageInfo(code).rtl ? "rtl" : "ltr");

/** "pt-BR" → "pt", "zh-Hans-CN" → "zh", "nb" → null. */
export function matchLanguage(tag) {
  const primary = String(tag ?? "")
    .toLowerCase()
    .split(/[-_]/)[0];
  if (primary === "in") {
    return "id";
  } // legacy code still sent by some Android browsers
  return CODES.has(primary) ? primary : null;
}

/** Accept-Language → the first supported language by quality order, or null. */
export function fromAcceptLanguage(header) {
  const ranked = String(header ?? "")
    .slice(0, 400)
    .split(",")
    .map((part, index) => {
      const [tag, ...parameters] = part.trim().split(";");
      const quality = Number(
        parameters
          .map(item => item.trim())
          .find(item => item.startsWith("q="))
          ?.slice(2) ?? 1
      );
      return { tag, quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter(item => item.tag && item.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const { tag } of ranked) {
    const code = matchLanguage(tag);
    if (code) {
      return code;
    }
  }
  return null;
}

/** Saved choice first (cookie), then the browser's languages, then English. */
export function chooseLanguage({ saved, acceptLanguage, browserLanguages } = {}) {
  if (isLanguage(saved)) {
    return saved;
  }
  for (const tag of browserLanguages ?? []) {
    const code = matchLanguage(tag);
    if (code) {
      return code;
    }
  }
  return fromAcceptLanguage(acceptLanguage) ?? DEFAULT_LANGUAGE;
}

export function readCookie(header, name) {
  for (const part of String(header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return rest.join("=");
    }
  }
  return null;
}

// ---- message formatting -------------------------------------------------------------------------

function matchingBrace(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "{") {
      depth += 1;
    } else if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function pluralBranches(body) {
  const branches = {};
  let index = 0;
  while (index < body.length) {
    const open = body.indexOf("{", index);
    if (open === -1) {
      break;
    }
    const close = matchingBrace(body, open);
    if (close === -1) {
      break;
    }
    branches[body.slice(index, open).trim()] = body.slice(open + 1, close);
    index = close + 1;
  }
  return branches;
}

const rulesCache = new Map();
function pluralCategory(language, value) {
  let rules = rulesCache.get(language);
  if (!rules) {
    rules = new Intl.PluralRules(language);
    rulesCache.set(language, rules);
  }
  return rules.select(value);
}

// An Intl formatter costs a few tenths of a millisecond to build and a page asks for hundreds of numbers and dates:
// each one is built once per language and set of options.
const formatters = new Map();
function formatter(Kind, language, options) {
  const key = `${Kind.name}|${language}|${options ? JSON.stringify(options) : ""}`;
  let built = formatters.get(key);
  if (!built) {
    built = new Kind(language, options);
    formatters.set(key, built);
  }
  return built;
}

function numberFormatter(language) {
  return formatter(Intl.NumberFormat, language === "ar" ? "ar-u-nu-latn" : language);
}

/**
 * Replaces {name} and {name, plural, …} in `template`. Unknown variables are left visible so a
 * mistake shows in tests.
 */
export function format(template, params = {}, language = DEFAULT_LANGUAGE) {
  const text = String(template);
  if (!text.includes("{")) {
    return text;
  }
  let output = "";
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf("{", index);
    if (open === -1) {
      output += text.slice(index);
      break;
    }
    output += text.slice(index, open);
    const close = matchingBrace(text, open);
    if (close === -1) {
      output += text.slice(open);
      break;
    }
    const inside = text.slice(open + 1, close);
    const plural = /^\s*([\w.]+)\s*,\s*plural\s*,([\s\S]*)$/.exec(inside);
    if (plural) {
      const value = Number(params[plural[1]]);
      const branches = pluralBranches(plural[2]);
      const chosen =
        branches[`=${value}`] ?? branches[pluralCategory(language, value)] ?? branches.other ?? "";
      output += format(
        chosen.replaceAll("#", numberFormatter(language).format(value)),
        params,
        language
      );
    } else {
      const name = inside.trim();
      output += Object.hasOwn(params, name) ? String(params[name]) : `{${name}}`;
    }
    index = close + 1;
  }
  return output;
}

/**
 * A `t(key, params)` function bound to one language and its catalog (a plain object key →
 * translation). A key may end with "@@context" to tell apart two meanings of the same English word
 * ("Support@@class"): without a translation the text before the marker is shown.
 */
export function createTranslator(language, catalog = {}) {
  return (key, params) =>
    format(Object.hasOwn(catalog, key) ? catalog[key] : key.replace(/@@.*$/, ""), params, language);
}

// ---- numbers and dates (always Latin digits so clocks, scores and inputs agree in every language)

const tag = language =>
  language === "ar" ? "ar-u-nu-latn" : language === "th" ? "th-u-nu-latn-ca-gregory" : language;

export const formatNumber = (language, value, options) =>
  formatter(Intl.NumberFormat, tag(language), options).format(value);
export const formatPercent = (language, ratio, digits = 1) =>
  formatter(Intl.NumberFormat, tag(language), {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(ratio);
export function formatDate(language, value, options = { dateStyle: "medium" }) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : formatter(Intl.DateTimeFormat, tag(language), options).format(date);
}
export function formatDateTime(language, value) {
  return formatDate(language, value, { dateStyle: "medium", timeStyle: "short" });
}
/** "a, b and c" ("conjunction") or "a, b or c" ("disjunction"), as the language writes it. */
export function formatList(language, items, type = "conjunction") {
  return formatter(Intl.ListFormat, tag(language), { style: "long", type }).format(items);
}
