// The proposal of the lane of each pick (shared/lane-suggestion.js): only what is forced by the lanes the
// heroes are listed for, never a guess, never over what was entered.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { suggestLanes } from "./lane-suggestion.js";

const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
const slot = (heroId, heroLanes, lane = null) => ({ heroId, heroLanes, lane });

describe("suggestLanes", () => {
  test("every hero with one lane gets it", () => {
    const out = suggestLanes(
      LANES.map((lane, i) => slot(`h${i}`, [lane])),
      LANES
    );
    assert.deepEqual(out, LANES);
  });

  test("a forced chain is followed: the hero with one lane frees the others", () => {
    const out = suggestLanes(
      [
        slot("a", ["Mid Lane", "Jungle"]),
        slot("b", ["Jungle"]),
        slot("c", ["Clash Lane", "Roamer"]),
        slot("d", ["Farm Lane"]),
        slot("e", ["Roamer"])
      ],
      LANES
    );
    assert.deepEqual(out, ["Mid Lane", "Jungle", "Clash Lane", "Farm Lane", "Roamer"]);
  });

  test("an ambiguous pair stays empty, nothing is guessed", () => {
    const out = suggestLanes(
      [
        slot("a", ["Mid Lane", "Jungle"]),
        slot("b", ["Mid Lane", "Jungle"]),
        slot("c", ["Clash Lane"]),
        slot("d", ["Farm Lane"]),
        slot("e", ["Roamer"])
      ],
      LANES
    );
    assert.deepEqual(out, [null, null, "Clash Lane", "Farm Lane", "Roamer"]);
  });

  test("two heroes stuck on the same single lane get neither", () => {
    const out = suggestLanes(
      [
        slot("a", ["Jungle"]),
        slot("b", ["Jungle"]),
        slot("c", ["Mid Lane"]),
        slot(null, []),
        slot(null, [])
      ],
      LANES
    );
    assert.deepEqual(out, [null, null, "Mid Lane", null, null]);
  });

  test("a lane already entered is never changed, and is taken from the others", () => {
    const out = suggestLanes(
      [
        slot("a", ["Mid Lane", "Jungle"], "Mid Lane"),
        slot("b", ["Mid Lane", "Jungle"]),
        slot(null, []),
        slot(null, []),
        slot(null, [])
      ],
      LANES
    );
    assert.deepEqual(out, ["Mid Lane", "Jungle", null, null, null]);
  });

  test("with fewer than five heroes a lane that only one could take is not inferred", () => {
    const out = suggestLanes(
      [
        slot("a", ["Mid Lane", "Jungle"]),
        slot("b", ["Jungle", "Roamer"]),
        slot(null, []),
        slot(null, []),
        slot(null, [])
      ],
      LANES
    );
    assert.deepEqual(
      out,
      [null, null, null, null, null],
      "Mid could be unplayed, so a is not forced"
    );
  });

  test("a hero with no list of lanes stays empty", () => {
    const out = suggestLanes(
      [slot("a", undefined), slot("b", []), slot(null, []), slot(null, []), slot(null, [])],
      LANES
    );
    assert.deepEqual(out, [null, null, null, null, null]);
  });
});
