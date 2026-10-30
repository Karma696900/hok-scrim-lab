import { translateEachLanguage } from "./each-language.js";
import { postJson } from "./http.js";

// LibreTranslate, hosted by the owner of the site (nothing leaves their servers) or by somebody else.
// The address of the service is required; the key is only needed when the service asks for one. A
// language the installed models do not cover is refused by the service and is left untranslated.

export function createLibreTranslateProvider({
  endpoint,
  apiKey = "",
  fetchImpl = globalThis.fetch,
  timeoutMs = 60_000
}) {
  const url = `${endpoint.replace(/\/+$/, "")}/translate`;
  return {
    name: "libretranslate",
    label: "LibreTranslate",
    async translate({ items, languages }) {
      return translateEachLanguage({
        items,
        languages,
        async call(language, texts) {
          const answer = await postJson(fetchImpl, url, {
            headers: {},
            body: {
              q: texts,
              source: "auto",
              target: language,
              format: "text",
              ...(apiKey ? { api_key: apiKey } : {})
            },
            timeoutMs
          });
          const detected = answer?.detectedLanguage;
          return {
            texts: Array.isArray(answer?.translatedText) ? answer.translatedText : null,
            sources: Array.isArray(detected) ? detected.map(entry => entry?.language ?? null) : []
          };
        }
      });
    }
  };
}
