// Hero sheet fetch against a scripted fake Camp: what happens when the page stops answering.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createStallGuard } from "./stall-guard.js";
import { fetchHeroDetails } from "./hero-sync.js";

const API = "https://api-camp.honorofkings.com";

const timeoutError = () => {
  const error = new Error("page.waitForResponse: Timeout 30000ms exceeded.");
  error.name = "TimeoutError";
  return error;
};

/** A Camp response for one hero, shaped like the ones the real page triggers. */
function answer(endpoint, heroId, status = 200) {
  const adjust = endpoint.includes("adjust");
  return {
    url: () => `${API}${endpoint}`,
    request: () => ({
      method: () => "POST",
      postData: () => (adjust ? `{"heroId":"${heroId}"}` : `{"heroId":${heroId}}`)
    }),
    ok: () => status === 200,
    status: () => status,
    json: async () =>
      adjust
        ? { code: 0, data: { adjustInfo: [] } }
        : { code: 0, data: { baseInfo: { heroInfo: { heroId } } } }
  };
}

/**
 * A browser whose pages answer or stay silent as `script(pageNumber, heroId)` says: "ok", "silent"
 * (no request ever matches, the way a starved page behaves) or an HTTP status.
 */
function fakeCamp(script) {
  const opened = [];
  const closed = [];
  const browser = {
    newPage: async () => {
      const number = opened.length + 1;
      opened.push(number);
      return {
        goto: async () => {},
        evaluate: async () => {},
        close: async () => {
          closed.push(number);
        },
        waitForResponse: (matches, { timeout }) => {
          const wanted = [
            "/api/herowiki/getherodataall",
            "/api/game/adjust/adjustheroinfo"
          ].flatMap(endpoint => Array.from({ length: 60 }, (_, id) => [endpoint, id + 1]));
          const hit = wanted.find(([endpoint, id]) => matches(answer(endpoint, id)));
          if (!hit) {
            return Promise.reject(new Error(`nothing matches the wait (${timeout} ms)`));
          }
          const verdict = script(number, hit[1]);
          return verdict === "silent"
            ? Promise.reject(timeoutError())
            : Promise.resolve(answer(hit[0], hit[1], verdict === "ok" ? 200 : verdict));
        }
      };
    },
    close: async () => {}
  };
  return { browser, opened, closed };
}

async function run(script, heroIds) {
  const camp = fakeCamp(script);
  const results = [];
  let failure = null;
  try {
    await fetchHeroDetails(heroIds, {
      delayMs: 0,
      launch: async () => camp.browser,
      onHero: async (id, details, error) => {
        results.push([id, details ? "ok" : error.message.slice(0, 40)]);
      }
    });
  } catch (error) {
    failure = error;
  }
  return { ...camp, results, failure };
}

describe("stall guard", () => {
  test("carries on, then reloads, then gives up on silent heroes in a row", () => {
    const guard = createStallGuard();
    const verdicts = Array.from({ length: 9 }, () => guard.silent());
    assert.deepEqual(verdicts, [
      "continue",
      "continue",
      "reload",
      "continue",
      "continue",
      "reload",
      "continue",
      "continue",
      "give-up"
    ]);
  });

  test("an answered hero starts the count again", () => {
    const guard = createStallGuard();
    guard.silent();
    guard.silent();
    guard.answered();
    assert.deepEqual(
      [guard.silent(), guard.silent(), guard.silent()],
      ["continue", "continue", "reload"]
    );
  });
});

describe("fetchHeroDetails when Camp's page stops answering", () => {
  const ids = Array.from({ length: 12 }, (_, index) => index + 1);

  test("a healthy Camp is read with one page", async () => {
    const { results, opened, failure } = await run(() => "ok", ids);
    assert.equal(failure, null);
    assert.equal(results.filter(([, state]) => state === "ok").length, 12);
    assert.deepEqual(opened, [1]);
  });

  test("three silent heroes in a row: a fresh page is opened and the rest is read", async () => {
    const script = (page, heroId) => (page === 1 && heroId >= 3 ? "silent" : "ok");
    const { results, opened, closed, failure } = await run(script, ids);
    assert.equal(failure, null);
    assert.deepEqual(
      results.map(([, state]) => state === "ok"),
      [true, true, false, false, false, ...Array(7).fill(true)]
    );
    assert.deepEqual(opened, [1, 2]);
    assert.deepEqual(closed, [1], "the stuck page is closed once the fresh one is open");
  });

  test("a Camp that never answers again is given up after nine heroes, not eighty", async () => {
    const script = (page, heroId) => (heroId >= 2 ? "silent" : "ok");
    const { results, opened, failure } = await run(script, ids);
    assert.match(failure?.message ?? "", /stopped answering/);
    assert.equal(results.length, 10, "hero 1 read, then nine silent heroes, nothing after");
    assert.deepEqual(opened, [1, 2, 3], "two fresh pages were tried on the way");
  });

  test("heroes that answer with an error are not silence", async () => {
    const { results, opened, failure } = await run(() => 500, ids);
    assert.equal(failure, null);
    assert.equal(results.length, 12);
    assert.deepEqual(opened, [1]);
  });

  test("silence broken by an answer never adds up", async () => {
    const script = (page, heroId) => (heroId % 3 === 0 ? "ok" : "silent");
    const { results, opened, failure } = await run(script, ids);
    assert.equal(failure, null);
    assert.equal(results.length, 12);
    assert.deepEqual(opened, [1]);
  });
});
