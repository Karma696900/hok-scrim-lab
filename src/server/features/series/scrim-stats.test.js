// "Your scrims": statistics from the viewer's own games only, withheld below the sample threshold.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { computeAllHeroScrimStats, computeHeroScrimStats } from "./scrim-stats.js";
import { startTestServer } from "../../../testing/test-app.js";

const ids = (prefix, from, count) =>
  Array.from({ length: count }, (_, index) => `${prefix}${String(from + index).padStart(2, "0")}`);

/** A completed game: team "A" blue with h01-h05, team "B" red with h11-h15. */
function game(index, winner, overrides = {}) {
  return {
    blueTeam: "A",
    redTeam: "B",
    winner,
    durationSeconds: 1200,
    gameNumber: index + 1,
    draft: {
      bans: { blue: ids("h", 21, 5), red: ids("h", 26, 5) },
      picks: { blue: ids("h", 1, 5), red: ids("h", 11, 5) },
      pickAssignments: { blue: [{ heroId: "h01", lane: "Clash Lane" }], red: [] },
      ...overrides
    }
  };
}
const series = games => ({ games });

describe("hero statistics from your scrims", () => {
  test("below the threshold counts are shown but percentages are withheld", () => {
    const stats = computeHeroScrimStats(
      [series(Array.from({ length: 29 }, (_, index) => game(index, "A")))],
      "h01",
      { minGames: 30 }
    );
    assert.equal(stats.label, "Your scrims");
    assert.equal(stats.picked, 29);
    assert.equal(stats.wins, 29);
    assert.equal(stats.winRate, null);
    assert.equal(stats.pickRate, null);
    assert.equal(stats.insufficient, true);
    assert.ok(stats.synergies.every(entry => entry.insufficient && entry.winRate === null));
    assert.ok(stats.matchups.every(entry => entry.insufficient && entry.winRate === null));
  });

  test("at the threshold the percentages appear", () => {
    const games = Array.from({ length: 30 }, (_, index) => game(index, index < 21 ? "A" : "B"));
    const stats = computeHeroScrimStats([series(games)], "h01", { minGames: 30 });
    assert.equal(stats.insufficient, false);
    assert.equal(stats.winRate, 0.7);
    assert.equal(stats.pickRate, 1);
    const synergy = stats.synergies.find(entry => entry.heroId === "h02");
    assert.deepEqual(
      [synergy.games, synergy.wins, synergy.winRate, synergy.insufficient],
      [30, 21, 0.7, false]
    );
    const matchup = stats.matchups.find(entry => entry.heroId === "h11");
    assert.deepEqual([matchup.games, matchup.wins, matchup.winRate], [30, 21, 0.7]);
    assert.deepEqual(stats.lanes, [
      { lane: "Clash Lane", games: 30, wins: 21, winRate: 0.7, insufficient: false }
    ]);
  });

  test("the threshold is configurable", () => {
    const games = Array.from({ length: 5 }, (_, index) => game(index, "A"));
    assert.equal(computeHeroScrimStats([series(games)], "h01", { minGames: 5 }).winRate, 1);
    assert.equal(computeHeroScrimStats([series(games)], "h01", { minGames: 6 }).winRate, null);
  });

  test("sides are respected: the red team's hero wins when red wins", () => {
    const stats = computeHeroScrimStats(
      [series([game(0, "B"), game(1, "B"), game(2, "A")])],
      "h11",
      { minGames: 1 }
    );
    assert.deepEqual([stats.picked, stats.wins, stats.losses, stats.winRate], [3, 2, 1, 2 / 3]);
    assert.equal(stats.matchups.find(entry => entry.heroId === "h01").games, 3);
    assert.equal(stats.synergies.find(entry => entry.heroId === "h12").wins, 2);
  });

  test("bans are counted separately from picks; absent heroes have zeros", () => {
    const stats = computeHeroScrimStats([series([game(0, "A"), game(1, "A")])], "h21", {
      minGames: 1
    });
    assert.deepEqual([stats.picked, stats.banned, stats.banRate], [0, 2, 1]);
    const nobody = computeHeroScrimStats([series([game(0, "A")])], "h99", { minGames: 1 });
    assert.deepEqual([nobody.picked, nobody.banned, nobody.winRate], [0, 0, null]);
  });

  test("an empty history is not an error", () => {
    const stats = computeHeroScrimStats([], "h01", { minGames: 30 });
    assert.deepEqual(
      [stats.totalGames, stats.picked, stats.winRate, stats.synergies],
      [0, 0, null, []]
    );
  });

  test("all-hero table applies the same rule", () => {
    const table = computeAllHeroScrimStats(
      [series(Array.from({ length: 3 }, (_, index) => game(index, "A")))],
      { minGames: 3 }
    );
    assert.equal(table.totalGames, 3);
    assert.equal(table.rows.find(row => row.heroId === "h01").winRate, 1);
    assert.equal(table.rows.find(row => row.heroId === "h11").winRate, 0);
    assert.equal(
      computeAllHeroScrimStats([series([game(0, "A")])], { minGames: 3 }).rows[0].winRate,
      null
    );
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});

async function importSeries(browser, gameCount) {
  const games = Array.from({ length: gameCount }, (_, index) => {
    const winner = index % 3 === 0 ? "Bravo" : "Alpha";
    return {
      blueTeam: "Alpha",
      redTeam: "Bravo",
      winner,
      durationSeconds: 1000 + index,
      draft: {
        bans: { blue: ids("h", 21, 5), red: ids("h", 26, 5) },
        picks: { blue: ids("h", 1, 5), red: ids("h", 11, 5) }
      }
    };
  });
  const response = await browser.post("/api/series/import", {
    teamA: { name: "Alpha" },
    teamB: { name: "Bravo" },
    bestOf: 99,
    gameMode: "free-for-all",
    games
  });
  assert.equal(response.status, 200, response.text);
  return response.body;
}

describe(
  "scrim statistics over HTTP",
  { skip: app ? false : "MySQL is not reachable (docker compose up -d mysql)" },
  () => {
    test("a visitor with no scrims gets empty, labelled statistics", async () => {
      const stats = (await app.browser().get("/api/heroes/h01/scrims")).body;
      assert.equal(stats.label, "Your scrims");
      assert.deepEqual([stats.totalGames, stats.picked, stats.winRate], [0, 0, null]);
      assert.equal((await app.browser().get("/api/heroes/nope/scrims")).status, 404);
    });

    test("numbers come from the viewer's own series and respect minGames", async () => {
      const me = app.browser();
      await importSeries(me, 31);
      const stats = (await me.get("/api/heroes/h01/scrims")).body;
      assert.equal(stats.picked, 31);
      assert.equal(stats.wins, 20);
      assert.equal(stats.winRate, 20 / 31);
      assert.equal((await me.get("/api/heroes/h01/scrims?minGames=32")).body.winRate, null);
      assert.equal((await me.get("/api/heroes/h01/scrims?minGames=0")).status, 400);
      assert.equal((await me.get("/api/heroes/h01/scrims?minGames=abc")).status, 400);
      const table = (await me.get("/api/stats/heroes")).body;
      assert.equal(table.totalGames, 31);
      assert.equal(table.rows.find(row => row.heroId === "h01").picked, 31);
    });

    test("another visitor never sees them, and series merely shared with you do not count as yours", async () => {
      const owner = app.browser();
      const imported = await importSeries(owner, 4);
      assert.equal((await app.browser().get("/api/heroes/h01/scrims")).body.picked, 0);
      const guest = app.browser();
      const invite = (await owner.post(`/api/series/${imported.id}/invites`, { role: "viewer" }))
        .body;
      await guest.post("/api/invites/accept", { token: invite.token });
      assert.equal((await guest.get(`/api/series/${imported.id}`)).status, 200);
      assert.equal(
        (await guest.get("/api/heroes/h01/scrims")).body.picked,
        0,
        "shared with you ≠ your scrims"
      );
    });

    test("the default threshold is 30 and comes from the configuration", async () => {
      assert.equal((await app.browser().get("/api/heroes/h01/scrims")).body.minGames, 30);
      assert.equal((await app.browser().get("/api/auth/me")).body.minSampleGames, 30);
    });
  }
);
