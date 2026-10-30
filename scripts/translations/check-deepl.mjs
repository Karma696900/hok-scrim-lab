#!/usr/bin/env node
// Checks a DeepL key without touching the site: is it accepted, how much of the quota is used, and
// which of the languages of the site DeepL offers. Reading the quota and the languages costs nothing.
//
//   npm run translations:check                  the key of .env (DEEPL_API_KEY, or TRANSLATION_API_KEY)
//   npm run translations:check -- --translate   also translates one word ("Melee", 5 characters) to prove it works
//
// The key is read from the environment and never printed.
import { pathToFileURL } from "node:url";
import { loadConfig } from "../../src/server/config.js";
import {
  TARGETS,
  baseUrlOf,
  createDeepLProvider
} from "../../src/server/features/translations/providers/deepl.js";
import { LANGUAGES } from "../../src/shared/i18n.js";

const number = value => new Intl.NumberFormat("en").format(value);

/**
 * Runs the checks. Returns { ok, lines } (what to print) and never throws. `fetchImpl` is what talks
 * to DeepL (a test gives a fake one).
 */
export async function checkDeepL({ env = process.env, fetchImpl = fetch, translate = false } = {}) {
  const lines = [];
  const settings = loadConfig(env).translation;
  if (settings.provider !== "deepl") {
    lines.push(
      settings.provider === "off"
        ? "No DeepL key: add DEEPL_API_KEY=… to .env (a free key from https://www.deepl.com/pro-api is enough), then run this again."
        : `TRANSLATION_PROVIDER is ${settings.provider}, not deepl: this checks DeepL only.`
    );
    return { ok: false, lines };
  }
  if (!settings.apiKey) {
    lines.push("TRANSLATION_PROVIDER is deepl but there is no key: add DEEPL_API_KEY=… to .env.");
    return { ok: false, lines };
  }
  const base = baseUrlOf(settings.apiKey, settings.endpoint);
  const provider = createDeepLProvider({
    apiKey: settings.apiKey,
    endpoint: settings.endpoint,
    fetchImpl
  });
  lines.push(
    `DeepL key found (${/:fx$/.test(settings.apiKey) ? "a free key" : "not a free key"}), talking to ${new URL(base).host}.`
  );
  let ok = true;
  try {
    const usage = await provider.usage();
    lines.push(
      usage.unlimited
        ? `Quota: ${number(usage.used)} characters used this period, no limit on the account.`
        : `Quota: ${number(usage.used)} of ${number(usage.limit)} characters used this period (${Math.round((usage.used / Math.max(1, usage.limit)) * 100)}%).`
    );
    if (usage.resetsAt) {
      lines.push(`The period ends on ${new Date(usage.resetsAt).toISOString().slice(0, 10)}.`);
    }
  } catch (error) {
    ok = false;
    lines.push(
      error.kind === "auth"
        ? "DeepL refused the key: check it (a free key ends with :fx)."
        : `Could not read the quota: ${error.message}`
    );
    return { ok, lines };
  }
  try {
    const offered = new Set(await provider.languages());
    const missing = LANGUAGES.filter(language => {
      const target = TARGETS[language.code];
      return !offered.has(target) && !offered.has(target.split("-")[0]);
    });
    lines.push(
      missing.length
        ? `Languages of the site that DeepL does not offer: ${missing.map(language => language.name).join(", ")}. Their texts stay as typed.`
        : `DeepL offers all ${LANGUAGES.length} languages of the site.`
    );
  } catch (error) {
    lines.push(`Could not read the languages: ${error.message}`);
  }
  if (translate) {
    try {
      const answers = await provider.translate({
        items: [{ hash: "check", text: "Melee" }],
        languages: ["fr"]
      });
      lines.push(`Test translation: "Melee" becomes "${answers.get("check").texts.fr}" in French.`);
    } catch (error) {
      ok = false;
      lines.push(`The test translation failed: ${error.message}`);
    }
  } else {
    lines.push("Nothing was translated (add --translate to try one word).");
  }
  return { ok, lines };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok, lines } = await checkDeepL({ translate: process.argv.includes("--translate") });
  console.log(lines.join("\n"));
  process.exit(ok ? 0 : 1);
}
