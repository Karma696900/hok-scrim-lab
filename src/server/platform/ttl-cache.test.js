// The in-memory cache behind the expensive public reads (server/platform/cache.js).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createTtlCache } from "./cache.js";

const clock = () => {
  const time = { at: 1_000_000 };
  return { time, now: () => time.at };
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

describe("createTtlCache", () => {
  test("needs a positive lifetime", () => {
    assert.throws(() => createTtlCache({ ttlMs: 0 }));
    assert.throws(() => createTtlCache({}));
  });

  test("computes once while the entry is fresh, again after it expires", async () => {
    const { time, now } = clock();
    const cache = createTtlCache({ ttlMs: 1000, now });
    let runs = 0;
    const compute = async () => ++runs;
    assert.equal(await cache.remember("a", compute), 1);
    assert.equal(await cache.remember("a", compute), 1, "still fresh");
    time.at += 999;
    assert.equal(await cache.remember("a", compute), 1, "one millisecond before the end");
    time.at += 2;
    assert.equal(await cache.remember("a", compute), 2, "expired: computed again");
    assert.equal(await cache.remember("b", compute), 3, "another key is another entry");
  });

  test("people asking at the same time share one computation", async () => {
    const cache = createTtlCache({ ttlMs: 1000 });
    const gate = deferred();
    let runs = 0;
    const compute = () => {
      runs += 1;
      return gate.promise;
    };
    const asking = [
      cache.remember("k", compute),
      cache.remember("k", compute),
      cache.remember("k", compute)
    ];
    gate.resolve("value");
    assert.deepEqual(await Promise.all(asking), ["value", "value", "value"]);
    assert.equal(runs, 1);
  });

  test("a failure reaches everyone who was waiting and is not kept", async () => {
    const cache = createTtlCache({ ttlMs: 1000 });
    const gate = deferred();
    let runs = 0;
    const failing = () => {
      runs += 1;
      return gate.promise;
    };
    const asking = [cache.remember("k", failing), cache.remember("k", failing)];
    gate.reject(new Error("database is down"));
    const outcomes = await Promise.allSettled(asking);
    assert.deepEqual(
      outcomes.map(outcome => outcome.status),
      ["rejected", "rejected"]
    );
    assert.equal(runs, 1);
    assert.equal(await cache.remember("k", async () => "recovered"), "recovered", "asked again");
    // a computation that throws before it returns a promise is a failure too, not a crash
    const other = createTtlCache({ ttlMs: 1000 });
    await assert.rejects(
      other.remember("x", () => {
        throw new Error("sync");
      }),
      /sync/
    );
    assert.equal(await other.remember("x", async () => 7), 7);
  });

  test("a read that began before clear() is not stored after it", async () => {
    const cache = createTtlCache({ ttlMs: 1000 });
    const gate = deferred();
    const reading = cache.remember("k", () => gate.promise); // started before the write
    cache.clear(); // the write
    gate.resolve("stale");
    assert.equal(await reading, "stale", "the asker still gets what it read");
    assert.equal(cache.size, 0, "but nobody else will");
    assert.equal(await cache.remember("k", async () => "fresh"), "fresh");
  });

  test("a computation that never ends fails for those who wait and does not block the key for ever", async () => {
    const cache = createTtlCache({ ttlMs: 1000, maxWaitMs: 40 });
    const stuck = () => new Promise(() => {}); // a query that never answers
    const first = cache.remember("k", stuck);
    const second = cache.remember("k", stuck); // joins the first one's wait
    await assert.rejects(first, /took too long/);
    await assert.rejects(second, /took too long/);
    assert.equal(cache.size, 0, "nothing was kept");
    assert.equal(await cache.remember("k", async () => "later"), "later", "asked again, it works");
    // an answer that arrives after the wait ended is nobody's business, and not an unhandled rejection
    const late = createTtlCache({ ttlMs: 1000, maxWaitMs: 20 });
    let fail;
    const slow = new Promise((_, reject) => {
      fail = reject;
    });
    await assert.rejects(
      late.remember("x", () => slow),
      /took too long/
    );
    fail(new Error("too late"));
    await new Promise(resolve => setTimeout(resolve, 30));
  });

  test("past the limit the least recently used entry goes", async () => {
    const cache = createTtlCache({ ttlMs: 1000, maxEntries: 2 });
    const runs = { a: 0, b: 0, c: 0 };
    const make = key => async () => ++runs[key];
    await cache.remember("a", make("a"));
    await cache.remember("b", make("b"));
    await cache.remember("a", make("a")); // a is used again: b is now the oldest
    await cache.remember("c", make("c")); // pushes b out
    assert.equal(cache.size, 2);
    await cache.remember("a", make("a"));
    assert.equal(runs.a, 1, "a stayed");
    await cache.remember("b", make("b"));
    assert.equal(runs.b, 2, "b was dropped and computed again");
  });
});
