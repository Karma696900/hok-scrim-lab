import { createAnthropicProvider } from "./anthropic.js";
import { createDeepLProvider } from "./deepl.js";
import { createLibreTranslateProvider } from "./libretranslate.js";

export const PROVIDERS = ["anthropic", "deepl", "libretranslate"];

/** Which providers need what: a key, an address. */
export const REQUIREMENTS = {
  anthropic: { key: true, endpoint: false },
  deepl: { key: true, endpoint: false },
  libretranslate: { key: false, endpoint: true }
};

/**
 * The provider the configuration asks for, or null when the automatic translation is off.
 * `settings` is config.translation ({ provider, apiKey, endpoint, model }).
 */
export function createProvider(settings, { fetchImpl = globalThis.fetch } = {}) {
  switch (settings?.provider) {
    case "anthropic":
      return createAnthropicProvider({
        apiKey: settings.apiKey,
        model: settings.model || undefined,
        endpoint: settings.endpoint || undefined,
        fetchImpl
      });
    case "deepl":
      return createDeepLProvider({
        apiKey: settings.apiKey,
        endpoint: settings.endpoint,
        fetchImpl
      });
    case "libretranslate":
      return createLibreTranslateProvider({
        endpoint: settings.endpoint,
        apiKey: settings.apiKey,
        fetchImpl
      });
    default:
      return null;
  }
}
