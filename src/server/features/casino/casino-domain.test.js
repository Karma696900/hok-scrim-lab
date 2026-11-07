// The composition roulette's draw rules (spec 2026-11-07 casino): one hero per lane from that lane's pool, never twice
// in a composition, never a banned hero nor one the site no longer lists, the lanes not drawn kept.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  LANE_KEYS,
  banLane,
  defaultPools,
  draw,
  emptyState,
  laneKeyOf,
  parseLanes,
  parsePools,
  unban
} from "./casino-domain.js";

const known = new Set(["a", "b", "c", "d", "e", "f", "g"]);
const first = () => 0;
let seed = 1;
// a small seeded generator: the same draws on every run
const seeded = n => {
  seed = (seed * 16807) % 2147483647;
  return seed % n;
};
const every = ids => Object.fromEntries(LANE_KEYS.map(lane => [lane, [...ids]]));
const spin = (state, lanes = LANE_KEYS, now = 1, rest = {}) =>
  draw(state, lanes, { known, pick: seeded, now, kind: "spin", ...rest });

describe("casino draw", () => {
  test("a full spin takes each lane's hero from that lane's pool", () => {
    const pools = { clash: ["a"], jungle: ["b"], mid: ["c"], farm: ["d"], roam: ["e"] };
    const state = draw(emptyState(pools), LANE_KEYS, { known, pick: first, now: 5, kind: "spin" });
    assert.deepEqual(state.result, { clash: "a", jungle: "b", mid: "c", farm: "d", roam: "e" });
    assert.deepEqual(state.drawn, LANE_KEYS);
    assert.equal(state.history[0].kind, "spin");
    assert.equal(state.history[0].at, 5);
  });

  test("no hero twice in a composition", () => {
    let state = emptyState(every(["a", "b", "c", "d", "e"]));
    for (let i = 0; i < 200; i += 1) {
      state = spin(state);
      assert.equal(new Set(Object.values(state.result)).size, 5, JSON.stringify(state.result));
    }
  });

  test("a respin keeps the lanes not ticked", () => {
    for (let i = 0; i < 50; i += 1) {
      const before = spin(emptyState(every(["a", "b", "c", "d", "e", "f", "g"])));
      const after = spin(before, ["mid"], 2, { kind: "respin" });
      for (const lane of LANE_KEYS.filter(l => l !== "mid")) {
        assert.equal(after.result[lane], before.result[lane]);
      }
      const kept = LANE_KEYS.filter(l => l !== "mid").map(l => before.result[l]);
      assert.ok(!kept.includes(after.result.mid));
      assert.deepEqual(after.drawn, ["mid"]);
      assert.equal(after.history[0].kind, "respin");
    }
  });

  test("a respin always changes the lane's hero when its pool has another (owner, 2026-11-07)", () => {
    const pools = { ...every([]), mid: ["c", "d"] };
    let state = draw(emptyState(pools), ["mid"], { known, pick: first, now: 1, kind: "spin" });
    for (let i = 0; i < 20; i += 1) {
      const before = state.result.mid;
      state = draw(state, ["mid"], { known, pick: seeded, now: 2, kind: "respin" });
      assert.notEqual(state.result.mid, before);
    }
  });

  test("a full spin changes every lane's hero when the pools allow it", () => {
    const state = spin(emptyState(every(["a", "b", "c", "d", "e", "f", "g"])));
    const again = spin(state);
    for (const lane of LANE_KEYS) {
      assert.notEqual(again.result[lane], state.result[lane], lane);
    }
  });

  test("a respin keeps the hero when it is the only one its pool has left", () => {
    const pools = { ...every([]), mid: ["c"] };
    const once = draw(emptyState(pools), ["mid"], { known, pick: first, now: 1, kind: "spin" });
    const again = draw(once, ["mid"], { known, pick: seeded, now: 2, kind: "respin" });
    assert.equal(again.result.mid, "c");
  });

  test("an empty pool leaves its lane empty", () => {
    const state = spin(emptyState({ ...every(["a", "b", "c", "d", "e"]), roam: [] }));
    assert.equal(state.result.roam, null);
    for (const lane of LANE_KEYS.filter(l => l !== "roam")) {
      assert.ok(state.result[lane]);
    }
  });

  test("a banned hero is never drawn", () => {
    const state = { ...emptyState({ ...every([]), mid: ["a", "b"] }), banned: ["a"] };
    for (let i = 0; i < 50; i += 1) {
      assert.equal(spin(state).result.mid, "b");
    }
  });

  test("a hero no longer on the site is never drawn", () => {
    const state = emptyState({ ...every([]), mid: ["gone", "b"] });
    for (let i = 0; i < 50; i += 1) {
      assert.equal(spin(state).result.mid, "b");
    }
  });

  test("the draw does not change the state it is given", () => {
    const state = emptyState(every(["a", "b", "c", "d", "e"]));
    const copy = structuredClone(state);
    spin(state);
    assert.deepEqual(state, copy);
  });

  test("banLane bans the shown hero and respins its lane", () => {
    const pools = { clash: ["a"], jungle: ["b"], mid: ["c", "f"], farm: ["d"], roam: ["e"] };
    const shown = draw(emptyState(pools), LANE_KEYS, { known, pick: first, now: 1, kind: "spin" });
    assert.equal(shown.result.mid, "c");
    const after = banLane(shown, "mid", { known, pick: first, now: 2 });
    assert.ok(after.banned.includes("c"));
    assert.equal(after.result.mid, "f");
    assert.deepEqual(after.drawn, ["mid"]);
    assert.deepEqual(
      { kind: after.history[0].kind, hero: after.history[0].hero, lanes: after.history[0].lanes },
      { kind: "ban", hero: "c", lanes: ["mid"] }
    );
  });

  test("banLane refuses a lane that shows nobody", () => {
    assert.throws(() => banLane(emptyState(every([])), "mid", { known, pick: first, now: 1 }), {
      code: "nothing_to_ban"
    });
  });

  test("unban puts a hero back without drawing", () => {
    const shown = spin(emptyState(every(["a", "b", "c", "d", "e", "f"])));
    const banned = { ...shown, banned: ["f", "g"] };
    const after = unban(banned, "f");
    assert.deepEqual(after.banned, ["g"]);
    assert.deepEqual(after.result, banned.result);
    assert.deepEqual(after.history, banned.history);
    assert.deepEqual(unban(banned, "zzz").banned, ["f", "g"]);
  });

  test("the history keeps the last 10, newest first", () => {
    let state = emptyState(every(["a", "b", "c", "d", "e"]));
    for (let i = 1; i <= 12; i += 1) {
      state = spin(state, LANE_KEYS, i);
    }
    assert.equal(state.history.length, 10);
    assert.equal(state.history[0].at, 12);
    assert.equal(state.history[9].at, 3);
  });
});

describe("casino requests", () => {
  test("parseLanes refuses unknown, empty and repeated lanes", () => {
    assert.deepEqual(parseLanes({ lanes: ["roam", "clash"] }), ["clash", "roam"]);
    for (const lanes of [[], ["top"], ["mid", "mid"], "mid", undefined]) {
      assert.throws(() => parseLanes({ lanes }), { code: "invalid_lanes" });
    }
  });

  test("parsePools drops unknown ids and refuses more than 200 in a lane", () => {
    const pools = parsePools({ pools: { ...every([]), mid: ["a", "zzz", "a", "b"] } }, known);
    assert.deepEqual(pools.mid, ["a", "b"]);
    assert.deepEqual(pools.roam, []);
    const many = Array.from({ length: 201 }, (_, i) => `h${i}`);
    assert.throws(() => parsePools({ pools: { ...every([]), mid: many } }, new Set(many)), {
      code: "invalid_pools"
    });
    assert.throws(() => parsePools({ pools: { mid: "a" } }, known), { code: "invalid_pools" });
    assert.throws(() => parsePools({ pools: [] }, known), { code: "invalid_pools" });
  });

  test("defaultPools puts a two-lane hero in both pools", () => {
    const pools = defaultPools([
      { id: "b", lanes: ["Mid Lane"] },
      { id: "a", lanes: ["Mid Lane", "Roamer"] },
      { id: "c", lanes: ["Clash Lane"] }
    ]);
    assert.deepEqual(pools, { clash: ["c"], jungle: [], mid: ["a", "b"], farm: [], roam: ["a"] });
  });

  test("laneKeyOf maps the site's lane names", () => {
    assert.equal(laneKeyOf("Roamer"), "roam");
    assert.equal(laneKeyOf("Farm Lane"), "farm");
    assert.equal(laneKeyOf("Nowhere"), null);
  });
});
