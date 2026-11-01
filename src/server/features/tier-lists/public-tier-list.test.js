// The public tier list: tournaments first (best score SS, worst D, six equal bands between them),
// the editors' rating for the heroes played too little, the others not ranked yet.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { LANE_SLUGS, publicTierList, tierOf } from "./public-tier-list.js";

const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
const entry = (heroId, games, score) => ({
  heroId,
  games,
  wins: Math.round(games * score),
  winRate: score,
  pickRate: 0.1,
  score
});
const lanesWith = clash =>
  LANES.map(lane => ({ lane, all: { byWinRate: lane === "Clash Lane" ? clash : [] } }));
const heroes = ids => ids.map(([id, lanes, name]) => ({ id, name: name ?? id, lanes }));
const official = (lane, tiers) => ({
  [lane]: { tiers: Object.entries(tiers).map(([label, ids]) => ({ label, heroes: ids })) }
});
const tierOfHero = (result, lane, heroId) =>
  result.lanes
    .find(item => item.lane === lane)
    .tiers.find(tier => tier.heroes.some(hero => hero.heroId === heroId))?.label ?? null;

describe("the public tier list", () => {
  test("six equal bands between the worst and the best score", () => {
    assert.equal(tierOf(0.7, 0.4, 0.7), "SS");
    assert.equal(tierOf(0.4, 0.4, 0.7), "D");
    assert.equal(tierOf(0.52, 0.4, 0.7), "B");
    assert.equal(tierOf(0.62, 0.4, 0.7), "S");
    // one hero alone, or every score equal: the best, SS
    assert.equal(tierOf(0.5, 0.5, 0.5), "SS");
  });

  test("tournaments first: the best of a lane is SS, the worst D, the editors' tier ignored", () => {
    const result = publicTierList({
      lanes: lanesWith([entry("a", 30, 0.7), entry("b", 20, 0.55), entry("c", 12, 0.4)]),
      official: official("Clash Lane", { D: ["a"], SS: ["c"] }),
      heroes: heroes([
        ["a", ["Clash Lane"]],
        ["b", ["Clash Lane"]],
        ["c", ["Clash Lane"]]
      ]),
      minGames: 10
    });
    assert.equal(tierOfHero(result, "Clash Lane", "a"), "SS");
    assert.equal(tierOfHero(result, "Clash Lane", "c"), "D");
    const clash = result.lanes.find(item => item.lane === "Clash Lane");
    assert.equal(clash.slug, LANE_SLUGS["Clash Lane"]);
    const a = clash.tiers[0].heroes[0];
    assert.deepEqual([a.heroId, a.source, a.games], ["a", "tournaments", 30]);
  });

  test("a hero played too little takes the editors' tier; one with neither is not ranked yet", () => {
    const result = publicTierList({
      lanes: lanesWith([entry("a", 30, 0.7), entry("b", 20, 0.5), entry("few", 3, 0.9)]),
      official: official("Clash Lane", { A: ["few"], B: ["rated"] }),
      heroes: heroes([
        ["a", ["Clash Lane"]],
        ["b", ["Clash Lane"]],
        ["few", ["Clash Lane"]],
        ["rated", ["Clash Lane"]],
        ["new", ["Clash Lane"]]
      ]),
      minGames: 10
    });
    assert.equal(tierOfHero(result, "Clash Lane", "few"), "A");
    assert.equal(tierOfHero(result, "Clash Lane", "rated"), "B");
    const clash = result.lanes.find(item => item.lane === "Clash Lane");
    const few = clash.tiers.flatMap(tier => tier.heroes).find(hero => hero.heroId === "few");
    assert.equal(few.source, "editors");
    assert.deepEqual(clash.unranked, ["new"]);
  });

  test("a lane with no hero above the minimum falls back on the editors entirely", () => {
    const result = publicTierList({
      lanes: lanesWith([entry("a", 2, 0.9)]),
      official: official("Clash Lane", { S: ["a"] }),
      heroes: heroes([["a", ["Clash Lane"]]]),
      minGames: 10
    });
    assert.equal(tierOfHero(result, "Clash Lane", "a"), "S");
    assert.equal(result.lanes.length, 5);
    assert.ok(
      result.lanes.every(lane => lane.tiers.map(tier => tier.label).join() === "SS,S,A,B,C,D")
    );
  });

  test("within a tier: best score first, then name; the same input gives the same list", () => {
    const input = {
      lanes: lanesWith([entry("z", 20, 0.7), entry("y", 20, 0.7), entry("x", 20, 0.4)]),
      official: {},
      heroes: heroes([
        ["z", ["Clash Lane"], "Alpha"],
        ["y", ["Clash Lane"], "Beta"],
        ["x", ["Clash Lane"], "Gamma"]
      ]),
      minGames: 10
    };
    const result = publicTierList(input);
    const ss = result.lanes[0].tiers[0].heroes.map(hero => hero.heroId);
    assert.deepEqual(ss, ["z", "y"]);
    assert.equal(JSON.stringify(publicTierList(input)), JSON.stringify(result));
  });
});
