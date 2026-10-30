// Overview and History: server-side filters, pagination, summaries, statistics.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { CREATE_BODY, playFullDraft, startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";
const ids = (from, count) =>
  Array.from({ length: count }, (_, index) => `h${String(from + index).padStart(2, "0")}`);

function game(blue, red, winner, duration, picks = { blue: ids(1, 5), red: ids(11, 5) }) {
  return {
    blueTeam: blue,
    redTeam: red,
    winner,
    durationSeconds: duration,
    draft: { bans: { blue: ids(21, 5), red: ids(26, 5) }, picks }
  };
}

async function importSeries(browser, { teamA, teamB, mode = "free-for-all", bestOf = 3, games }) {
  const response = await browser.post("/api/series/import", {
    teamA: { name: teamA },
    teamB: { name: teamB },
    bestOf,
    gameMode: mode,
    games
  });
  assert.equal(response.status, 200, response.text);
  return response.body;
}

async function stamp(id, updatedAt) {
  await app.store.pool.query("UPDATE series SET updated_at = ?, created_at = ? WHERE id = ?", [
    updatedAt,
    updatedAt,
    id
  ]);
}

describe("series filters and pagination (server side)", { skip }, () => {
  let coach;
  test("setup: a varied history", async () => {
    coach = app.browser();
    const one = await importSeries(coach, {
      teamA: "Alpha",
      teamB: "Bravo",
      mode: "global-ban-pick",
      games: [game("Alpha", "Bravo", "Alpha", 1500), game("Bravo", "Alpha", "Alpha", 1800)]
    });
    const two = await importSeries(coach, {
      teamA: "Gamma",
      teamB: "Delta",
      mode: "free-for-all",
      games: [game("Gamma", "Delta", "Delta", 1200)]
    });
    const three = await importSeries(coach, {
      teamA: "Alpha",
      teamB: "Echo",
      mode: "free-for-all",
      bestOf: 1,
      games: [game("Echo", "Alpha", "Echo", 900)]
    });
    await stamp(one.id, "2026-08-10T10:00:00.000Z");
    await stamp(two.id, "2026-09-05T10:00:00.000Z");
    await stamp(three.id, "2026-09-20T10:00:00.000Z");
    assert.deepEqual([one.status, two.status, three.status], ["complete", "active", "complete"]);
  });

  const teams = async query =>
    (await coach.get(`/api/series?view=summary&${query}`)).body.items.map(
      item => `${item.teamA}/${item.teamB}`
    );

  test("status, mode and team-name filters", async () => {
    assert.deepEqual(await teams("status=active"), ["Gamma/Delta"]);
    assert.deepEqual((await teams("status=complete")).sort(), ["Alpha/Bravo", "Alpha/Echo"]);
    assert.deepEqual(await teams("mode=global-ban-pick"), ["Alpha/Bravo"]);
    assert.deepEqual(
      (await teams("q=alpha")).sort(),
      ["Alpha/Bravo", "Alpha/Echo"],
      "case-insensitive on either team"
    );
    assert.deepEqual(await teams("q=ech"), ["Alpha/Echo"], "matches the second team too");
    assert.deepEqual(
      await teams("q=alpha&status=complete&mode=free-for-all"),
      ["Alpha/Echo"],
      "filters combine"
    );
    assert.deepEqual(await teams("q=%25"), [], "LIKE wildcards are escaped");
    assert.deepEqual(await teams("draftMode=online"), []);
    assert.equal((await teams("draftMode=solo")).length, 3);
  });

  test("date range is inclusive on the last-updated day", async () => {
    assert.deepEqual(await teams("from=2026-09-01"), ["Alpha/Echo", "Gamma/Delta"]);
    assert.deepEqual(await teams("to=2026-09-05"), ["Gamma/Delta", "Alpha/Bravo"]);
    assert.deepEqual(await teams("from=2026-09-05&to=2026-09-05"), ["Gamma/Delta"]);
    assert.deepEqual(await teams("from=2027-01-01"), []);
  });

  test("sorting", async () => {
    assert.deepEqual(await teams("sort=updated"), ["Alpha/Echo", "Gamma/Delta", "Alpha/Bravo"]);
    assert.deepEqual(await teams("sort=oldest"), ["Alpha/Bravo", "Gamma/Delta", "Alpha/Echo"]);
  });

  test("pagination reports the full total", async () => {
    const first = (await coach.get("/api/series?view=summary&pageSize=2&page=1")).body;
    const second = (await coach.get("/api/series?view=summary&pageSize=2&page=2")).body;
    assert.deepEqual(
      [
        first.items.length,
        second.items.length,
        first.total,
        second.total,
        second.page,
        second.pageSize
      ],
      [2, 1, 3, 3, 2, 2]
    );
    assert.equal(
      new Set([...first.items, ...second.items].map(item => item.id)).size,
      3,
      "no overlap"
    );
    assert.equal(
      (await coach.get("/api/series?view=summary&status=active&pageSize=1")).body.total,
      1,
      "total follows the filters"
    );
  });

  test("summaries are light: score, counts, no drafts", async () => {
    const [summary] = (await coach.get("/api/series?view=summary&q=Bravo")).body.items;
    assert.deepEqual(summary.score, { teamA: 2, teamB: 0 });
    assert.deepEqual(
      [
        summary.gamesCount,
        summary.status,
        summary.gameMode,
        summary.bestOf,
        summary.role,
        summary.online
      ],
      [2, "complete", "global-ban-pick", 3, "owner", false]
    );
    assert.equal(summary.games, undefined);
    assert.equal(summary.currentGame, undefined);
    assert.equal(
      (await coach.get("/api/series?q=Bravo")).body.items[0].games.length,
      2,
      "the full view is still available"
    );
  });

  test("bad filters are refused with a 400", async () => {
    for (const query of [
      "status=bogus",
      "mode=x",
      "draftMode=x",
      "sort=random",
      "from=2026-13-40",
      "from=yesterday",
      "to=2026-02-30",
      "from=2026-09-10&to=2026-09-01",
      `q=${"x".repeat(61)}`,
      "status=active&status=complete",
      "view=raw",
      "page=0",
      "pageSize=101"
    ]) {
      assert.equal((await coach.get(`/api/series?${query}`)).status, 400, query);
    }
  });

  test("filters never reveal someone else's series", async () => {
    const stranger = app.browser();
    assert.deepEqual((await stranger.get("/api/series?view=summary&q=Alpha")).body, {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20
    });
    assert.equal((await stranger.get("/api/series?view=summary")).body.total, 0);
  });

  test("the summary columns follow every mutation", async () => {
    const me = app.browser();
    const { body: series } = await me.post("/api/series", {
      ...CREATE_BODY,
      bestOf: 1,
      teamA: "Sync A",
      teamB: "Sync B"
    });
    const column = async () =>
      (
        await app.store.pool.query(
          "SELECT status, games_count, team_a_name, best_of, game_mode, draft_mode FROM series WHERE id = ?",
          [series.id]
        )
      )[0][0];
    assert.deepEqual(await column(), {
      status: "active",
      games_count: 0,
      team_a_name: "Sync A",
      best_of: 1,
      game_mode: "free-for-all",
      draft_mode: "solo"
    });
    const base = `/api/series/${series.id}`;
    await me.post(`${base}/game`, { blueTeam: "Sync A" });
    await me.post(`${base}/game/ready`);
    await playFullDraft(me, series.id);
    await app.rewriteSeries(series.id, stored => {
      stored.currentGame.draft.deadline = 1;
    });
    await me.post(`${base}/game/advance`);
    await me.post(`${base}/game/complete`, { winner: "Sync A", durationSeconds: 1000 });
    assert.deepEqual([(await column()).status, (await column()).games_count], ["complete", 1]);
    assert.deepEqual(
      await teams("status=complete&q=Sync"),
      [],
      "another browser's filter does not see it"
    );
    assert.deepEqual(
      (await me.get("/api/series?view=summary&status=complete&q=Sync")).body.items.map(
        item => item.score
      ),
      [{ teamA: 1, teamB: 0 }]
    );
  });
});

describe("overview", { skip }, () => {
  test("counts and short lists for the viewer only", async () => {
    const owner = app.browser();
    for (let index = 0; index < 7; index += 1) {
      await owner.post("/api/series", {
        ...CREATE_BODY,
        teamA: `Team ${index}`,
        teamB: `Opp ${index}`
      });
    }
    await importSeries(owner, {
      teamA: "Done A",
      teamB: "Done B",
      bestOf: 1,
      games: [game("Done A", "Done B", "Done A", 1000)]
    });
    await owner.post("/api/tier-lists", { name: "T", tiers: [], unranked: [] });
    const overview = (await owner.get("/api/overview")).body;
    assert.equal(overview.counts.series, 8);
    assert.equal(overview.counts.activeSeries, 7);
    assert.equal(overview.counts.games, 1);
    assert.equal(overview.counts.tierLists, 1);
    assert.equal(overview.counts.heroes, 30);
    assert.equal(overview.active.length, 5, "at most five");
    assert.ok(overview.active.every(item => item.status === "active"));
    assert.equal(overview.recent.length, 5);
    assert.ok(overview.recent[0].updatedAt >= overview.recent[4].updatedAt);
    assert.equal(overview.recent[0].games, undefined);
    assert.equal(overview.roster.sourceUpdated, "20260925");

    const stranger = (await app.browser().get("/api/overview")).body;
    assert.deepEqual(
      [
        stranger.counts.series,
        stranger.counts.activeSeries,
        stranger.counts.games,
        stranger.counts.tierLists,
        stranger.active.length,
        stranger.recent.length
      ],
      [0, 0, 0, 0, 0, 0]
    );
    assert.equal(stranger.counts.heroes, 30, "the roster is public data");
  });
});

describe("statistics from your scrims", { skip }, () => {
  let analyst;
  test("setup", async () => {
    analyst = app.browser();
    await importSeries(analyst, {
      teamA: "Red Co",
      teamB: "Blue Co",
      mode: "global-ban-pick",
      bestOf: 9,
      games: [
        game("Red Co", "Blue Co", "Red Co", 1000, {
          blue: ["h01", "h02", "h03", "h04", "h05"],
          red: ids(11, 5)
        }),
        game("Blue Co", "Red Co", "Red Co", 2000, {
          blue: ["h01", "h02", "h03", "h04", "h05"],
          red: ids(11, 5)
        }),
        game("Red Co", "Blue Co", "Blue Co", 3000, {
          blue: ["h06", "h07", "h08", "h09", "h10"],
          red: ids(16, 5)
        })
      ]
    });
    await importSeries(analyst, {
      teamA: "Solo A",
      teamB: "Solo B",
      mode: "free-for-all",
      bestOf: 1,
      games: [
        game("Solo A", "Solo B", "Solo B", 600, {
          blue: ["h01", "h02", "h03", "h04", "h05"],
          red: ids(11, 5)
        })
      ]
    });
  });

  test("overview statistics: totals, durations, side balance", async () => {
    const stats = (await analyst.get("/api/stats/overview")).body;
    assert.deepEqual(
      [
        stats.label,
        stats.seriesCount,
        stats.gamesCount,
        stats.totalDurationSeconds,
        stats.averageDurationSeconds,
        stats.shortestSeconds,
        stats.longestSeconds
      ],
      ["Your scrims", 2, 4, 6600, 1650, 600, 3000]
    );
    assert.deepEqual(
      [stats.blueWins, stats.redWins, stats.blueWinRate],
      [1, 3, null],
      "side win rate withheld under the threshold"
    );
    assert.deepEqual(stats.byMode, { "global-ban-pick": 3, "free-for-all": 1, classic: 0 });
    assert.equal((await analyst.get("/api/stats/overview?minGames=4")).body.blueWinRate, 0.25);
  });

  test("overview statistics honour the series filters", async () => {
    const stats = (await analyst.get("/api/stats/overview?mode=global-ban-pick")).body;
    assert.deepEqual(
      [stats.seriesCount, stats.gamesCount, stats.averageDurationSeconds],
      [1, 3, 2000]
    );
    assert.equal((await analyst.get("/api/stats/overview?q=nobody")).body.gamesCount, 0);
    assert.equal(
      (await analyst.get("/api/stats/overview?q=nobody")).body.averageDurationSeconds,
      null
    );
    assert.equal((await app.browser().get("/api/stats/overview")).body.gamesCount, 0);
    assert.equal((await analyst.get("/api/stats/overview?status=wrong")).status, 400);
  });

  test("hero table: paging, sorting, hero search, sample threshold", async () => {
    const page = (await analyst.get("/api/stats/heroes?pageSize=3&page=1&minGames=3")).body;
    assert.equal(page.label, "Your scrims");
    assert.equal(page.rows.length, 3);
    assert.ok(page.total >= 20);
    const h01 = (await analyst.get("/api/stats/heroes?hero=h01&minGames=3")).body.rows[0];
    assert.deepEqual(
      [h01.heroId, h01.picked, h01.wins, h01.losses, h01.banned],
      ["h01", 3, 1, 2, 0]
    );
    assert.equal(h01.winRate, 1 / 3, "3 games reach minGames=3");
    assert.equal(
      (await analyst.get("/api/stats/heroes?hero=h01")).body.rows[0].winRate,
      null,
      "default threshold is 30"
    );
    assert.equal((await analyst.get("/api/stats/heroes?hero=h01")).body.rows[0].insufficient, true);
    const byPicked = (
      await analyst.get("/api/stats/heroes?order=picked&pageSize=100")
    ).body.rows.map(row => row.picked);
    assert.deepEqual(
      byPicked,
      [...byPicked].sort((left, right) => right - left)
    );
    const byBanned = (
      await analyst.get("/api/stats/heroes?order=banned&pageSize=100")
    ).body.rows.map(row => row.banned);
    assert.deepEqual(
      byBanned,
      [...byBanned].sort((left, right) => right - left)
    );
    const byWin = (
      await analyst.get("/api/stats/heroes?order=winrate&minGames=1&pageSize=100")
    ).body.rows.map(row => row.winRate);
    assert.deepEqual(
      byWin,
      [...byWin].sort((left, right) => right - left)
    );
    assert.equal((await analyst.get("/api/stats/heroes?hero=zzz")).body.total, 0);
    assert.equal((await analyst.get("/api/stats/heroes?order=magic")).status, 400);
    assert.equal((await analyst.get("/api/stats/heroes?pageSize=500")).status, 400);
    assert.equal(
      (await analyst.get("/api/stats/heroes?mode=free-for-all&minGames=1&hero=h01")).body.rows[0]
        .picked,
      1,
      "filters apply to the hero table too"
    );
  });
});
