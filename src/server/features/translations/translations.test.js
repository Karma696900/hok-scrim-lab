// The automatic translation of what the staff writes: the rules (pure), the three providers (against
// a fake server, never a real service), the translator (a scripted provider, a real database) and the
// routes. Nothing here is ever sent to a real translation service.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { assertRuntimeConfig, loadConfig } from "../../config.js";
import {
  MAX_ATTEMPTS,
  TARGET_LANGUAGES,
  afterFailure,
  backoffMs,
  charsOf,
  checkTranslation,
  cleanManual,
  dayOf,
  isTranslatable,
  numbersOf,
  planBatches,
  textHash
} from "./translation-domain.js";
import { createAnthropicProvider } from "./providers/anthropic.js";
import { createDeepLProvider } from "./providers/deepl.js";
import { ProviderError, objectIn } from "./providers/http.js";
import { createLibreTranslateProvider } from "./providers/libretranslate.js";
import { createProvider } from "./providers/translation-providers.js";
import { gatherTexts } from "./sources.js";
import { startTestServer } from "../../../testing/test-app.js";

const other = TARGET_LANGUAGES.filter(code => code !== "en");

// ---- the rules -------------------------------------------------------------------------------------------------
describe("what is translated, and what a translation must be (pure)", () => {
  test("a text is worth translating when it holds a letter", () => {
    for (const text of ["Max HP", "Mêlée", "最大生命", "الحد الأقصى", "5% HP", "x2 damage"]) {
      assert.equal(isTranslatable(text), true, text);
    }
    for (const text of ["", "5", "+12%", "—", "3.5 / 4", "  ", null, undefined, 7]) {
      assert.equal(isTranslatable(text), false, String(text));
    }
    assert.equal(isTranslatable("a".repeat(2000)), true);
    assert.equal(isTranslatable("a".repeat(2001)), false, "no form accepts more");
  });

  test("the same text is the same key, a different one is not", () => {
    assert.equal(textHash("Max HP"), textHash("Max HP"));
    assert.notEqual(textHash("Max HP"), textHash("max hp"));
    assert.notEqual(textHash("Max HP"), textHash("Max HP "));
    assert.match(textHash("é"), /^[0-9a-f]{64}$/);
  });

  test("the numbers of a text, whatever the digits and the decimal sign", () => {
    assert.deepEqual(numbersOf("Deals 5% of 1,5 s and 20"), ["1.5", "20", "5"]);
    assert.deepEqual(numbersOf("يسبب ٥٪ من ٢٠"), ["20", "5"], "Arabic-Indic digits");
    assert.deepEqual(numbersOf("ダメージ１２"), ["12"], "fullwidth digits");
    assert.deepEqual(numbersOf("ความเสียหาย ๓๐"), ["30"], "Thai digits");
    assert.deepEqual(numbersOf("no number"), []);
  });

  test("a translation is accepted when it keeps the numbers", () => {
    assert.deepEqual(checkTranslation("Deals 5% damage", "Inflige 5 % de dégâts"), {
      ok: true,
      text: "Inflige 5 % de dégâts"
    });
    assert.equal(checkTranslation("Lasts 1.5 s", "Dure 1,5 s").ok, true, "a decimal comma");
    assert.equal(checkTranslation("Deals 5%", "يسبب ٥٪").ok, true, "other digits");
    assert.equal(checkTranslation("Melee", "Mêlée").ok, true, "no number to keep");
  });

  test("a translation is refused when it changed a number, is empty, or is absurdly long", () => {
    assert.deepEqual(checkTranslation("Deals 5% damage", "Inflige 3 % de dégâts"), {
      ok: false,
      reason: "numbers differ"
    });
    assert.deepEqual(checkTranslation("Deals 5% damage", "Inflige de dégâts"), {
      ok: false,
      reason: "numbers differ"
    });
    assert.equal(checkTranslation("Melee", "").reason, "empty");
    assert.equal(checkTranslation("Melee", "  \u0007 ").reason, "empty");
    assert.equal(checkTranslation("Melee", null).reason, "no text");
    assert.equal(checkTranslation("Melee", 42).reason, "no text");
    assert.equal(checkTranslation("Melee", "x".repeat(200)).reason, "too long");
    assert.equal(checkTranslation("Melee", "x".repeat(60)).ok, true, "short sources get some room");
  });

  test("what is written in a translation is cleaned: no markup, no control characters", () => {
    assert.equal(checkTranslation("Melee", "  <b>Mêlée</b> \u0000 ").text, "Mêlée");
    assert.equal(
      checkTranslation("A", "a < b > c").text,
      "a b c",
      "a stray sign goes, the words stay"
    );
    assert.equal(checkTranslation("Melee", "Mêlée").text, "Mêlée", "composed characters");
    assert.equal(checkTranslation("A", "a\t\t b\nc").text, "a b\nc", "tabs fold, line breaks stay");
    assert.equal(cleanManual("  Mêlée <i> "), "Mêlée");
    assert.equal(cleanManual(""), null);
    assert.equal(cleanManual(7), null);
    assert.equal(cleanManual("x".repeat(4001)), null);
  });

  test("a failure is tried again later, a little further each time, and given up for a week", () => {
    assert.equal(backoffMs(1), 300_000);
    assert.equal(backoffMs(2), 900_000);
    assert.equal(backoffMs(3), 2_700_000);
    assert.equal(backoffMs(9), 6 * 3_600_000, "at most six hours");
    assert.deepEqual(afterFailure(0, 1000), { attempts: 1, retryAt: 1000 + 300_000 });
    const last = afterFailure(MAX_ATTEMPTS - 1, 1000);
    assert.equal(last.attempts, MAX_ATTEMPTS);
    assert.equal(last.retryAt, 1000 + 7 * 86_400_000, "left alone until an administrator asks");
  });

  test("the day of the budget is the UTC day", () => {
    assert.equal(dayOf(Date.UTC(2026, 9, 8, 23, 59, 59)), "2026-10-08");
    assert.equal(dayOf(Date.UTC(2026, 9, 9, 0, 0, 0)), "2026-10-09");
  });

  test("requests are cut by language set, number of texts and size", () => {
    const entry = (n, languages, text = `text ${n}`) => ({
      hash: `h${n}`,
      text,
      kind: "item",
      languages
    });
    const all = other.slice(0, 3);
    const batches = planBatches([
      entry(1, all),
      entry(2, all),
      entry(3, ["th"]),
      entry(4, all, "x".repeat(1600)),
      entry(5, all)
    ]);
    assert.deepEqual(
      batches.map(batch => [batch.languages.join(), batch.items.map(item => item.hash).join()]),
      [
        [[...all].sort().join(), "h1,h2"],
        [[...all].sort().join(), "h4"],
        [[...all].sort().join(), "h5"],
        ["th", "h3"]
      ],
      "a long text goes alone; texts that need other languages go apart"
    );
    const many = planBatches(Array.from({ length: 45 }, (_, n) => entry(n, ["fr"])));
    assert.deepEqual(
      many.map(batch => batch.items.length),
      [20, 20, 5]
    );
    assert.equal(
      charsOf({ languages: ["fr", "es"], items: [entry(1, [], "abcd"), entry(2, [], "xy")] }),
      12
    );
  });
});

describe("where the texts are (pure)", () => {
  test("every text the staff writes, with what it is, once each, numbers and signs left out", () => {
    const found = gatherTexts({
      stats: [
        { name: "Max HP", options_json: "[]" },
        {
          name: "Attack range",
          options_json: JSON.stringify([
            { id: 1, name: "Melee" },
            { id: 2, name: "Ranged" }
          ])
        }
      ],
      tags: [
        { name: "Marksman", description: "Shoots from afar" },
        { name: "", description: "" }
      ],
      items: [
        {
          name: "Bow of dusk",
          description: "A bow.",
          effects_json: JSON.stringify([{ kind: "passive", name: "Pierce", text: "Deals 5% HP." }]),
          stats_json: JSON.stringify([
            { statId: 1, value: 10, note: "after the active" },
            { statId: 1, value: 5, note: "" }
          ])
        }
      ],
      arcana: [
        {
          name: "Zeal",
          description: "",
          stats_json: JSON.stringify([{ statId: 1, value: 2, note: "Zeal note" }])
        }
      ],
      profiles: [
        {
          skills_json: JSON.stringify([
            {
              key: "1",
              name: "Quick Shot",
              costLabel: "Mana",
              notes: "Cannot crit.",
              components: [
                { label: "Damage", text: "Per arrow." },
                { label: "12", text: "" }
              ]
            }
          ])
        }
      ],
      builds: [{ name: "Dusk build", note: "Early game." }],
      combos: [
        {
          name: "Opener",
          note: "Start here",
          steps_json: JSON.stringify([
            { skillId: "1", hint: "then dash" },
            { skillId: "2", hint: "" }
          ])
        }
      ],
      scenarios: [
        {
          title: "Dragon fight",
          brief: "Who takes it?",
          pins_json: JSON.stringify([
            { id: "a", type: "camp", label: "Dragon" },
            { id: "b", type: "hero" }
          ])
        }
      ],
      maps: [{ name: "Summoner map" }]
    });
    assert.deepEqual(Object.fromEntries(found), {
      "Max HP": "stat",
      "Attack range": "stat",
      Melee: "option",
      Ranged: "option",
      Marksman: "tag",
      "Shoots from afar": "tag-note",
      "Bow of dusk": "item",
      "A bow.": "item-note",
      Pierce: "effect",
      "Deals 5% HP.": "effect-text",
      "after the active": "line-note",
      Zeal: "arcana",
      "Zeal note": "line-note",
      Mana: "cost",
      "Cannot crit.": "skill-note",
      Damage: "detail",
      "Per arrow.": "detail",
      "Dusk build": "build",
      "Early game.": "build-note",
      Opener: "combo",
      "Start here": "combo-note",
      "then dash": "hint",
      "Dragon fight": "situation",
      "Who takes it?": "situation-text",
      Dragon: "pin",
      "Summoner map": "map"
    });
  });

  test("a text used twice is one text; the first place says what it is; damaged JSON is ignored", () => {
    const found = gatherTexts({
      stats: [{ name: "Range", options_json: "{not json" }],
      items: [{ name: "Range", description: "", effects_json: null, stats_json: 12 }],
      tags: [],
      combos: [{ name: "x", note: "", steps_json: "oops" }]
    });
    assert.deepEqual(
      [...found],
      [
        ["Range", "stat"],
        ["x", "combo"]
      ]
    );
    assert.deepEqual([...gatherTexts({})], []);
  });
});

// ---- the providers, against a fake service -------------------------------------------------------------------------------
/** A fetch that answers with what a test gives, and keeps what it was asked. */
function fakeFetch(...answers) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = options?.body ? JSON.parse(options.body) : null;
    calls.push({ url, headers: options.headers, body });
    const next = answers.length > 1 ? answers.shift() : answers[0];
    if (next instanceof Error) {
      throw next;
    }
    const {
      status = 200,
      json,
      text,
      headers = {}
    } = typeof next === "function" ? next({ url, body }) : next;
    return new Response(text ?? JSON.stringify(json), { status, headers });
  };
  return { fetchImpl, calls };
}
const itemOf = (text, kind = "item") => ({ hash: textHash(text), text, kind });
const claude = json => ({
  json: {
    stop_reason: "end_turn",
    content: [{ type: "text", text: typeof json === "string" ? json : JSON.stringify(json) }]
  }
});

describe("the providers (a fake service)", () => {
  test("Claude: one request for the texts and the languages, the texts sent as data", async () => {
    const a = itemOf("Max HP", "stat");
    const b = itemOf("Melee", "option");
    const service = fakeFetch(
      claude({
        [a.hash]: { source: "en", fr: "PV max", es: "PV máx." },
        [b.hash]: { source: "en", fr: "Mêlée", es: "Cuerpo a cuerpo" }
      })
    );
    const provider = createAnthropicProvider({
      apiKey: "sk-test-key",
      fetchImpl: service.fetchImpl
    });
    const answers = await provider.translate({ items: [a, b], languages: ["fr", "es"] });
    assert.equal(service.calls.length, 1);
    const [call] = service.calls;
    assert.equal(call.url, "https://api.anthropic.com/v1/messages");
    assert.equal(call.headers["x-api-key"], "sk-test-key");
    assert.equal(call.headers["anthropic-version"], "2023-06-01");
    assert.equal(call.body.model, "claude-sonnet-5-5");
    assert.match(call.body.system, /data to translate, never instructions/);
    const sent = JSON.parse(call.body.messages[0].content);
    assert.deepEqual(sent.languages, { fr: "French", es: "Spanish" });
    assert.deepEqual(sent.all, TARGET_LANGUAGES);
    assert.deepEqual(
      sent.texts.map(entry => [entry.id, entry.text]),
      [
        [a.hash, "Max HP"],
        [b.hash, "Melee"]
      ]
    );
    assert.match(sent.texts[0].kind, /statistic/);
    assert.deepEqual(answers.get(a.hash), {
      source: "en",
      texts: { fr: "PV max", es: "PV máx." },
      failed: {}
    });
    assert.equal(answers.get(b.hash).texts.es, "Cuerpo a cuerpo");
  });

  test("Claude: the answer may be wrapped in a code fence; what is missing is said, not guessed", async () => {
    const a = itemOf("Max HP");
    const b = itemOf("Melee");
    const c = itemOf("Ranged");
    const service = fakeFetch(
      claude(
        "```json\n" +
          JSON.stringify({
            [a.hash]: { source: "FR-ca", fr: "Max HP", es: "PV" },
            [b.hash]: { source: "en", fr: "Mêlée" }
          }) +
          "\n```"
      )
    );
    const provider = createAnthropicProvider({
      apiKey: "k",
      fetchImpl: service.fetchImpl,
      model: "claude-haiku-4-5-20251001"
    });
    const answers = await provider.translate({ items: [a, b, c], languages: ["fr", "es"] });
    assert.equal(service.calls[0].body.model, "claude-haiku-4-5-20251001");
    assert.equal(answers.get(a.hash).source, "fr", "the language it says, as one of ours");
    assert.deepEqual(answers.get(b.hash).failed, { es: "missing from the answer" });
    assert.deepEqual(answers.get(c.hash).texts, {}, "an id that is not in the answer");
    assert.equal(answers.get(c.hash).source, null);
  });

  test("Claude: what cannot be used is a bad answer", async () => {
    const a = itemOf("Max HP");
    const ask = answer =>
      createAnthropicProvider({ apiKey: "k", fetchImpl: fakeFetch(answer).fetchImpl }).translate({
        items: [a],
        languages: ["fr"]
      });
    await assert.rejects(ask(claude("Sorry, I cannot do that.")), { kind: "bad-answer" });
    await assert.rejects(
      ask({ json: { stop_reason: "max_tokens", content: [{ type: "text", text: "{" }] } }),
      { kind: "bad-answer" }
    );
    await assert.rejects(ask({ text: "<html>", status: 200 }), { kind: "bad-answer" });
    await assert.rejects(ask({ json: { content: [] } }), { kind: "bad-answer" });
  });

  test("the answers of a service that refuses, is busy or is down", async () => {
    const a = itemOf("Max HP");
    const kindOf = async answer => {
      const provider = createAnthropicProvider({
        apiKey: "k",
        fetchImpl: fakeFetch(answer).fetchImpl
      });
      return provider.translate({ items: [a], languages: ["fr"] }).then(
        () => null,
        error => ({
          kind: error.kind,
          retryAfterMs: error.retryAfterMs,
          message: error.message,
          isError: error instanceof ProviderError
        })
      );
    };
    assert.equal(
      (await kindOf({ status: 401, json: { error: { message: "invalid x-api-key" } } })).kind,
      "auth"
    );
    assert.match(
      (await kindOf({ status: 401, json: { error: { message: "invalid x-api-key" } } })).message,
      /invalid x-api-key/
    );
    assert.equal((await kindOf({ status: 403, json: {} })).kind, "auth");
    const busy = await kindOf({ status: 429, json: {}, headers: { "retry-after": "30" } });
    assert.deepEqual([busy.kind, busy.retryAfterMs], ["rate", 30_000]);
    assert.equal(
      (await kindOf({ status: 429, json: {} })).retryAfterMs,
      60_000,
      "a minute when it does not say"
    );
    assert.equal((await kindOf({ status: 529, json: {} })).kind, "unavailable");
    assert.equal((await kindOf({ status: 500, text: "oops" })).kind, "unavailable");
    const refused = await kindOf({ status: 400, json: { error: { message: "model: not found" } } });
    assert.deepEqual([refused.kind, refused.isError], ["bad-request", true]);
    assert.match(refused.message, /model: not found/);
    assert.equal((await kindOf(new TypeError("fetch failed"))).kind, "unavailable");
  });

  test("the key is never in an error", async () => {
    const provider = createAnthropicProvider({
      apiKey: "sk-secret-value",
      fetchImpl: fakeFetch({ status: 401, json: { error: { message: "bad key" } } }).fetchImpl
    });
    const error = await provider
      .translate({ items: [itemOf("Max HP")], languages: ["fr"] })
      .catch(found => found);
    assert.doesNotMatch(JSON.stringify([error.message, error.stack]), /sk-secret-value/);
  });

  test("DeepL: the address follows the key, one request for each language, the language of a text is not translated into itself", async () => {
    const a = itemOf("Max HP");
    const b = itemOf("Mêlée");
    const service = fakeFetch(({ body }) => ({
      json: {
        translations: body.text.map(text => ({
          detected_source_language: text === "Mêlée" ? "FR" : "EN",
          text: `${text} → ${body.target_lang}`
        }))
      }
    }));
    const provider = createDeepLProvider({ apiKey: "abc:fx", fetchImpl: service.fetchImpl });
    const answers = await provider.translate({ items: [a, b], languages: ["es", "zh", "fr"] });
    assert.deepEqual(
      service.calls.map(call => [call.url, call.body.target_lang, call.body.text]),
      [
        ["https://api-free.deepl.com/v2/translate", "ES", ["Max HP", "Mêlée"]],
        ["https://api-free.deepl.com/v2/translate", "ZH-HANS", ["Max HP", "Mêlée"]],
        ["https://api-free.deepl.com/v2/translate", "FR", ["Max HP"]]
      ],
      "once the first answer says that a text is French it is not asked to become French"
    );
    assert.equal(service.calls[0].headers.authorization, "DeepL-Auth-Key abc:fx");
    assert.equal(answers.get(a.hash).source, "en");
    assert.deepEqual(answers.get(a.hash).texts, {
      es: "Max HP → ES",
      zh: "Max HP → ZH-HANS",
      fr: "Max HP → FR"
    });
    assert.equal(answers.get(b.hash).source, "fr");
    assert.deepEqual(
      answers.get(b.hash).texts,
      { es: "Mêlée → ES", zh: "Mêlée → ZH-HANS", fr: "Mêlée" },
      "its own language: unchanged"
    );
  });

  test("DeepL: a paid key and an address of one's own; a language it refuses fails alone", async () => {
    const a = itemOf("Max HP");
    const service = fakeFetch(({ body }) =>
      body.target_lang === "TH"
        ? { status: 400, json: { message: "Value for 'target_lang' not supported." } }
        : {
            json: {
              translations: [
                { detected_source_language: "EN", text: `${body.text[0]} ${body.target_lang}` }
              ]
            }
          }
    );
    const answers = await createDeepLProvider({
      apiKey: "paid-key",
      fetchImpl: service.fetchImpl
    }).translate({
      items: [a],
      languages: ["th", "fr"]
    });
    assert.equal(service.calls[0].url, "https://api.deepl.com/v2/translate");
    assert.match(answers.get(a.hash).failed.th, /not supported/);
    assert.equal(answers.get(a.hash).texts.fr, "Max HP FR", "the next language is still done");
    const mine = fakeFetch({ json: { translations: [{ text: "x" }] } });
    await createDeepLProvider({
      apiKey: "k:fx",
      endpoint: "https://deepl.example.test/",
      fetchImpl: mine.fetchImpl
    }).translate({
      items: [a],
      languages: ["fr"]
    });
    assert.equal(mine.calls[0].url, "https://deepl.example.test/v2/translate");
    const short = createDeepLProvider({
      apiKey: "k",
      fetchImpl: fakeFetch({ json: { translations: [] } }).fetchImpl
    });
    await assert.rejects(short.translate({ items: [a], languages: ["fr"] }), {
      kind: "bad-answer"
    });
  });

  test("LibreTranslate: the service of the owner, the texts as a list, the language detected", async () => {
    const a = itemOf("Max HP");
    const service = fakeFetch(({ body }) => ({
      json: {
        translatedText: body.q.map(text => `${text}/${body.target}`),
        detectedLanguage: body.q.map(() => ({ confidence: 90, language: "en" }))
      }
    }));
    const provider = createLibreTranslateProvider({
      endpoint: "http://libretranslate:5000/",
      apiKey: "lt-key",
      fetchImpl: service.fetchImpl
    });
    const answers = await provider.translate({ items: [a], languages: ["fr", "de"] });
    assert.equal(service.calls[0].url, "http://libretranslate:5000/translate");
    assert.deepEqual(service.calls[0].body, {
      q: ["Max HP"],
      source: "auto",
      target: "fr",
      format: "text",
      api_key: "lt-key"
    });
    assert.deepEqual(answers.get(a.hash), {
      source: "en",
      texts: { fr: "Max HP/fr", de: "Max HP/de" },
      failed: {}
    });
    const open = fakeFetch({ json: { translatedText: ["x"] } });
    await createLibreTranslateProvider({
      endpoint: "http://lt",
      fetchImpl: open.fetchImpl
    }).translate({ items: [a], languages: ["fr"] });
    assert.equal("api_key" in open.calls[0].body, false, "no key when the service asks for none");
  });

  test("the provider the configuration asks for", () => {
    assert.equal(createProvider({ provider: "off" }), null);
    assert.equal(createProvider({ provider: "other" }), null);
    assert.equal(createProvider({ provider: "anthropic", apiKey: "k" }).name, "anthropic");
    assert.match(
      createProvider({ provider: "anthropic", apiKey: "k", model: "claude-haiku-4-5-20251001" })
        .label,
      /haiku/
    );
    assert.equal(createProvider({ provider: "deepl", apiKey: "k" }).name, "deepl");
    assert.equal(
      createProvider({ provider: "libretranslate", endpoint: "http://lt" }).name,
      "libretranslate"
    );
    assert.deepEqual(objectIn('noise {"a": 1} more'), { a: 1 });
    assert.equal(objectIn("[1]"), null);
    assert.equal(objectIn("{broken"), null);
  });

  test("the configuration: off by default, and a provider needs what it needs", () => {
    const check = env => () => assertRuntimeConfig(loadConfig({ DB_PASSWORD: "x", ...env }));
    assert.doesNotThrow(check({}));
    assert.doesNotThrow(check({ TRANSLATION_PROVIDER: "off" }));
    assert.doesNotThrow(check({ TRANSLATION_PROVIDER: "anthropic", TRANSLATION_API_KEY: "k" }));
    assert.doesNotThrow(
      check({ TRANSLATION_PROVIDER: "libretranslate", TRANSLATION_ENDPOINT: "http://lt" })
    );
    assert.throws(check({ TRANSLATION_PROVIDER: "anthropic" }), /TRANSLATION_API_KEY is not set/);
    assert.throws(check({ TRANSLATION_PROVIDER: "deepl" }), /TRANSLATION_API_KEY/);
    assert.throws(check({ TRANSLATION_PROVIDER: "libretranslate" }), /TRANSLATION_ENDPOINT/);
    assert.throws(
      check({ TRANSLATION_PROVIDER: "babel", TRANSLATION_API_KEY: "k" }),
      /must be off, anthropic, deepl, libretranslate/
    );
    const config = loadConfig({ TRANSLATION_DAILY_CHARS: "1000", TRANSLATION_SWEEP_SECONDS: "60" });
    assert.deepEqual(
      [config.translation.provider, config.translation.dailyChars, config.translation.sweepSeconds],
      ["off", 1000, 60]
    );
    assert.equal(
      loadConfig({}).translation.dailyChars,
      null,
      "no daily limit unless one is written"
    );
    assert.equal(
      loadConfig({ TRANSLATION_DAILY_CHARS: "lots" }).translation.dailyChars,
      null,
      "an unreadable number is no limit written"
    );
  });
});

// ---- the translator, with a database ---------------------------------------------------------------------------------------
/**
 * A provider that is scripted: "FR: …" texts are in French, every other text is in English, a
 * translation is "<text> [<language>]". `behave(items, languages)` may throw or change an answer.
 */
function scripted({ behave = null } = {}) {
  const calls = [];
  return {
    calls,
    name: "scripted",
    label: "Scripted",
    async translate({ items, languages }) {
      calls.push({ texts: items.map(item => item.text), languages: [...languages] });
      const forced = behave ? await behave(items, languages) : null;
      if (forced instanceof Map) {
        return forced;
      }
      const answers = new Map();
      for (const item of items) {
        const french = item.text.startsWith("FR:");
        const texts = {};
        for (const language of languages) {
          if (!(french && language === "fr")) {
            texts[language] = `${item.text} [${language}]`;
          }
        }
        answers.set(item.hash, { source: french ? "fr" : "en", texts, failed: {} });
      }
      return answers;
    }
  };
}

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

/**
 * A translator of its own on the test database, with the clock and the provider a test gives. Every
 * language is asked for (a translator only works for the languages somebody asked for: the tests of
 * the languages themselves are in translations-languages.test.js).
 */
async function translatorOf(
  provider,
  { dailyChars = 1_000_000, clock = { at: Date.parse("2026-10-08T10:00:00Z") }, ask = true } = {}
) {
  // dynamic import so that the module is read after the skip decision
  const { createTranslationService } = await import("./translation-service.js");
  const service = createTranslationService({
    store: app.store,
    provider,
    config: { dailyChars },
    now: () => clock.at
  });
  if (ask) {
    await service.wantAll();
  }
  return service;
}
async function reset() {
  await app.store.pool.query("DELETE FROM content_texts");
  await app.store.pool.query("DELETE FROM translation_usage");
  for (const table of [
    "catalog_items",
    "catalog_arcana",
    "hero_build_sets",
    "hero_combos",
    "training_scenarios",
    "training_maps",
    "tags",
    "game_stats",
    "hero_profiles"
  ]) {
    await app.store.pool.query(`DELETE FROM ${table}`);
  }
}
const addStat = (name, options = []) =>
  app.store.pool.execute(
    "INSERT INTO game_stats (name, unit, sort_order, options_json) VALUES (?, ?, 0, ?)",
    [name, options.length ? "choice" : "flat", JSON.stringify(options)]
  );
const rowsOf = async text => {
  const [rows] = await app.store.pool.query(
    "SELECT c.language, c.text, c.status, c.origin, c.error, c.attempts, c.retry_at FROM content_translations c JOIN content_texts t ON t.hash = c.hash WHERE t.text = ? ORDER BY c.language",
    [text]
  );
  return Object.fromEntries(rows.map(row => [row.language, row]));
};

describe("the translator (database, scripted provider)", { skip }, () => {
  test("the texts are kept for every language and translated once; a second round has nothing to do", async () => {
    await reset();
    await addStat("Attack range", [
      { id: 1, name: "Melee" },
      { id: 2, name: "Ranged" }
    ]);
    const provider = scripted();
    const service = await translatorOf(provider);
    const first = await service.sweep();
    assert.deepEqual([first.added, first.stopped], [3, null]);
    assert.equal(first.translated, 3 * 15, "every language of every text");
    const range = await rowsOf("Attack range");
    assert.equal(Object.keys(range).length, 15);
    assert.deepEqual(
      [range.fr.text, range.fr.status, range.fr.origin],
      ["Attack range [fr]", "ok", "machine"]
    );
    assert.deepEqual(
      [range.en.text, range.en.origin],
      ["Attack range", "source"],
      "its own language is itself"
    );
    assert.equal(provider.calls.length, 1, "one request for the three texts");
    assert.deepEqual(
      provider.calls[0].languages,
      [...TARGET_LANGUAGES].sort(),
      "the language of a text is not known before the answer"
    );
    const again = await service.sweep();
    assert.deepEqual(
      [again.texts, again.translated, provider.calls.length],
      [0, 0, 1],
      "nothing new, nothing asked"
    );
    assert.deepEqual(await app.store.contentDictionary("fr"), {
      "Attack range": "Attack range [fr]",
      Melee: "Melee [fr]",
      Ranged: "Ranged [fr]"
    });
    assert.deepEqual(
      await app.store.contentDictionary("en"),
      {},
      "English is the text itself: nothing to say"
    );
  });

  test("a text written in another language is kept as it is there and translated into the others, English included", async () => {
    await reset();
    await addStat("FR: Portée");
    const service = await translatorOf(scripted());
    await service.sweep();
    const rows = await rowsOf("FR: Portée");
    assert.deepEqual([rows.fr.origin, rows.fr.text], ["source", "FR: Portée"]);
    assert.equal(rows.en.text, "FR: Portée [en]");
    assert.deepEqual(await app.store.contentDictionary("fr"), {});
    assert.deepEqual(await app.store.contentDictionary("en"), { "FR: Portée": "FR: Portée [en]" });
    const [[text]] = await app.store.pool.query(
      "SELECT source_language FROM content_texts WHERE text = 'FR: Portée'"
    );
    assert.equal(text.source_language, "fr");
  });

  test("a text that changes is a new text: the old one and its translations go", async () => {
    await reset();
    await addStat("Max HP");
    const service = await translatorOf(scripted());
    await service.sweep();
    await app.store.pool.query("UPDATE game_stats SET name = 'Maximum HP'");
    const round = await service.sweep();
    assert.deepEqual([round.added, round.removed], [1, 1]);
    assert.deepEqual(Object.keys(await app.store.contentDictionary("fr")), ["Maximum HP"]);
    assert.equal(Object.keys(await rowsOf("Max HP")).length, 0);
  });

  test("a translation written by an administrator is never replaced by the provider", async () => {
    await reset();
    await addStat("Melee");
    const hash = textHash("Melee");
    // the administrator corrects the French while the request for it is on its way
    let once = true;
    const provider = scripted({
      behave: async () => {
        if (once) {
          once = false;
          await app.store.contentSetManual(hash, "fr", "Corps à corps", 5);
        }
        return null;
      }
    });
    const service = await translatorOf(provider);
    await service.sweep();
    const rows = await rowsOf("Melee");
    assert.deepEqual(
      [rows.fr.text, rows.fr.origin, rows.fr.status],
      ["Corps à corps", "manual", "ok"]
    );
    assert.equal(rows.es.text, "Melee [es]", "the other languages came back");
    // back to the automatic translation
    assert.equal(await app.store.contentReset(hash, "fr", 6), true);
    assert.equal((await rowsOf("Melee")).fr.status, "pending");
    await service.sweep();
    assert.deepEqual(
      [(await rowsOf("Melee")).fr.text, (await rowsOf("Melee")).fr.origin],
      ["Melee [fr]", "machine"]
    );
  });

  test("a text kept as typed is the same in every language", async () => {
    await reset();
    await addStat("Flowborn Blade");
    const service = await translatorOf(scripted());
    await service.sweep();
    assert.equal(await app.store.contentKeep(textHash("Flowborn Blade"), 7), true);
    assert.equal(await app.store.contentKeep(textHash("nothing"), 7), false);
    const rows = await rowsOf("Flowborn Blade");
    assert.ok(
      Object.values(rows).every(row => row.text === "Flowborn Blade" && row.origin === "manual")
    );
    assert.deepEqual(await app.store.contentDictionary("de"), {}, "nothing to translate");
  });

  test("a translation that changed a number is refused, said so, and tried again later", async () => {
    await reset();
    await addStat("Deals 5% damage");
    const clock = { at: Date.parse("2026-10-08T10:00:00Z") };
    const wrong = scripted({
      behave: (items, languages) =>
        new Map(
          items.map(item => [
            item.hash,
            {
              source: "en",
              texts: Object.fromEntries(
                languages.map(code => [
                  code,
                  code === "fr" ? "Inflige 3 % de dégâts" : `${item.text} [${code}]`
                ])
              ),
              failed: {}
            }
          ])
        )
    });
    const service = await translatorOf(wrong, { clock });
    const round = await service.sweep();
    assert.deepEqual([round.translated, round.failed], [14, 1]);
    const fr = (await rowsOf("Deals 5% damage")).fr;
    assert.deepEqual(
      [fr.status, fr.error, fr.attempts, fr.text],
      ["failed", "numbers differ", 1, null]
    );
    assert.equal(Number(fr.retry_at), clock.at + 300_000);
    assert.deepEqual(
      await app.store.contentDictionary("fr"),
      {},
      "the visitors still read the text as typed"
    );
    // too early: nothing is asked
    assert.equal((await service.sweep()).texts, 0);
    // later, the provider does it right
    clock.at += 301_000;
    const better = scripted();
    const later = await translatorOf(better, { clock });
    await later.sweep();
    assert.deepEqual(better.calls[0].languages, ["fr"], "only the language that failed");
    assert.equal((await rowsOf("Deals 5% damage")).fr.text, "Deals 5% damage [fr]");
  });

  test("an administrator can ask again at once", async () => {
    await reset();
    await addStat("Deals 5% damage");
    const failing = scripted({
      behave: (items, languages) =>
        new Map(
          items.map(item => [
            item.hash,
            {
              source: "en",
              texts: {},
              failed: Object.fromEntries(languages.map(code => [code, "not offered"]))
            }
          ])
        )
    });
    const service = await translatorOf(failing);
    await service.sweep();
    assert.equal((await service.status()).total.failed, 14);
    assert.equal(await app.store.contentRetry("fr", 9), 1, "one language");
    assert.equal((await app.store.contentList({ language: "fr", state: "pending" })).total, 1);
    assert.equal(await app.store.contentRetry(null, 9), 13, "the others");
  });

  test("the service that does not answer: nothing is lost, the round stops, and after three times it waits", async () => {
    await reset();
    await addStat("Max HP");
    const down = scripted({
      behave: () => {
        throw new ProviderError("unavailable", "The service cannot be reached.");
      }
    });
    const clock = { at: Date.parse("2026-10-08T10:00:00Z") };
    const service = await translatorOf(down, { clock });
    for (let time = 1; time <= 3; time += 1) {
      const round = await service.sweep();
      assert.equal(round.stopped, "unavailable");
      assert.equal(round.failed, 0, "no row is spoilt");
    }
    assert.equal((await service.status()).total.pending, 15);
    assert.equal((await service.status()).paused.reason, "unavailable");
    const calls = down.calls.length;
    assert.equal((await service.sweep()).stopped, "paused");
    assert.equal(down.calls.length, calls, "no request while it waits");
    clock.at += 11 * 60_000;
    assert.equal((await service.sweep()).stopped, "unavailable", "after the pause it tries again");
  });

  test("a refused key stops everything until it is changed", async () => {
    await reset();
    await addStat("Max HP");
    const refused = scripted({
      behave: () => {
        throw new ProviderError("auth", "The service refused the key: invalid x-api-key");
      }
    });
    const service = await translatorOf(refused);
    assert.equal((await service.sweep()).stopped, "refused");
    assert.equal((await service.sweep()).stopped, "refused");
    assert.equal(refused.calls.length, 1, "asked once, not again");
    const status = await service.status();
    assert.match(status.refused, /refused the key/);
    assert.equal(status.total.pending, 15, "the texts are still tracked, waiting");
    service.resume();
    await service.sweep();
    assert.equal(refused.calls.length, 2, "tried again once the key was said to be fixed");
  });

  test("a service that asks to slow down is left alone for as long as it says", async () => {
    await reset();
    await addStat("Max HP");
    const clock = { at: Date.parse("2026-10-08T10:00:00Z") };
    const busy = scripted({
      behave: () => {
        throw new ProviderError("rate", "slow down", { retryAfterMs: 120_000 });
      }
    });
    const service = await translatorOf(busy, { clock });
    assert.equal((await service.sweep()).stopped, "paused");
    clock.at += 60_000;
    assert.equal((await service.sweep()).stopped, "paused");
    assert.equal(busy.calls.length, 1);
    clock.at += 61_000;
    await service.sweep();
    assert.equal(busy.calls.length, 2);
  });

  test("the daily limit: nothing more is sent today, and the usual work comes back tomorrow", async () => {
    await reset();
    await addStat("Max HP");
    await addStat("Armor");
    const clock = { at: Date.parse("2026-10-08T10:00:00Z") };
    const provider = scripted();
    // "Max HP" and "Armor" are 11 characters, asked in 15 languages: 165
    const service = await translatorOf(provider, { dailyChars: 100, clock });
    const first = await service.sweep();
    assert.deepEqual(
      [first.stopped, provider.calls.length],
      ["limit", 0],
      "the two texts together would pass the limit"
    );
    assert.equal((await service.status()).paused.reason, "daily limit");
    assert.equal((await service.sweep()).stopped, "paused");
    clock.at = Date.parse("2026-10-09T00:00:01Z");
    const second = await service.sweep();
    assert.equal(
      second.stopped,
      "limit",
      "the batch is still more than the limit: the limit is what it says"
    );
    const rich = await translatorOf(provider, { dailyChars: 200, clock });
    await rich.sweep();
    assert.equal(provider.calls.length, 1);
    assert.equal(
      (await rich.status()).usedToday,
      11 * 15,
      "what was sent is counted: each text, once per language"
    );
  });

  test("a batch that cannot be read is cut in two: only the culprit fails", async () => {
    await reset();
    for (const name of ["Max HP", "Poison", "Armor", "Speed"]) {
      await addStat(name);
    }
    const picky = scripted({
      behave: items => {
        if (items.some(item => item.text === "Poison")) {
          throw new ProviderError("bad-answer", "The answer is not a JSON object.");
        }
        return null;
      }
    });
    const service = await translatorOf(picky);
    const round = await service.sweep();
    assert.equal(round.stopped, null);
    const status = await service.status();
    assert.equal(status.total.failed, 15, "only Poison, in every language");
    assert.equal((await rowsOf("Poison")).fr.status, "failed");
    assert.equal((await rowsOf("Armor")).fr.status, "ok");
    assert.equal((await rowsOf("Speed")).fr.status, "ok");
    assert.ok(picky.calls.length >= 4, "the batch was cut down to the text that spoils it");
  });

  test("with no provider the texts are still tracked, waiting, for the administrators to translate by hand", async () => {
    await reset();
    await addStat("Max HP");
    const service = await translatorOf(null);
    const round = await service.sweep();
    assert.deepEqual([round.added, round.stopped, service.enabled()], [1, "off", false]);
    const status = await service.status();
    assert.deepEqual([status.provider, status.texts, status.total.pending], [null, 1, 15]);
    assert.deepEqual(await app.store.contentDictionary("fr"), {});
  });

  test("two rounds at once: the second leaves the work to the first", async () => {
    await reset();
    await addStat("Max HP");
    const provider = scripted();
    const service = await translatorOf(provider);
    const [one, two] = await Promise.all([service.sweep(), service.sweep()]);
    assert.equal(one, two, "the same round");
    assert.equal(provider.calls.length, 1);
    const lock = await app.store.contentLock();
    assert.ok(lock);
    assert.equal(await app.store.contentLock(), null, "one holder at a time");
    await lock.release();
    const again = await app.store.contentLock();
    assert.ok(again, "free again once released");
    await again.release();
  });

  test("the texts of every place the staff writes are translated", async () => {
    await reset();
    const [{ insertId: heroItem }] = await app.store.pool.execute(
      "INSERT INTO catalog_items (name, category, price, image_id, description, effects_json, stats_json, updated_at) VALUES ('Bow of dusk', 'regular', NULL, NULL, 'A bow.', ?, ?, 1)",
      [
        JSON.stringify([
          { kind: "passive", name: "Pierce", text: "Deals 5% HP.", cooldownSeconds: null }
        ]),
        JSON.stringify([{ statId: 1, value: 1, note: "after the active" }])
      ]
    );
    assert.ok(heroItem);
    await app.store.pool.execute(
      "INSERT INTO tags (name, color, description, conflicts_json) VALUES ('Marksman', 'red', 'Shoots from afar', '[]')"
    );
    await app.store.pool.execute(
      "INSERT INTO hero_combos (id, hero_id, position, name, note, steps_json, created_at, updated_at) VALUES (UUID(), 'h01', 0, 'Opener', 'Start here', ?, 1, 1)",
      [JSON.stringify([{ skillId: "1", hint: "then dash" }])]
    );
    const service = await translatorOf(scripted());
    const round = await service.sweep();
    assert.equal(round.added, 10);
    const french = await app.store.contentDictionary("fr");
    assert.deepEqual(
      Object.keys(french).sort(),
      [
        "A bow.",
        "Bow of dusk",
        "Deals 5% HP.",
        "Marksman",
        "Opener",
        "Pierce",
        "Shoots from afar",
        "Start here",
        "after the active",
        "then dash"
      ].sort()
    );
  });

  test("a situation that is not published is not read: its words never reach the public dictionary", async () => {
    await reset();
    const map = "00000000-0000-4000-8000-0000000000a1";
    await app.store.pool.execute(
      "INSERT INTO training_maps (id, name, mime, data, width, height, created_by, created_at) VALUES (?, 'Jungle', 'image/png', 'x', 10, 10, 'someone', 1)",
      [map]
    );
    const scenario = (id, title, brief, published) =>
      app.store.pool.execute(
        "INSERT INTO training_scenarios (id, map_id, title, brief, pins_json, published, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'someone', 1, 1)",
        [id, map, title, brief, JSON.stringify([{ label: `${title} pin` }]), published]
      );
    await scenario("00000000-0000-4000-8000-0000000000b1", "Dragon fight", "Who takes it?", 1);
    await scenario("00000000-0000-4000-8000-0000000000b2", "Secret plan", "Not ready yet", 0);
    const service = await translatorOf(scripted());
    await service.sweep();
    const words = Object.keys(await app.store.contentDictionary("fr"));
    assert.ok(words.includes("Dragon fight") && words.includes("Who takes it?"));
    assert.ok(words.includes("Jungle"), "a map is public");
    assert.ok(
      !words.some(word => word.includes("Secret plan") || word === "Not ready yet"),
      "the title, the brief and the pins of a draft stay out"
    );

    // published later: read at the next round; taken back: gone with its translations
    await app.store.pool.execute(
      "UPDATE training_scenarios SET published = 1 WHERE title = 'Secret plan'"
    );
    await service.sweep();
    assert.ok(Object.keys(await app.store.contentDictionary("fr")).includes("Secret plan"));
    await app.store.pool.execute(
      "UPDATE training_scenarios SET published = 0 WHERE title = 'Secret plan'"
    );
    await service.sweep();
    assert.ok(!Object.keys(await app.store.contentDictionary("fr")).includes("Secret plan"));
  });
});

// ---- the routes ---------------------------------------------------------------------------------------------------------------------------
describe("the routes", { skip }, () => {
  test("everybody reads the dictionary of a language, and a browser is told when nothing changed", async () => {
    await reset();
    await addStat("Max HP");
    await (await translatorOf(scripted())).sweep();
    const visitor = app.browser();
    const first = await visitor.get("/api/content-translations?lang=fr");
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.texts, { "Max HP": "Max HP [fr]" });
    assert.equal(first.body.language, "fr");
    assert.match(first.headers.get("cache-control"), /no-cache/);
    const etag = first.headers.get("etag");
    assert.match(etag, /^"ct-fr-/);
    const same = await visitor.get("/api/content-translations?lang=fr", { "if-none-match": etag });
    assert.equal(same.status, 304);
    await app.store.contentSetManual(
      textHash("Max HP"),
      "fr",
      "PV max",
      Date.parse("2026-10-09T00:00:00Z")
    );
    const changed = await visitor.get("/api/content-translations?lang=fr", {
      "if-none-match": etag
    });
    assert.equal(changed.status, 200, "a correction is a new version");
    assert.equal(changed.body.texts["Max HP"], "PV max");
  });

  test("the language is the one asked, else the one of the request, else English; nothing else is accepted", async () => {
    const visitor = app.browser("hok_lang=es");
    assert.equal((await visitor.get("/api/content-translations")).body.language, "es");
    assert.equal((await visitor.get("/api/content-translations?lang=de")).body.language, "de");
    assert.equal((await visitor.get("/api/content-translations?lang=klingon")).body.language, "es");
    assert.equal((await visitor.get("/api/content-translations?lang[]=fr")).body.language, "es");
  });

  test("the administration is for administrators", async () => {
    const user = await app.signIn("Plain");
    const hash = textHash("Max HP");
    for (const [method, path] of [
      ["get", "/api/admin/translations/status"],
      ["get", "/api/admin/translations/texts"],
      ["put", `/api/admin/translations/${hash}/fr`],
      ["delete", `/api/admin/translations/${hash}/fr`],
      ["post", `/api/admin/translations/${hash}/keep`],
      ["post", "/api/admin/translations/retry"],
      ["post", "/api/admin/translations/sweep"]
    ]) {
      assert.equal((await app.browser()[method](path, {})).status, 401, path);
      assert.equal((await user.browser[method](path, {})).status, 403, path);
    }
  });

  test("an administrator reviews, corrects, resets and keeps", async () => {
    await reset();
    await addStat("Max HP");
    await addStat("Deals 5% damage");
    const service = await translatorOf(
      scripted({
        behave: (items, languages) =>
          new Map(
            items.map(item => [
              item.hash,
              {
                source: "en",
                texts: Object.fromEntries(
                  languages.map(code => [
                    code,
                    code === "fr" && /5%/.test(item.text) ? "Inflige 3 %" : `${item.text} [${code}]`
                  ])
                ),
                failed: {}
              }
            ])
          )
      })
    );
    await service.sweep();
    const admin = await app.signIn("Reviewer", { admin: true });
    const list = async query =>
      (await admin.browser.get(`/api/admin/translations/texts?language=fr${query}`)).body;
    const all = await list("");
    assert.equal(all.total, 2);
    assert.deepEqual(
      all.rows.map(row => [row.source, row.status]),
      [
        ["Deals 5% damage", "failed"],
        ["Max HP", "ok"]
      ],
      "what failed comes first"
    );
    assert.equal(all.rows[0].error, "numbers differ");
    assert.equal((await list("&state=failed")).total, 1);
    assert.equal((await list("&state=machine")).total, 1);
    assert.equal((await list("&state=manual")).total, 0);
    assert.equal((await list("&q=max")).total, 1);
    assert.equal((await list("&q=5%25")).total, 1, "a percent sign is a percent sign");
    assert.equal((await list("&q=dam")).total, 1);
    assert.equal((await list("&q=d_m")).total, 0, "an underscore is not a joker");

    const damage = textHash("Deals 5% damage");
    assert.equal(
      (
        await admin.browser.put(`/api/admin/translations/${damage}/fr`, {
          text: "Inflige 5 % de dégâts"
        })
      ).status,
      200
    );
    assert.equal((await list("&state=manual")).rows[0].text, "Inflige 5 % de dégâts");
    assert.equal(
      (await admin.browser.put(`/api/admin/translations/${damage}/fr`, { text: "   " })).status,
      400
    );
    assert.equal(
      (await admin.browser.put(`/api/admin/translations/${damage}/xx`, { text: "a" })).status,
      400
    );
    assert.equal(
      (await admin.browser.put(`/api/admin/translations/nothing/fr`, { text: "a" })).status,
      404
    );
    assert.equal(
      (await admin.browser.put(`/api/admin/translations/${"0".repeat(64)}/fr`, { text: "a" }))
        .status,
      404
    );
    assert.equal((await visitorWords("fr"))["Deals 5% damage"], "Inflige 5 % de dégâts");

    assert.equal((await admin.browser.delete(`/api/admin/translations/${damage}/fr`)).status, 200);
    assert.equal((await list("&state=pending")).total, 1);
    assert.equal(
      (await admin.browser.post(`/api/admin/translations/${textHash("Max HP")}/keep`)).status,
      200
    );
    assert.equal(
      (await visitorWords("de"))["Max HP"],
      undefined,
      "kept as typed: nothing to translate"
    );
    assert.equal(
      (await admin.browser.post(`/api/admin/translations/${"1".repeat(64)}/keep`)).status,
      404
    );
    assert.equal(
      (await admin.browser.post("/api/admin/translations/retry", { language: "klingon" })).status,
      400
    );
    assert.equal((await admin.browser.post("/api/admin/translations/retry", {})).body.retried, 0);
  });

  test("the state of the translator, and a round asked for", async () => {
    await reset();
    await addStat("Max HP");
    const admin = await app.signIn("Watcher", { admin: true });
    const status = (await admin.browser.get("/api/admin/translations/status")).body;
    assert.deepEqual([status.provider, status.running, status.dailyChars], [null, false, 400_000]);
    assert.equal((await admin.browser.post("/api/admin/translations/sweep")).body.started, true);
    await app.translations.sweep();
    const after = (await admin.browser.get("/api/admin/translations/status")).body;
    assert.equal(after.texts >= 1, true);
    assert.equal(typeof after.total.pending, "number");
  });

  test("saving what the staff writes asks for a round; saving something else does not", async () => {
    const admin = await app.signIn("Saver", { admin: true });
    const asked = [];
    const original = app.translations.kick;
    app.translations.kick = (...args) => {
      asked.push(args);
    };
    try {
      await admin.browser.post("/api/admin/catalog/stats", { name: "Kick one", unit: "flat" });
      await admin.browser.post("/api/admin/catalog/stats", { name: "" }); // refused: no round
      await admin.browser.post("/api/admin/catalog/tags", { name: "Kick tag" });
      await admin.browser.put("/api/admin/heroes/h01/profile", {
        baseStats: [],
        skills: [],
        tags: []
      });
      await admin.browser.get("/api/catalog");
      await new Promise(resolve => setTimeout(resolve, 80));
      assert.equal(
        asked.length,
        3,
        "a stat, a tag, a profile: a refused save and a read do not count"
      );
      await admin.browser.put("/api/training/focus", { heroIds: [] });
      await admin.browser.post("/api/tier-lists", { name: "Mine", tiers: [], unranked: [] });
      await new Promise(resolve => setTimeout(resolve, 80));
      assert.equal(asked.length, 3, "what the staff does not write does not count");
    } finally {
      app.translations.kick = original;
    }
  });
});

/** The dictionary of a language as a visitor reads it. */
async function visitorWords(language) {
  return (await app.browser().get(`/api/content-translations?lang=${language}`)).body.texts;
}
