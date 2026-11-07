// A spectator's own spin (owner, 2026-11-07: "les spectators peuvent aussi spin, mais ça ne s'appliquera pas sur
// l'original"): drawn in the browser with the roulette's pools and bans and the same rule as the server, shown on that
// screen only; the roulette everyone sees does not change.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { creatorSpun, localSpin, shownState } from "./casino-local.js";

const roll = {
  id: "Ab3dE5gH9k",
  version: 4,
  pools: {
    clash: ["a", "b"],
    jungle: ["c", "d"],
    mid: ["e", "f"],
    farm: ["g", "h"],
    roam: ["i", "j"]
  },
  banned: ["b"],
  result: { clash: "a", jungle: "c", mid: "e", farm: "g", roam: "i" },
  drawn: [],
  history: [{ at: 100, kind: "spin", lanes: [], result: {} }]
};
const known = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
const first = n => 0 * n;
const last = n => n - 1;

describe("a spectator's own spin", () => {
  test("draws every lane from the roulette's pools, without its banned heroes", () => {
    const local = localSpin(roll, null, ["clash", "jungle", "mid", "farm", "roam"], {
      known,
      pick: last,
      now: 200
    });
    assert.deepEqual(local.result, { clash: "a", jungle: "d", mid: "f", farm: "h", roam: "j" });
    assert.deepEqual(local.drawn, ["clash", "jungle", "mid", "farm", "roam"]);
  });

  test("a respin changes only the chosen lane, from what this screen shows", () => {
    const mine = localSpin(roll, null, ["mid"], { known, pick: first, now: 200 });
    assert.equal(mine.result.mid, "f");
    const again = localSpin(roll, mine, ["mid"], { known, pick: first, now: 300 });
    assert.equal(again.result.mid, "e");
    assert.equal(again.result.clash, "a");
    assert.deepEqual(again.drawn, ["mid"]);
  });

  test("never changes the roulette it was drawn from", () => {
    const before = JSON.stringify(roll);
    localSpin(roll, null, ["clash", "mid"], { known, pick: last, now: 200 });
    assert.equal(JSON.stringify(roll), before);
  });

  test("the screen shows the spectator's heroes with the roulette's pools, bans and history", () => {
    const local = localSpin(roll, null, ["mid"], { known, pick: first, now: 200 });
    const shown = shownState({ ...roll, banned: ["b", "h"] }, local);
    assert.equal(shown.result.mid, "f");
    assert.deepEqual(shown.banned, ["b", "h"]);
    assert.deepEqual(shown.history, roll.history);
    assert.deepEqual(shown.drawn, ["mid"]);
    assert.equal(shownState(roll, null), roll);
  });

  test("knows when the creator spun after it, but not when the creator only changed a pool", () => {
    const local = localSpin(roll, null, ["mid"], { known, pick: first, now: 200 });
    assert.equal(
      creatorSpun({ ...roll, version: 5, pools: { ...roll.pools, mid: ["e"] } }, local),
      false
    );
    const spun = { ...roll, version: 6, history: [{ at: 400, kind: "respin" }, ...roll.history] };
    assert.equal(creatorSpun(spun, local), true);
    const again = localSpin(spun, local, ["clash"], { known, pick: first, now: 500 });
    assert.equal(creatorSpun(spun, again), true, "a new spin of the spectator does not hide it");
  });
});
