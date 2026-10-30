// Behind a load balancer every instance of the server has the same timers. The jobs that ask a remote
// service (the Camp roster and hero sheets) are run by ONE instance at a time: a MySQL advisory lock of
// the database (store.runExclusive), released when the work ends, throws or the process dies.
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import { after, describe, test } from "node:test";
import { startDetailsSchedule } from "./details-sync.js";
import { startRosterSchedule } from "./roster-sync.js";
import { createStore } from "../../../platform/database/store.js";
import { createTestDatabase, startTestServer } from "../../../../testing/test-app.js";

const app = await startTestServer();
const stores = [];
after(async () => {
  for (const store of stores) {
    await store.closeDatabase();
  }
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";
/** Another instance of the server: its own pool on the same database. */
const instance = () => {
  const store = createStore(app.database.config);
  stores.push(store);
  return store;
};
const gate = () => {
  let open;
  const closed = new Promise(resolve => {
    open = resolve;
  });
  return { closed, open };
};

describe("one instance at a time", { skip }, () => {
  test("the second instance skips a job the first is running, and gets it once it is done", async () => {
    const [first, second] = [instance(), instance()];
    const door = gate();
    let started = false;
    const running = first.runExclusive("sync", async () => {
      started = true;
      await door.closed;
      return "crawled";
    });
    while (!started) {
      await pause(5);
    }
    assert.deepEqual(
      await second.runExclusive("sync", async () => assert.fail("must not run twice")),
      { ran: false }
    );
    assert.deepEqual(
      await second.runExclusive("another job", async () => "other"),
      { ran: true, result: "other" },
      "a lock is for the one job of that name"
    );
    door.open();
    assert.deepEqual(await running, { ran: true, result: "crawled" });
    assert.deepEqual(await second.runExclusive("sync", async () => "now me"), {
      ran: true,
      result: "now me"
    });
  });

  test("a job that needs the pool does not starve it, even with a pool of one connection", async () => {
    // the lock lives on a connection of its own: the job below needs the pool's only connection
    const store = createStore({ ...app.database.config, connectionLimit: 1 });
    stores.push(store);
    const outcome = await Promise.race([
      store.runExclusive("needs the pool", async () => {
        const [[row]] = await store.pool.query("SELECT 7 AS seven");
        return row.seven;
      }),
      pause(4000).then(() => "stuck: the job waits for a connection its own lock holds")
    ]);
    assert.deepEqual(outcome, { ran: true, result: 7 });
  });

  test("the translation lock is the same mechanism: one holder, a second asker gets null", async () => {
    const [first, second] = [instance(), instance()];
    const held = await first.contentLock();
    assert.ok(held, "the first one takes it");
    assert.equal(await second.contentLock(), null, "the second one is told somebody has it");
    await held.release();
    const again = await second.contentLock();
    assert.ok(again, "released: the second one can have it");
    await again.release();
  });

  test("a job that throws gives the lock back, and its error reaches the caller", async () => {
    const [first, second] = [instance(), instance()];
    await assert.rejects(
      first.runExclusive("fragile", async () => {
        throw new Error("Camp is down");
      }),
      /Camp is down/
    );
    assert.deepEqual(await second.runExclusive("fragile", async () => "fine"), {
      ran: true,
      result: "fine"
    });
  });

  test("the name belongs to the database: two databases on one MySQL server do not wait for each other", async () => {
    const database = await createTestDatabase(); // an empty second database: the lock needs no table
    const other = createStore(database.config);
    try {
      const door = gate();
      let started = false;
      const running = app.store.runExclusive("shared name", async () => {
        started = true;
        await door.closed;
      });
      while (!started) {
        await pause(5);
      }
      const result = await other.runExclusive("shared name", async () => "mine");
      assert.deepEqual(result, { ran: true, result: "mine" });
      door.open();
      await running;
    } finally {
      await other.closeDatabase();
      await database.drop();
    }
  });
});

describe("the timers use it", { skip }, () => {
  const fakeStore = (answers = [{ ran: true }]) => {
    const calls = [];
    return {
      calls,
      async runExclusive(name, work) {
        calls.push(name);
        const answer = answers.shift() ?? { ran: true };
        return answer.ran ? { ran: true, result: await work() } : answer;
      },
      async heroDetailsLanguages() {
        return ["fr"];
      },
      async readMetadata() {
        return null; // never synchronised: the first round is due
      }
    };
  };

  test("the roster sync asks for the lock, and does not run when another instance holds it", async () => {
    let runs = 0;
    const store = fakeStore([{ ran: false }, { ran: true }]);
    const stop = startRosterSchedule({
      store,
      rosterSync: { run: async () => (runs += 1) },
      intervalMs: 30,
      startupDelayMs: 5,
      logger: null
    });
    await pause(20);
    assert.equal(runs, 0, "the first round belonged to somebody else");
    await pause(60);
    stop();
    assert.ok(runs >= 1, "a later round ran");
    assert.ok(store.calls.every(name => name === "roster-sync"));
  });

  test("the hero sheets are crawled under one lock for all the languages", async () => {
    const runs = [];
    const store = fakeStore();
    const stop = startDetailsSchedule({
      store,
      detailsSync: { run: async (options = {}) => runs.push(options.lang ?? "en") },
      intervalMs: 10_000,
      startupDelayMs: 5,
      logger: null
    });
    await pause(60);
    stop();
    assert.deepEqual(runs, ["en", "fr"]);
    assert.deepEqual(store.calls, ["hero-details-sync"], "one lock, not one per language");
  });
});
