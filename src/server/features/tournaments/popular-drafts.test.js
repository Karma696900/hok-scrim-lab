// The popular drafts: grouped by the hero of each lane, led by their best score, the best duos, and
// the phase each hero of a draft is picked in, with the enemy it answers.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { counterOf, pickPhase, popularDrafts } from "./popular-drafts.js";
import { popularDuos } from "./popular-duos.js";

const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
const TODAY = "2026-10-31";

function game({ blue, red, winner = "blue", known = true }) {
  return {
    gameNumber: 1,
    blueTeam: "Alpha",
    redTeam: "Beta",
    winner: winner === "blue" ? "Alpha" : "Beta",
    playedOn: TODAY,
    rule: "free-for-all",
    pickOrderKnown: known,
    picks: { blue, red },
    bans: { blue: [], red: [] },
    pickLanes: { blue: LANES, red: LANES }
  };
}

const RED = ["r1", "r2", "r3", "r4", "r5"];

describe("popular drafts, grouped by lane", () => {
  test("drafts sharing three heroes but not in the same lanes are not one group", () => {
    const games = [
      game({ blue: ["a", "b", "c", "d", "e"], red: RED }),
      game({ blue: ["a", "b", "c", "d", "e"], red: RED }),
      // a and b swapped lanes, d and e replaced: only c stands in the same lane
      game({ blue: ["b", "a", "c", "x", "y"], red: RED })
    ];
    const { blue } = popularDrafts(games, { today: TODAY });
    assert.equal(blue.groups, 2);
  });

  test("the draft with the best score leads its group, not only the most played", () => {
    const games = [
      game({ blue: ["a", "b", "c", "d", "e"], red: RED, winner: "red" }),
      game({ blue: ["a", "b", "c", "d", "e"], red: RED, winner: "red" }),
      game({ blue: ["a", "b", "c", "d", "e"], red: RED, winner: "red" }),
      game({ blue: ["a", "b", "c", "d", "z"], red: RED }),
      game({ blue: ["a", "b", "c", "d", "z"], red: RED })
    ];
    const [group] = popularDrafts(games, { today: TODAY }).blue.byPlays;
    assert.deepEqual(group.heroes, ["a", "b", "c", "d", "z"]);
    assert.equal(group.games, 5);
  });

  test("each hero of a draft has the phase it is picked in and the enemy it answers", () => {
    assert.deepEqual([0, 1, 2, 3, 4].map(pickPhase), ["first", "early", "early", "late", "last"]);
    const one = game({ blue: ["a", "b", "c", "d", "e"], red: RED });
    // blue picks 1, 4-5, 8-9 of the ten; red 2-3, 6-7, 10
    assert.equal(counterOf(one, "blue", 0), null);
    assert.equal(counterOf(one, "blue", 1), "r2");
    assert.equal(counterOf(one, "blue", 2), null);
    assert.equal(counterOf(one, "red", 0), "a");
    assert.equal(counterOf(one, "red", 4), "e");
    const [group] = popularDrafts([one, one], { today: TODAY }).blue.byPlays;
    assert.deepEqual(group.phases.b, { phase: "early", counterTo: "r2" });
    assert.deepEqual(group.phases.a, { phase: "first", counterTo: null });
  });

  test("a game whose pick order was not seen gives no phase", () => {
    const games = [game({ blue: ["a", "b", "c", "d", "e"], red: RED, known: false })];
    const [group] = popularDrafts(games, { today: TODAY }).blue.byPlays;
    assert.deepEqual(group.phases, {});
  });
});

describe("popular duos", () => {
  test("two heroes of a side, all lanes and by pair of lanes, ranked by score", () => {
    const games = [
      game({ blue: ["a", "j", "m", "f", "s"], red: ["p1", "p2", "p3", "p4", "p5"] }),
      game({ blue: ["b", "j", "n", "g", "s"], red: ["q1", "q2", "q3", "q4", "q5"] }),
      game({ blue: ["c", "k", "o", "h", "t"], red: RED, winner: "red" })
    ];
    const duos = popularDuos(games, { today: TODAY, minGames: 2 });
    assert.deepEqual(
      duos.all.map(duo => duo.heroes),
      [["j", "s"]]
    );
    const [jungleRoam] = duos.byLanes["Jungle+Roamer"];
    assert.deepEqual([jungleRoam.heroes, jungleRoam.games, jungleRoam.wins], [["j", "s"], 2, 2]);
    const run = () => JSON.stringify(popularDuos(games, { today: TODAY }));
    assert.equal(run(), run());
  });
});
