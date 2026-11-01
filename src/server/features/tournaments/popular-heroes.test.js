// The popular heroes ranked by the shared score: recent games weigh more, a win rate pulled toward the
// lane's average, and the bans counted in the presence of a hero.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { popularHeroes } from "./popular.js";

const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
const TODAY = "2026-10-31";

function game({ blue, red, winner = "blue", playedOn = TODAY, lanes = true, bans = [[], []] }) {
  return {
    gameNumber: 1,
    blueTeam: "Alpha",
    redTeam: "Beta",
    winner: winner === "blue" ? "Alpha" : "Beta",
    playedOn,
    rule: "free-for-all",
    picks: { blue, red },
    bans: { blue: bans[0], red: bans[1] },
    pickLanes: lanes ? { blue: LANES, red: LANES } : null
  };
}

const team = (clash, start) => [
  clash,
  `f${start + 1}`,
  `f${start + 2}`,
  `f${start + 3}`,
  `f${start + 4}`
];
const clashOf = result => result.lanes.find(entry => entry.lane === "Clash Lane");
const entryOf = (list, heroId) => list.find(entry => entry.heroId === heroId);

describe("popular heroes, the shared score", () => {
  test("the same win rate ranks higher when the wins are recent", () => {
    const games = [];
    for (let i = 0; i < 5; i += 1) {
      // "old" won long ago and lost lately; "new" the other way round
      games.push(game({ blue: team("old", 0), red: team("new", 10), playedOn: "2026-08-01" }));
      games.push(game({ blue: team("old", 0), red: team("new", 10), winner: "red" }));
    }
    const clash = clashOf(popularHeroes(games, { today: TODAY }));
    const [first] = clash.all.byWinRate;
    assert.equal(first.heroId, "new");
    assert.equal(entryOf(clash.all.byWinRate, "old").winRate, 0.5);
    assert.ok(first.score > entryOf(clash.all.byWinRate, "old").score);
  });

  test("a hero that won its only game does not pass one that won 18 of 25", () => {
    const games = [game({ blue: team("lucky", 0), red: team("x0", 10) })];
    for (let i = 0; i < 25; i += 1) {
      games.push(
        game({
          blue: team("solid", 20),
          red: team(`x${i % 3}`, 30),
          winner: i < 18 ? "blue" : "red"
        })
      );
    }
    const clash = clashOf(popularHeroes(games, { today: TODAY }));
    const order = clash.all.byWinRate.map(entry => entry.heroId);
    assert.ok(order.indexOf("solid") < order.indexOf("lucky"), order.join(","));
  });

  test("a hero banned in every game and never played is fully present in its lanes", () => {
    const games = [
      game({ blue: team("a", 0), red: team("b", 10), bans: [["banned"], []] }),
      game({ blue: team("a", 0), red: team("b", 10), bans: [[], ["banned"]], lanes: false })
    ];
    const result = popularHeroes(games, { today: TODAY, heroLanes: { banned: ["Jungle"] } });
    const jungle = result.lanes.find(entry => entry.lane === "Jungle");
    const banned = entryOf(jungle.all.byPresence, "banned");
    assert.deepEqual(
      [banned.presence, banned.banRate, banned.pickRate, banned.games],
      [1, 1, 0, 0]
    );
    const a = entryOf(clashOf(result).all.byPresence, "a");
    // picked in both games, but the second one has no lanes: its pick is not placed
    assert.equal(a.presence, 1);
    assert.equal(a.pickRate, 0.5);
    assert.equal(result.unplaced, 10);
  });

  test("the same games give the same lists", () => {
    const games = [
      game({ blue: team("a", 0), red: team("b", 10), playedOn: "2026-10-01" }),
      game({ blue: team("b", 0), red: team("a", 10), winner: "red" })
    ];
    const run = () => JSON.stringify(popularHeroes(games, { today: TODAY }));
    assert.equal(run(), run());
  });
});
