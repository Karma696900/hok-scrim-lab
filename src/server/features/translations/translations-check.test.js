// The tool the owner runs to check a DeepL key (npm run translations:check): what it says for a key that
// works, a free key, a refused key, a missing key, a service that does not offer every language, and
// that it never prints the key. Against a fake service: nothing here is sent to DeepL.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { checkDeepL } from "../../../../scripts/translations/check-deepl.mjs";
import { TARGETS } from "./providers/deepl.js";

/** A fake DeepL that answers by address, and keeps what it was asked. */
function fakeDeepL({ usage, languages, translate, refuse = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method ?? "GET", body: options.body });
    const path = new URL(url).pathname;
    if (refuse) {
      return new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 });
    }
    if (path === "/v2/usage") {
      return new Response(
        JSON.stringify(usage ?? { character_count: 12_345, character_limit: 500_000 })
      );
    }
    if (path === "/v2/languages") {
      return new Response(
        JSON.stringify(
          (languages ?? Object.values(TARGETS)).map(language => ({ language, name: language }))
        )
      );
    }
    if (path === "/v2/translate") {
      return new Response(
        JSON.stringify(
          translate ?? { translations: [{ detected_source_language: "EN", text: "Mêlée" }] }
        )
      );
    }
    return new Response("{}", { status: 404 });
  };
  return { fetchImpl, calls };
}
const run = (env, options = {}) => checkDeepL({ env, ...options });

describe("npm run translations:check", () => {
  test("a key that works: the quota and the languages, and nothing is translated (nothing is billed)", async () => {
    const service = fakeDeepL();
    const { ok, lines } = await run(
      { DEEPL_API_KEY: "secret-key:fx" },
      { fetchImpl: service.fetchImpl }
    );
    assert.equal(ok, true);
    const text = lines.join("\n");
    assert.match(text, /\(a free key\), talking to api-free\.deepl\.com/);
    assert.match(text, /12,345 of 500,000 characters used this period \(2%\)/);
    assert.match(text, /DeepL offers all 15 languages of the site/);
    assert.match(text, /Nothing was translated/);
    assert.ok(!text.includes("secret-key"), "the key is never printed");
    assert.deepEqual(
      service.calls.map(call => call.url.replace("https://api-free.deepl.com", "")),
      ["/v2/usage", "/v2/languages?type=target"],
      "two reads, no translation"
    );
  });

  test("--translate translates one word, and says what came back", async () => {
    const service = fakeDeepL();
    const { ok, lines } = await run(
      { DEEPL_API_KEY: "k:fx" },
      { fetchImpl: service.fetchImpl, translate: true }
    );
    assert.equal(ok, true);
    assert.match(lines.join("\n"), /"Melee" becomes "Mêlée" in French/);
    const sent = JSON.parse(service.calls.at(-1).body);
    assert.deepEqual(sent.text, ["Melee"], "five characters");
  });

  test("the keys that were already written are read the same way", async () => {
    const service = fakeDeepL();
    const { ok } = await run(
      { TRANSLATION_PROVIDER: "deepl", TRANSLATION_API_KEY: "old-key" },
      { fetchImpl: service.fetchImpl }
    );
    assert.equal(ok, true);
    assert.match(
      service.calls[0].url,
      /^https:\/\/api\.deepl\.com\//,
      "a key that is not free: the paid address"
    );
  });

  test("an account with no limit, and one that says when its period ends", async () => {
    const paid = fakeDeepL({
      usage: {
        character_count: 5_947_223,
        character_limit: 1_000_000_000_000,
        end_time: "2026-11-01T09:18:42Z"
      }
    });
    const { lines } = await run({ DEEPL_API_KEY: "paid" }, { fetchImpl: paid.fetchImpl });
    const text = lines.join("\n");
    assert.match(text, /5,947,223 characters used this period, no limit on the account/);
    assert.match(text, /The period ends on 2026-11-01/);
  });

  test("a language DeepL does not offer is named, and its texts stay as typed", async () => {
    const offered = Object.entries(TARGETS)
      .filter(([code]) => !["th", "vi"].includes(code))
      .map(([, target]) => target);
    const service = fakeDeepL({ languages: offered });
    const { ok, lines } = await run({ DEEPL_API_KEY: "k:fx" }, { fetchImpl: service.fetchImpl });
    assert.equal(ok, true, "not a failure: the other languages work");
    assert.match(
      lines.join("\n"),
      /does not offer: .*(ไทย).*(Tiếng Việt)|does not offer: .*(Tiếng Việt).*(ไทย)/
    );
  });

  test("the code of a language may be the short one (ZH for ZH-HANS)", async () => {
    const service = fakeDeepL({
      languages: [...Object.values(TARGETS).filter(code => code !== "ZH-HANS"), "ZH"]
    });
    const { lines } = await run({ DEEPL_API_KEY: "k:fx" }, { fetchImpl: service.fetchImpl });
    assert.match(lines.join("\n"), /offers all 15 languages/);
  });

  test("a refused key says so, and stops there", async () => {
    const service = fakeDeepL({ refuse: true });
    const { ok, lines } = await run({ DEEPL_API_KEY: "wrong" }, { fetchImpl: service.fetchImpl });
    assert.equal(ok, false);
    assert.match(lines.join("\n"), /DeepL refused the key: check it \(a free key ends with :fx\)/);
    assert.equal(service.calls.length, 1);
    assert.ok(!lines.join("\n").includes("wrong"));
  });

  test("no key, or another service, is said without asking anybody", async () => {
    const service = fakeDeepL();
    const none = await run({}, { fetchImpl: service.fetchImpl });
    assert.equal(none.ok, false);
    assert.match(none.lines.join("\n"), /No DeepL key: add DEEPL_API_KEY/);
    const other = await run(
      { TRANSLATION_PROVIDER: "libretranslate", TRANSLATION_ENDPOINT: "http://lt" },
      { fetchImpl: service.fetchImpl }
    );
    assert.equal(other.ok, false);
    assert.match(other.lines.join("\n"), /libretranslate, not deepl/);
    const keyless = await run({ TRANSLATION_PROVIDER: "deepl" }, { fetchImpl: service.fetchImpl });
    assert.equal(keyless.ok, false);
    assert.match(keyless.lines.join("\n"), /there is no key/);
    assert.equal(service.calls.length, 0, "nothing was sent");
  });
});
