import { createHash } from "node:crypto";
import { LANGUAGES, matchLanguage } from "../../../shared/i18n.js";

// The rules of the automatic translation of what the staff writes (names of stats and items,
// descriptions, notes, titles…). Pure: no network, no database. The texts stay as they were typed;
// each is translated once into every language of the site and kept next to its source, and the pages
// show the translation in the language of the visitor (see service.js and client/domain/staff-content.js).

/** Every language of the site: a text is kept in all of them (the one it is written in is itself). */
export const TARGET_LANGUAGES = LANGUAGES.map(language => language.code);
/** The longest text a form of the site accepts. */
const TEXT_MAX = 2000;
/**
 * How much of the quota of a metered account the translator may use: the key may serve other things
 * (a bot, another site), and a quota used to the last character leaves them with an error.
 */
export const QUOTA_SHARE = 0.9;

/**
 * What the translator may still send, from what an account says about its quota ({ used, limit,
 * unlimited }): Infinity when there is no limit, never below 0.
 */
export const allowanceOf = (quota, share = QUOTA_SHARE) =>
  !quota || quota.unlimited ? Infinity : Math.max(0, Math.floor(quota.limit * share) - quota.used);

/** Tries before a text that keeps failing is only tried once a week (until an administrator asks again). */
export const MAX_ATTEMPTS = 5;
const DAY = 86_400_000;

/** The key of a text: the same text gives the same key, whatever its language. */
export const textHash = text => createHash("sha256").update(text, "utf8").digest("hex");

/** A text is worth translating when it holds a letter (not a number, a sign or a unit alone). */
export const isTranslatable = text =>
  typeof text === "string" && text.length > 0 && text.length <= TEXT_MAX && /\p{L}/u.test(text);

/** The day of a moment, "2026-10-08" (UTC), for the daily budget. */
export const dayOf = moment => new Date(moment).toISOString().slice(0, 10);
export const msUntilTomorrow = moment => DAY - (moment % DAY);

// numbers written with the digits of other scripts are read as the ones we know
const DIGITS = [
  [0x0660, 0x0669], // Arabic-Indic
  [0x06f0, 0x06f9], // Extended Arabic-Indic
  [0x0e50, 0x0e59], // Thai
  [0xff10, 0xff19] // fullwidth
];
function asciiDigits(text) {
  let result = "";
  for (const char of text) {
    const code = char.codePointAt(0);
    const block = DIGITS.find(([from, to]) => code >= from && code <= to);
    result += block ? String(code - block[0]) : char;
  }
  return result;
}

/** The numbers of a text, sorted, with "," taken as a decimal point: "5%, 1,5 s" → ["1.5", "5"]. */
export function numbersOf(text) {
  return (asciiDigits(text).match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map(value => value.replace(",", "."))
    .sort();
}

/** A text with no control character and no markup (tags go whole, a stray < or > goes alone). */
const withoutMarkup = raw =>
  raw
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/<\/?[A-Za-z][^<>]*>/g, "")
    .replace(/[<>]/g, "");

/**
 * What came back for a text, checked and cleaned: { ok: true, text } or { ok: false, reason }. A
 * translation is refused when it is empty, far longer than its source, or does not have the same
 * numbers (a damage or a percentage must never change in translation).
 */
export function checkTranslation(source, raw) {
  if (typeof raw !== "string") {
    return { ok: false, reason: "no text" };
  }
  const text = withoutMarkup(raw)
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!text) {
    return { ok: false, reason: "empty" };
  }
  if (text.length > Math.max(60, source.length * 4 + 20)) {
    return { ok: false, reason: "too long" };
  }
  const wanted = numbersOf(source);
  if (wanted.length && wanted.join() !== numbersOf(text).join()) {
    return { ok: false, reason: "numbers differ" };
  }
  return { ok: true, text };
}

/** What an administrator typed as a translation: cleaned, never empty, not absurdly long. */
export function cleanManual(raw) {
  const text = typeof raw === "string" ? withoutMarkup(raw).trim() : "";
  return text && text.length <= TEXT_MAX * 2 ? text : null;
}

/** The language a provider says a text is written in, as one of ours, or null. */
export const sourceLanguageOf = value => (typeof value === "string" ? matchLanguage(value) : null);

/** When a text is tried again after its n-th failure: 5 min, 15 min, 45 min…, at most 6 hours. */
export const backoffMs = attempts =>
  Math.min(6 * 3_600_000, 5 * 60_000 * 3 ** Math.max(0, attempts - 1));

/** What happens to a row that failed: the new count, and when it is tried again (a week for good once the tries are used). */
export function afterFailure(attempts, now) {
  const next = attempts + 1;
  return { attempts: next, retryAt: now + (next >= MAX_ATTEMPTS ? 7 * DAY : backoffMs(next)) };
}

/**
 * The work to send to a provider, in requests of a reasonable size: texts that need the same
 * languages go together, at most `maxItems` of them and about `maxChars` characters of source text.
 * `entries` are { hash, text, kind, languages }.
 */
export function planBatches(entries, { maxChars = 1500, maxItems = 20 } = {}) {
  const groups = new Map();
  for (const entry of entries) {
    const key = [...entry.languages].sort().join();
    if (!groups.has(key)) {
      groups.set(key, { languages: [...entry.languages].sort(), entries: [] });
    }
    groups.get(key).entries.push(entry);
  }
  const batches = [];
  for (const { languages, entries: members } of groups.values()) {
    let items = [];
    let chars = 0;
    for (const entry of members) {
      if (items.length && (items.length >= maxItems || chars + entry.text.length > maxChars)) {
        batches.push({ languages, items });
        items = [];
        chars = 0;
      }
      items.push(entry);
      chars += entry.text.length;
    }
    if (items.length) {
      batches.push({ languages, items });
    }
  }
  return batches;
}

/** The characters a batch will be billed for: each text, once per language. */
export const charsOf = batch =>
  batch.items.reduce((sum, item) => sum + item.text.length * batch.languages.length, 0);
