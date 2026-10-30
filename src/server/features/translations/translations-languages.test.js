// The translator sends only what is worth sending: a language is translated once somebody asked for it
// (a visitor who reads the site in it, or an administrator), a provider that can say what is left of
// its quota is never asked to go beyond it, a request holds as many texts as the provider takes, and
// a provider that stops half-way keeps what it did. A scripted provider and a real database; nothing
// is ever sent to a real service.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { allowanceOf } from "./translation-domain.js";
import { createTranslationService } from "./translation-service.js";
import { ProviderError } from "./providers/http.js";
import { startTestServer } from "../../../testing/test-app.js";

describe("what the translator may still send (pure)", () => {
  test("nine tenths of what the quota has left, never below nothing, no limit when there is none", () => {
    assert.equal(allowanceOf({ used: 0, limit: 500_000, unlimited: false }), 450_000);
    assert.equal(allowanceOf({ used: 100_000, limit: 500_000, unlimited: false }), 350_000);
    assert.equal(allowanceOf({ used: 450_000, limit: 500_000, unlimited: false }), 0);
    assert.equal(allowanceOf({ used: 499_999, limit: 500_000, unlimited: false }), 0);
    assert.equal(allowanceOf({ used: 10, limit: 1e12, unlimited: true }), Infinity);
    assert.equal(
      allowanceOf(null),
      Infinity,
      "a provider that cannot say: the daily limit is the guard"
    );
    assert.equal(allowanceOf({ used: 0, limit: 1000, unlimited: false }, 0.5), 500);
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const LANGUAGES = [
  "en",
  "fr",
  "es",
  "pt",
  "de",
  "it",
  "ru",
  "tr",
  "id",
  "vi",
  "th",
  "ar",
  "ja",
  "ko",
  "zh"
];

/** A provider that is scripted: a translation is "<text> [<language>]", and every call is kept. */
function scripted({ limits, usage, behave } = {}) {
  const calls = [];
  const provider = {
    calls,
    name: "scripted",
    label: "Scripted",
    ...(limits ? { limits } : {}),
    ...(usage ? { usage } : {}),
    async translate({ items, languages }) {
      calls.push({ texts: items.map(item => item.text), languages: [...languages] });
      const forced = behave ? await behave({ items, languages, calls }) : null;
      if (forced) {
        return forced;
      }
      const answers = new Map();
      for (const item of items) {
        const texts = {};
        for (const language of languages) {
          texts[language] = `${item.text} [${language}]`;
        }
        answers.set(item.hash, { source: "en", texts, failed: {} });
      }
      return answers;
    }
  };
  return provider;
}

const clock = { at: Date.parse("2026-10-08T10:00:00Z") };
const serviceOf = (provider, config = { dailyChars: 1_000_000 }) =>
  createTranslationService({ store: app.store, provider, config, now: () => clock.at });

async function reset() {
  clock.at = Date.parse("2026-10-08T10:00:00Z");
  for (const table of [
    "content_texts",
    "translation_usage",
    "translation_languages",
    "game_stats"
  ]) {
    await app.store.pool.query(`DELETE FROM ${table}`);
  }
}
const addStat = name =>
  app.store.pool.execute(
    "INSERT INTO game_stats (name, unit, sort_order, options_json) VALUES (?, 'flat', 0, '[]')",
    [name]
  );
const rowsOf = async text => {
  const [rows] = await app.store.pool.query(
    "SELECT c.language, c.text, c.status, c.origin FROM content_translations c JOIN content_texts t ON t.hash = c.hash WHERE t.text = ? ORDER BY c.language",
    [text]
  );
  return Object.fromEntries(rows.map(row => [row.language, row]));
};
const languagesOf = async text => Object.keys(await rowsOf(text)).sort();
async function until(ask, what = "something") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await ask()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`never happened: ${what}`);
}

describe("languages are translated once somebody asked for them", { skip }, () => {
  test("with no language asked for, the texts are registered and nothing is sent", async () => {
    await reset();
    await addStat("Attack range");
    const provider = scripted();
    const result = await serviceOf(provider).sweep();
    assert.equal(result.stopped, "no-language");
    assert.equal(result.added, 1, "the text is known");
    assert.equal(provider.calls.length, 0, "and nothing was asked of the provider");
    assert.deepEqual(await languagesOf("Attack range"), []);
  });

  test("a language that is asked for is translated, the others are not", async () => {
    await reset();
    await addStat("Attack range");
    const provider = scripted();
    const service = serviceOf(provider);
    assert.equal(await service.want("fr"), true);
    assert.equal(await service.want("fr"), false, "once");
    assert.equal(await service.want("klingon"), false, "a language of the site only");
    assert.equal(await service.want(undefined), false);
    const result = await service.sweep();
    assert.equal(result.translated, 1);
    assert.deepEqual(provider.calls, [{ texts: ["Attack range"], languages: ["fr"] }]);
    assert.deepEqual(await languagesOf("Attack range"), ["fr"]);
    assert.equal((await rowsOf("Attack range")).fr.text, "Attack range [fr]");
  });

  test("a text written afterwards is kept for the languages that are asked for, and only them", async () => {
    await reset();
    await addStat("Attack range");
    const provider = scripted();
    const service = serviceOf(provider);
    await service.want("fr");
    await service.want("ja");
    await service.sweep();
    await addStat("Move speed");
    await service.sweep();
    assert.deepEqual(await languagesOf("Move speed"), ["fr", "ja"]);
    assert.deepEqual(provider.calls.at(-1), { texts: ["Move speed"], languages: ["fr", "ja"] });
  });

  test("a language asked for later is filled in for the texts that already exist", async () => {
    await reset();
    await addStat("Attack range");
    await addStat("Move speed");
    const provider = scripted();
    const service = serviceOf(provider);
    await service.want("fr");
    await service.sweep();
    assert.deepEqual(await languagesOf("Move speed"), ["fr"]);
    await service.want("de");
    await service.sweep();
    assert.deepEqual(await languagesOf("Move speed"), ["de", "fr"]);
    assert.equal((await rowsOf("Move speed")).de.text, "Move speed [de]");
    assert.deepEqual(provider.calls.at(-1).languages, ["de"], "only the new language is asked for");
  });

  test("rows of a language nobody asked for are not worked, however they got there", async () => {
    await reset();
    await addStat("Attack range");
    const provider = scripted();
    const service = serviceOf(provider);
    await service.want("fr");
    await service.sweep();
    // a row that an older run left waiting for Japanese
    await app.store.pool.execute(
      "INSERT INTO content_translations (hash, language, status, updated_at) SELECT hash, 'ja', 'pending', 1 FROM content_texts"
    );
    provider.calls.length = 0;
    await service.sweep();
    assert.equal(provider.calls.length, 0);
    assert.equal((await rowsOf("Attack range")).ja.status, "pending");
  });

  test("a text kept as typed stays as typed in a language that is asked for later", async () => {
    await reset();
    await addStat("Attack range");
    await addStat("Hunter");
    const provider = scripted();
    const service = serviceOf(provider);
    await service.want("fr");
    await service.sweep();
    const [[hunter]] = await app.store.pool.query(
      "SELECT hash FROM content_texts WHERE text = 'Hunter'"
    );
    assert.equal(await app.store.contentKeep(hunter.hash, clock.at), true);
    await service.want("de");
    provider.calls.length = 0;
    await service.sweep();
    assert.deepEqual(
      provider.calls.flatMap(call => call.texts),
      ["Attack range"],
      "German is asked for the other text, not for the name that stays as typed"
    );
    const german = (await rowsOf("Hunter")).de;
    assert.deepEqual([german.status, german.origin, german.text], ["ok", "manual", "Hunter"]);
    const dictionary = await app.store.contentDictionary("de");
    assert.equal(dictionary.Hunter, undefined, "so it is read as typed");
    assert.equal(dictionary["Attack range"], "Attack range [de]");

    // "back to automatic" takes the decision back: a language asked for later translates it
    await app.store.contentReset(hunter.hash, "fr", clock.at);
    await service.want("ko");
    await service.sweep();
    assert.equal((await rowsOf("Hunter")).ko.text, "Hunter [ko]");
  });

  test("every language at once", async () => {
    await reset();
    await addStat("Attack range");
    const service = serviceOf(scripted());
    assert.equal(await service.wantAll(), 15);
    assert.equal(await service.wantAll(), 0, "nothing new the second time");
    await service.sweep();
    assert.deepEqual(await languagesOf("Attack range"), [...LANGUAGES].sort());
  });

  test("the administration sees which languages are asked for and how far each one is", async () => {
    await reset();
    await addStat("Attack range");
    await addStat("Move speed");
    const service = serviceOf(scripted());
    await service.want("fr");
    await service.want("es");
    await service.sweep();
    await service.want("de");
    const status = await service.status();
    assert.deepEqual(status.wanted.sort(), ["de", "es", "fr"]);
    assert.equal(status.languages.length, 15);
    const by = Object.fromEntries(status.languages.map(entry => [entry.code, entry]));
    assert.deepEqual([by.fr.wanted, by.fr.ok, by.fr.pending], [true, 2, 0]);
    assert.deepEqual([by.de.wanted, by.de.ok], [true, 0], "asked for, not done yet");
    assert.deepEqual([by.ja.wanted, by.ja.ok, by.ja.pending], [false, 0, 0]);
    assert.equal(status.total.ok, 4, "the totals are about the languages that are asked for");
    assert.equal(status.texts, 2);
  });
});

describe("what is sent goes no further than the quota", { skip }, () => {
  const quotaOf =
    (used, limit, extra = {}) =>
    async () => ({
      used,
      limit,
      unlimited: false,
      resetsAt: null,
      ...extra
    });

  test("with room left the translation goes on, and the administration shows the quota", async () => {
    await reset();
    await addStat("Attack range");
    const provider = scripted({ usage: quotaOf(1000, 500_000) });
    const service = serviceOf(provider, {});
    await service.want("fr");
    const result = await service.sweep();
    assert.equal(result.translated, 1);
    const status = await service.status();
    assert.deepEqual(
      [status.quota.used, status.quota.limit, status.quota.unlimited, status.quotaShare],
      [1000, 500_000, false, 0.9]
    );
    assert.equal(status.dailyChars, null, "no daily limit: the quota is the limit");
  });

  test("when nine tenths are used nothing is sent, and the translator waits until tomorrow", async () => {
    await reset();
    await addStat("Attack range");
    const provider = scripted({ usage: quotaOf(450_000, 500_000) });
    const service = serviceOf(provider, {});
    await service.want("fr");
    const result = await service.sweep();
    assert.equal(result.stopped, "quota");
    assert.equal(provider.calls.length, 0);
    const status = await service.status();
    assert.equal(status.paused.reason, "quota");
    assert.equal(
      status.paused.until,
      Date.parse("2026-10-09T00:00:00Z"),
      "tomorrow, UTC: the account does not say when its period ends"
    );
    assert.equal((await service.sweep()).stopped, "paused", "the next round does not even look");
  });

  test("a paid account says when its period ends, and the translator waits for that", async () => {
    await reset();
    await addStat("Attack range");
    const end = Date.parse("2026-11-01T09:00:00Z");
    const provider = scripted({ usage: quotaOf(900, 1000, { resetsAt: end }) });
    const service = serviceOf(provider, {});
    await service.want("fr");
    await service.sweep();
    assert.equal((await service.status()).paused.until, end);
  });

  test("a batch that does not fit in what is left is not sent", async () => {
    await reset();
    await addStat("Attack range"); // 12 characters, two languages: 24
    const provider = scripted({ usage: quotaOf(0, 30) }); // nine tenths of 30: 27 left... for one text of 24
    const service = serviceOf(provider, {});
    await service.want("fr");
    await service.want("es");
    assert.equal((await service.sweep()).translated, 2, "24 characters fit in 27");
    await reset();
    await addStat("Attack range");
    const tight = scripted({ usage: quotaOf(0, 20) }); // 18 left: 24 do not fit
    const second = serviceOf(tight, {});
    await second.want("fr");
    await second.want("es");
    const result = await second.sweep();
    assert.equal(result.stopped, "quota");
    assert.equal(tight.calls.length, 0);
  });

  test("no limit on the account: no limit on the translator", async () => {
    await reset();
    await addStat("Attack range");
    const provider = scripted({
      usage: async () => ({ used: 9e9, limit: 1e12, unlimited: true, resetsAt: null })
    });
    const service = serviceOf(provider, {});
    await service.want("fr");
    assert.equal((await service.sweep()).translated, 1);
  });

  test("the quota is asked for once a round, and only when there is something to send", async () => {
    await reset();
    await addStat("Attack range");
    let asked = 0;
    const provider = scripted({
      usage: async () => {
        asked += 1;
        return { used: 0, limit: 500_000, unlimited: false, resetsAt: null };
      }
    });
    const service = serviceOf(provider, {});
    await service.want("fr");
    await service.sweep();
    assert.equal(asked, 1);
    clock.at += 10 * 60_000;
    await service.sweep();
    assert.equal(asked, 1, "nothing to send: no need to ask");
  });

  test("a quota that cannot be read does not stop the translation; a key that is refused does", async () => {
    await reset();
    await addStat("Attack range");
    const flaky = scripted({
      usage: async () => {
        throw new ProviderError("unavailable", "The service cannot be reached.");
      }
    });
    const service = serviceOf(flaky, {});
    await service.want("fr");
    assert.equal((await service.sweep()).translated, 1, "the 456 will say when it is used up");

    await reset();
    await addStat("Attack range");
    const refused = scripted({
      usage: async () => {
        throw new ProviderError("auth", "The service refused the key: Forbidden");
      }
    });
    const stopped = serviceOf(refused, {});
    await stopped.want("fr");
    const result = await stopped.sweep();
    assert.equal(result.stopped, "refused");
    assert.equal(refused.calls.length, 0);
    assert.match((await stopped.status()).refused, /refused the key/);
  });

  test("a 456 from the translation itself pauses the same way, and leaves the rows waiting", async () => {
    await reset();
    await addStat("Attack range");
    const provider = scripted({
      behave: () => {
        throw new ProviderError("quota", "The quota of the account is used up.");
      }
    });
    const service = serviceOf(provider);
    await service.want("fr");
    const result = await service.sweep();
    assert.equal(result.stopped, "quota");
    const status = await service.status();
    assert.equal(status.paused.reason, "quota");
    assert.match(status.lastError, /quota/);
    assert.equal((await rowsOf("Attack range")).fr.status, "pending", "not failed: waiting");
    service.resume();
    assert.equal((await service.status()).paused, null, "an administrator can ask again");
  });

  test("without a limit written, a provider that cannot say what is left is held to a daily limit", async () => {
    await reset();
    const status = await serviceOf(scripted(), {}).status();
    assert.equal(status.dailyChars, 400_000);
    assert.equal(status.quota, null);
    assert.equal(status.quotaShare, null);
    const owned = await serviceOf(scripted(), { dailyChars: 5000 }).status();
    assert.equal(owned.dailyChars, 5000, "the limit the owner wrote is kept");
    const withQuota = await serviceOf(scripted({ usage: quotaOf(0, 10) }), {
      dailyChars: 5000
    }).status();
    assert.equal(withQuota.dailyChars, 5000, "and applies on top of the quota");
  });
});

describe("requests are as big as the provider takes them", { skip }, () => {
  test("the limits of the provider decide how many texts go together", async () => {
    await reset();
    for (const name of ["One", "Two", "Three", "Four", "Five", "Six", "Seven"]) {
      await addStat(name);
    }
    const provider = scripted({ limits: { maxItems: 3, maxChars: 1000 } });
    const service = serviceOf(provider);
    await service.want("fr");
    await service.sweep();
    assert.deepEqual(provider.calls.map(call => call.texts.length).sort(), [1, 3, 3]);
    const other = scripted();
    await reset();
    for (let index = 0; index < 45; index += 1) {
      await addStat(`Name number ${index}`);
    }
    const plain = serviceOf(other);
    await plain.want("fr");
    await plain.sweep();
    assert.deepEqual(
      other.calls.map(call => call.texts.length),
      [20, 20, 5],
      "a provider that says nothing gets the usual 20"
    );
  });

  test("a provider that takes fifty at a time gets fifty", async () => {
    await reset();
    for (let index = 0; index < 120; index += 1) {
      await addStat(`Stat ${index}`);
    }
    const provider = scripted({ limits: { maxItems: 50, maxChars: 20_000 } });
    const service = serviceOf(provider);
    await service.want("fr");
    await service.sweep();
    assert.deepEqual(
      provider.calls.map(call => call.texts.length).sort((a, b) => a - b),
      [20, 50, 50]
    );
  });
});

describe("a provider that stops half-way keeps what it did", { skip }, () => {
  test("the languages that were done are written, the others wait, and the service is left alone", async () => {
    await reset();
    await addStat("Attack range");
    const provider = scripted({
      behave: ({ items }) => {
        const answers = new Map();
        for (const item of items) {
          answers.set(item.hash, {
            source: "en",
            texts: { fr: "Portée d'attaque", es: "Alcance de ataque" },
            failed: {}
          });
        }
        answers.done = new Set(["fr", "es"]);
        answers.interrupted = new ProviderError("rate", "The service asks to slow down.", {
          retryAfterMs: 90_000
        });
        return answers;
      }
    });
    const service = serviceOf(provider);
    await service.want("fr");
    await service.want("es");
    await service.want("pt");
    const result = await service.sweep();
    assert.equal(result.stopped, "paused");
    assert.equal(result.translated, 2);
    const rows = await rowsOf("Attack range");
    assert.deepEqual(
      [rows.fr.status, rows.fr.text, rows.es.status, rows.es.text],
      ["ok", "Portée d'attaque", "ok", "Alcance de ataque"]
    );
    assert.equal(rows.pt.status, "pending", "waiting, not failed");
    const status = await service.status();
    assert.equal(status.paused.reason, "slow down");
    assert.equal(status.paused.until, clock.at + 90_000);
    const [[usage]] = await app.store.pool.query("SELECT chars FROM translation_usage");
    assert.equal(Number(usage.chars), "Attack range".length * 2, "only what was done is counted");
  });
});

// the routes have a server of their own: its translator remembers the languages it was asked for
const web = await startTestServer();
after(async () => {
  await web?.close();
});

describe("the routes know about languages", { skip: web ? false : skip }, () => {
  test("a visitor who reads the dictionary of a language asks for it", async () => {
    const before = await web.translations.status();
    assert.equal(before.wanted.includes("th"), false);
    const response = await web.browser().get("/api/content-translations?lang=th");
    assert.equal(response.status, 200);
    await until(
      async () => (await web.translations.status()).wanted.includes("th"),
      "Thai is asked for"
    );
    await web.browser().get("/api/content-translations?lang=zz");
    assert.equal((await web.translations.status()).wanted.includes("zz"), false);
  });

  test("an administrator asks for a language, or for all of them", async () => {
    const admin = await web.signIn("Languages", { admin: true });
    const reader = await web.signIn("Reader");
    const body = { language: "ko" };
    assert.equal((await web.browser().post("/api/admin/translations/languages", body)).status, 401);
    assert.equal(
      (await reader.browser.post("/api/admin/translations/languages", body)).status,
      403
    );
    const one = await admin.browser.post("/api/admin/translations/languages", body);
    assert.equal(one.status, 200, one.text);
    assert.equal(one.body.added, 1);
    assert.equal(
      (await admin.browser.post("/api/admin/translations/languages", body)).body.added,
      0,
      "already asked for"
    );
    assert.equal(
      (await admin.browser.post("/api/admin/translations/languages", { language: "klingon" }))
        .status,
      400
    );
    assert.equal((await admin.browser.post("/api/admin/translations/languages", {})).status, 400);
    const all = await admin.browser.post("/api/admin/translations/languages", { all: true });
    assert.equal(
      all.body.added,
      12,
      "the twelve that were not asked for yet (Thai, Korean and English, the language of the request that named an unknown one, were)"
    );
    const status = (await admin.browser.get("/api/admin/translations/status")).body;
    assert.equal(status.wanted.length, 15);
    assert.equal(status.languages.length, 15);
    assert.ok(status.languages.every(entry => entry.wanted));
  });
});
