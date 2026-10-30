// What the staff writes (names of stats and items, descriptions, notes, titles of situations…) is kept
// as it was typed, and the server translates it in the background into every language of the site
// (features/translations). This module holds what was translated into the language of the page and
// gives the translation of a text, or the text itself while it has none: a page never waits for a
// translation, and a text that nobody translated is simply shown as typed.
import { currentLanguage } from "../app/browser-i18n.js";

let words = new Map();
let loading = null;

/** The text in the language of the page: its translation, or itself. */
export const tx = text => (typeof text === "string" ? (words.get(text) ?? text) : text);

/** Longest wait for the dictionary: after that the page is drawn with the texts as typed. */
const WAIT_MS = 4000;

/**
 * Asks for the translations of the language of the page, once. Resolves when they are there, or when
 * they could not be had (the texts are then shown as typed, and the next page asks again); it never
 * rejects and never waits for more than a few seconds.
 */
export function contentReady() {
  loading ??= fetch(`/api/content-translations?lang=${encodeURIComponent(currentLanguage())}`, {
    credentials: "same-origin",
    signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(WAIT_MS) : undefined
  })
    .then(response => (response.ok ? response.json() : null))
    .then(body => {
      if (body) {
        words = new Map(Object.entries(body.texts ?? {}));
      } else {
        loading = null;
      }
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

/** A translation was corrected on this very page: the next page asks again. */
export function forgetContent() {
  loading = null;
}
