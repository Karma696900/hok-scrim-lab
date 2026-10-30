// DeepL is the service the owner uses, so it is the one that must be simple and spare: a key alone
// turns it on, the quota is read from the account (not guessed with a daily number), a request carries
// up to 50 texts and some context about the game (not billed), the languages go four at a time, and
// when the service stops half-way what was done is kept. Everything runs against a fake service:
// nothing here is ever sent to DeepL.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { assertRuntimeConfig, loadConfig } from "../../config.js";
import { textHash } from "./translation-domain.js";
import { CONTEXT, LIMITS, createDeepLProvider } from "./providers/deepl.js";
import { ProviderError, getJson, postJson } from "./providers/http.js";
import { createProvider } from "./providers/translation-providers.js";

/** A fetch that answers what a test says, and keeps what it was asked (and how many ran at once). */
function fakeFetch(answer, { delayMs = 0 } = {}) {
  const calls = [];
  const state = { inFlight: 0, mostAtOnce: 0 };
  const fetchImpl = async (url, options = {}) => {
    state.inFlight += 1;
    state.mostAtOnce = Math.max(state.mostAtOnce, state.inFlight);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, method: options.method ?? "GET", headers: options.headers, body });
    try {
      if (delayMs) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      const given =
        typeof answer === "function" ? answer({ url, body, index: calls.length }) : answer;
      if (given instanceof Error) {
        throw given;
      }
      const { status = 200, json, text, headers = {} } = given;
      return new Response(text ?? JSON.stringify(json), { status, headers });
    } finally {
      state.inFlight -= 1;
    }
  };
  return { fetchImpl, calls, state };
}
const item = text => ({ hash: textHash(text), text, kind: "item" });
const translated = ({ body }) => ({
  json: {
    translations: body.text.map(text => ({
      detected_source_language: "EN",
      text: `${text} → ${body.target_lang}`
    }))
  }
});

describe("one line in .env is enough (configuration)", () => {
  const password = "a-long-test-password";
  const of = env => loadConfig({ DB_PASSWORD: password, ...env }).translation;

  test("a DeepL key chooses DeepL, with nothing else to write", () => {
    const settings = of({ DEEPL_API_KEY: "abc:fx" });
    assert.deepEqual([settings.provider, settings.apiKey], ["deepl", "abc:fx"]);
    assert.doesNotThrow(() =>
      assertRuntimeConfig(loadConfig({ DB_PASSWORD: password, DEEPL_API_KEY: "abc:fx" }))
    );
  });

  test("what was already written keeps working: TRANSLATION_PROVIDER and TRANSLATION_API_KEY", () => {
    const settings = of({ TRANSLATION_PROVIDER: "deepl", TRANSLATION_API_KEY: "old-key" });
    assert.deepEqual([settings.provider, settings.apiKey], ["deepl", "old-key"]);
    const both = of({
      TRANSLATION_PROVIDER: "deepl",
      TRANSLATION_API_KEY: "new-key",
      DEEPL_API_KEY: "other-key"
    });
    assert.equal(both.apiKey, "new-key", "the older name is the one that was chosen on purpose");
  });

  test("off stays off, whatever keys are around; nothing is on by itself without a key", () => {
    assert.equal(of({ TRANSLATION_PROVIDER: "off", DEEPL_API_KEY: "abc:fx" }).provider, "off");
    assert.equal(of({}).provider, "off");
    assert.equal(of({ DEEPL_API_KEY: "" }).provider, "off");
    assert.equal(of({ DEEPL_API_KEY: "   " }).provider, "off");
  });

  test("a DeepL key is not taken for the key of another service", () => {
    const config = loadConfig({
      DB_PASSWORD: password,
      TRANSLATION_PROVIDER: "anthropic",
      DEEPL_API_KEY: "abc:fx"
    });
    assert.equal(config.translation.apiKey, "");
    assert.throws(() => assertRuntimeConfig(config), /TRANSLATION_API_KEY/);
  });

  test("no daily limit unless one is written: the quota of the account is the limit", () => {
    assert.equal(of({ DEEPL_API_KEY: "k" }).dailyChars, null);
    assert.equal(of({ DEEPL_API_KEY: "k", TRANSLATION_DAILY_CHARS: "5000" }).dailyChars, 5000);
    assert.equal(of({ DEEPL_API_KEY: "k", TRANSLATION_DAILY_CHARS: "lots" }).dailyChars, null);
    assert.equal(
      of({ DEEPL_API_KEY: "k", TRANSLATION_DAILY_CHARS: "0" }).dailyChars,
      0,
      "0 sends nothing"
    );
  });

  test("the provider that is made from it", () => {
    const provider = createProvider(of({ DEEPL_API_KEY: "abc:fx" }), {
      fetchImpl: fakeFetch(translated).fetchImpl
    });
    assert.equal(provider.name, "deepl");
  });
});

describe("what a service answers (http)", () => {
  test("456 is the quota, not a request to slow down: it is not tried again for hours", async () => {
    const service = fakeFetch({ status: 456, json: { message: "Quota exceeded" } });
    await assert.rejects(
      postJson(service.fetchImpl, "https://x.test/translate", { headers: {}, body: {} }),
      error => error instanceof ProviderError && error.kind === "quota"
    );
    const slow = fakeFetch({ status: 429, json: {}, headers: { "retry-after": "7" } });
    await assert.rejects(
      postJson(slow.fetchImpl, "https://x.test/translate", { headers: {}, body: {} }),
      error => error.kind === "rate" && error.retryAfterMs === 7000
    );
  });

  test("a GET reads JSON the same way and fails the same way", async () => {
    const ok = fakeFetch({ json: { fine: true } });
    assert.deepEqual(await getJson(ok.fetchImpl, "https://x.test/usage", { headers: { a: "b" } }), {
      fine: true
    });
    assert.deepEqual([ok.calls[0].method, ok.calls[0].headers.a], ["GET", "b"]);
    const refused = fakeFetch({ status: 403, json: { message: "Forbidden" } });
    await assert.rejects(getJson(refused.fetchImpl, "https://x.test/usage", { headers: {} }), {
      kind: "auth"
    });
    const down = fakeFetch(new Error("connection reset"));
    await assert.rejects(getJson(down.fetchImpl, "https://x.test/usage", { headers: {} }), {
      kind: "unavailable"
    });
  });
});

describe("DeepL: spare and quick", () => {
  test("up to 50 texts and 20 000 characters in a request, and the game as the context", () => {
    assert.deepEqual(LIMITS, { maxItems: 50, maxChars: 20_000 });
    assert.match(CONTEXT, /Honor of Kings/);
    assert.ok(CONTEXT.length < 400);
    const provider = createDeepLProvider({
      apiKey: "k",
      fetchImpl: fakeFetch(translated).fetchImpl
    });
    assert.deepEqual(provider.limits, LIMITS);
  });

  test("the request: the key in the header only, the context (not billed), the texts as a list", async () => {
    const service = fakeFetch(translated);
    const provider = createDeepLProvider({ apiKey: "secret:fx", fetchImpl: service.fetchImpl });
    await provider.translate({ items: [item("Max HP"), item("Crit Rate")], languages: ["fr"] });
    const [call] = service.calls;
    assert.equal(call.url, "https://api-free.deepl.com/v2/translate");
    assert.equal(call.headers.authorization, "DeepL-Auth-Key secret:fx");
    assert.ok(!call.url.includes("secret"), "never in the address");
    assert.deepEqual(call.body.text, ["Max HP", "Crit Rate"]);
    assert.equal(call.body.target_lang, "FR");
    assert.equal(call.body.context, CONTEXT);
    assert.equal(call.body.preserve_formatting, true);
    assert.ok(!JSON.stringify(call.body).includes("secret"), "never in the body");
  });

  test("the first language alone (it tells which language each text is in), the others four at a time", async () => {
    const service = fakeFetch(translated, { delayMs: 15 });
    const provider = createDeepLProvider({ apiKey: "k:fx", fetchImpl: service.fetchImpl });
    const languages = ["fr", "es", "pt", "de", "it", "ru", "tr", "id", "vi", "th"];
    const answers = await provider.translate({ items: [item("Melee")], languages });
    assert.equal(service.calls.length, 10, "one request for each language");
    assert.equal(service.state.mostAtOnce, 4, "four at a time, never more");
    assert.deepEqual(
      Object.keys(answers.get(textHash("Melee")).texts).sort(),
      [...languages].sort(),
      "every language answered"
    );
    // while the first one ran nothing else did: the answer to it is what the others rely on
    const first = fakeFetch(translated, { delayMs: 15 });
    await createDeepLProvider({ apiKey: "k:fx", fetchImpl: first.fetchImpl }).translate({
      items: [item("Melee")],
      languages: ["fr", "es"]
    });
    assert.equal(first.state.mostAtOnce, 1, "two languages: the second waits for the first");
  });

  test("a text whose language the first answer reveals is not asked again for that language", async () => {
    const service = fakeFetch(({ body }) => ({
      json: {
        translations: body.text.map(text => ({
          detected_source_language: text === "Mêlée" ? "FR" : "EN",
          text: `${text} ${body.target_lang}`
        }))
      }
    }));
    const provider = createDeepLProvider({ apiKey: "k", fetchImpl: service.fetchImpl });
    const answers = await provider.translate({
      items: [item("Max HP"), item("Mêlée")],
      languages: ["es", "fr", "de"]
    });
    const asked = Object.fromEntries(
      service.calls.map(call => [call.body.target_lang, call.body.text])
    );
    assert.deepEqual(asked.ES, ["Max HP", "Mêlée"]);
    assert.deepEqual(asked.FR, ["Max HP"], "the French text is not translated into French");
    assert.deepEqual(asked.DE, ["Max HP", "Mêlée"]);
    assert.equal(answers.get(textHash("Mêlée")).texts.fr, "Mêlée");
  });

  test("when the service stops half-way, what was done is kept and the rest is left", async () => {
    let index = 0;
    const service = fakeFetch(({ body }) => {
      index += 1;
      return index === 3
        ? { status: 429, json: {}, headers: { "retry-after": "30" } }
        : translated({ body });
    });
    const provider = createDeepLProvider({ apiKey: "k", fetchImpl: service.fetchImpl });
    const answers = await provider.translate({
      items: [item("Max HP")],
      languages: ["fr", "es", "pt", "de"]
    });
    assert.equal(answers.interrupted?.kind, "rate");
    assert.equal(answers.interrupted.retryAfterMs, 30_000);
    const done = [...answers.done].sort();
    assert.ok(done.length >= 2 && !done.includes("pt"), `done: ${done}`);
    for (const language of done) {
      assert.equal(typeof answers.get(textHash("Max HP")).texts[language], "string", language);
    }
  });

  test("a quota that is used up, with nothing done yet: the call fails and says why, after one request", async () => {
    const service = fakeFetch({ status: 456, json: { message: "Quota exceeded" } });
    const provider = createDeepLProvider({ apiKey: "k", fetchImpl: service.fetchImpl });
    await assert.rejects(
      provider.translate({ items: [item("Max HP")], languages: ["fr", "es"] }),
      error => error instanceof ProviderError && error.kind === "quota"
    );
    assert.equal(
      service.calls.length,
      1,
      "nothing more is sent once the quota is known to be used up"
    );
  });

  test("a key that is refused, a service that is down: the whole call fails as before", async () => {
    const refused = createDeepLProvider({
      apiKey: "k",
      fetchImpl: fakeFetch({ status: 403, json: { message: "Forbidden" } }).fetchImpl
    });
    await assert.rejects(refused.translate({ items: [item("x y")], languages: ["fr"] }), {
      kind: "auth"
    });
    const down = createDeepLProvider({
      apiKey: "k",
      fetchImpl: fakeFetch({ status: 503, json: {} }).fetchImpl
    });
    await assert.rejects(down.translate({ items: [item("x y")], languages: ["fr", "es"] }), {
      kind: "unavailable"
    });
  });
});

describe("DeepL: what the account says about its quota", () => {
  test("a free account: characters used and the limit, from the address of the free service", async () => {
    const service = fakeFetch({ json: { character_count: 180_118, character_limit: 500_000 } });
    const provider = createDeepLProvider({ apiKey: "k:fx", fetchImpl: service.fetchImpl });
    const usage = await provider.usage();
    assert.deepEqual(usage, { used: 180_118, limit: 500_000, unlimited: false, resetsAt: null });
    assert.equal(service.calls[0].url, "https://api-free.deepl.com/v2/usage");
    assert.equal(service.calls[0].method, "GET");
    assert.equal(service.calls[0].headers.authorization, "DeepL-Auth-Key k:fx");
  });

  test("a paid account: the end of the period is known, and no limit is a number too big to be one", async () => {
    const service = fakeFetch({
      json: {
        character_count: 5_947_223,
        character_limit: 1_000_000_000_000,
        start_time: "2026-10-01T09:18:42Z",
        end_time: "2026-11-01T09:18:42Z"
      }
    });
    const usage = await createDeepLProvider({
      apiKey: "paid",
      fetchImpl: service.fetchImpl
    }).usage();
    assert.equal(usage.unlimited, true);
    assert.equal(usage.used, 5_947_223);
    assert.equal(usage.resetsAt, Date.parse("2026-11-01T09:18:42Z"));
    assert.equal(service.calls[0].url, "https://api.deepl.com/v2/usage");
    const capped = fakeFetch({
      json: { character_count: 10, character_limit: 2_000_000, end_time: "2026-11-01T09:18:42Z" }
    });
    assert.equal(
      (await createDeepLProvider({ apiKey: "paid", fetchImpl: capped.fetchImpl }).usage())
        .unlimited,
      false,
      "a cost control written in the account is a limit"
    );
  });

  test("what cannot be read is an error of the service, not a made-up number", async () => {
    const odd = createDeepLProvider({
      apiKey: "k",
      fetchImpl: fakeFetch({ json: { surprise: true } }).fetchImpl
    });
    await assert.rejects(odd.usage(), { kind: "bad-answer" });
    const refused = createDeepLProvider({
      apiKey: "k",
      fetchImpl: fakeFetch({ status: 403, json: {} }).fetchImpl
    });
    await assert.rejects(refused.usage(), { kind: "auth" });
  });
});
