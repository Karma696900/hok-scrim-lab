// The roulettes in the database: made, read back, changed only from the version that was read (two control devices at
// once never overwrite each other), and deleted after 7 days without use.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { startTestServer } from "../../../testing/test-app.js";
import { emptyState } from "./casino-domain.js";

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const DAY = 24 * 60 * 60 * 1000;
const pools = { clash: ["h01"], jungle: ["h02"], mid: ["h03"], farm: ["h04"], roam: ["h05"] };
let serial = 0;
const newId = () => `Tst${String((serial += 1)).padStart(7, "0")}`;

describe("the casino store", { skip }, () => {
  test("a roulette is created, read back and updated", async () => {
    const id = newId();
    await app.store.createCasino({ id, keyHash: "a".repeat(64), state: emptyState(pools) });
    const made = await app.store.readCasino(id);
    assert.equal(made.version, 0);
    assert.equal(made.keyHash, "a".repeat(64));
    assert.deepEqual(made.state, emptyState(pools));
    const next = { ...emptyState(pools), banned: ["h09"] };
    assert.equal(await app.store.updateCasino(id, 0, next), true);
    const read = await app.store.readCasino(id);
    assert.equal(read.version, 1);
    assert.deepEqual(read.state.banned, ["h09"]);
    assert.equal(await app.store.readCasino("Nope000000"), null);
  });

  test("a stale version does not overwrite", async () => {
    const id = newId();
    await app.store.createCasino({ id, keyHash: "b".repeat(64), state: emptyState(pools) });
    const first = { ...emptyState(pools), banned: ["first"] };
    const second = { ...emptyState(pools), banned: ["second"] };
    assert.equal(await app.store.updateCasino(id, 0, first), true);
    assert.equal(await app.store.updateCasino(id, 0, second), false);
    assert.deepEqual((await app.store.readCasino(id)).state.banned, ["first"]);
  });

  test("a roulette untouched for 7 days is purged", async () => {
    const now = Date.now() + 100 * DAY;
    const old = newId();
    const recent = newId();
    await app.store.createCasino(
      { id: old, keyHash: "c".repeat(64), state: emptyState(pools) },
      now - 7 * DAY - 1
    );
    await app.store.createCasino(
      { id: recent, keyHash: "d".repeat(64), state: emptyState(pools) },
      now - 6 * DAY
    );
    assert.ok((await app.store.purgeCasinos(now)) >= 1);
    assert.equal(await app.store.readCasino(old), null);
    assert.ok(await app.store.readCasino(recent));
  });
});
