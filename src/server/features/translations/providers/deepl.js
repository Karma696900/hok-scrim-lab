import { translateEachLanguage } from "./each-language.js";
import { ProviderError, getJson, postJson } from "./http.js";

// DeepL (API v2). The free keys (they end with ":fx") and the paid ones do not use the same address.
// A request holds up to 50 texts and some context about the game (DeepL does not bill the context),
// one request is made for each language (DeepL translates into one language at a time) and the
// languages go four at a time. The quota of the account is read from DeepL itself (`usage`), so the
// translator never has to guess how much is left. A language DeepL refuses is left untranslated (the
// text is shown as typed) and says so in the administration.

/** The code DeepL knows each language of the site by. */
export const TARGETS = {
  en: "EN-US",
  fr: "FR",
  es: "ES",
  pt: "PT-BR",
  de: "DE",
  it: "IT",
  ru: "RU",
  tr: "TR",
  id: "ID",
  vi: "VI",
  th: "TH",
  ar: "AR",
  ja: "JA",
  ko: "KO",
  zh: "ZH-HANS"
};

/** What a request can hold (DeepL accepts 128 KiB: 20 000 characters is well inside it, in any script). */
export const LIMITS = { maxItems: 50, maxChars: 20_000 };

/** Told to DeepL with every request: it shapes the choice of words and is not billed. */
export const CONTEXT =
  "Honor of Kings, a mobile MOBA video game. Names, descriptions and notes of items, arcana, stats, tags and heroes, written by the game's staff.";

/** A limit that is not a real limit (DeepL answers 1 000 000 000 000 when the account has none). */
const NO_LIMIT = 1e11;

export const baseUrlOf = (apiKey, endpoint) =>
  (
    endpoint || (/:fx$/.test(apiKey) ? "https://api-free.deepl.com" : "https://api.deepl.com")
  ).replace(/\/+$/, "");

export function createDeepLProvider({
  apiKey,
  endpoint = "",
  fetchImpl = globalThis.fetch,
  timeoutMs = 60_000,
  concurrency = 4
}) {
  const base = baseUrlOf(apiKey, endpoint);
  const headers = { authorization: `DeepL-Auth-Key ${apiKey}` };
  return {
    name: "deepl",
    label: "DeepL",
    limits: LIMITS,
    async translate({ items, languages }) {
      return translateEachLanguage({
        items,
        languages,
        concurrency,
        async call(language, texts) {
          const answer = await postJson(fetchImpl, `${base}/v2/translate`, {
            headers,
            body: {
              text: texts,
              target_lang: TARGETS[language] ?? language.toUpperCase(),
              context: CONTEXT,
              preserve_formatting: true
            },
            timeoutMs
          });
          const translations = answer?.translations;
          return {
            texts: Array.isArray(translations) ? translations.map(entry => entry?.text) : null,
            sources: Array.isArray(translations)
              ? translations.map(entry => entry?.detected_source_language ?? null)
              : []
          };
        }
      });
    },
    /** The languages DeepL translates into, by their codes ("FR", "PT-BR", "ZH-HANS"…). */
    async languages() {
      const answer = await getJson(fetchImpl, `${base}/v2/languages?type=target`, {
        headers,
        timeoutMs
      });
      if (!Array.isArray(answer)) {
        throw new ProviderError("bad-answer", "The service did not list its languages.");
      }
      return answer.map(entry => String(entry?.language ?? "").toUpperCase()).filter(Boolean);
    },
    /**
     * What the account says about its quota: characters used in the current period and the limit
     * ({ used, limit, unlimited, resetsAt }). `resetsAt` is the end of the period when DeepL says it
     * (paid accounts), else null.
     */
    async usage() {
      const answer = await getJson(fetchImpl, `${base}/v2/usage`, { headers, timeoutMs });
      const used = Number(answer?.character_count);
      const limit = Number(answer?.character_limit);
      if (!Number.isFinite(used) || !Number.isFinite(limit)) {
        throw new ProviderError("bad-answer", "The service did not say how much was used.");
      }
      const end = Date.parse(answer.end_time ?? "");
      return {
        used,
        limit,
        unlimited: limit >= NO_LIMIT,
        resetsAt: Number.isFinite(end) ? end : null
      };
    }
  };
}
