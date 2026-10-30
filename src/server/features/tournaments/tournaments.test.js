// Tournaments: validation of an entered series, hero statistics computed from the games (recency
// window, the heroes it wins best with / against), the admin API (add / edit / rename / delete) and the builds.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import {
  heroTournamentStats,
  knowsPickOrder,
  parseDay,
  parseTournamentSeries,
  pickOrderStats
} from "./tournament-domain.js";
import { seriesProblems } from "./tournament-coherence.js";
import { startTestServer } from "../../../testing/test-app.js";

const ids = Array.from({ length: 30 }, (_, index) => `h${String(index + 1).padStart(2, "0")}`);
const known = new Set(ids);
const side = start => ids.slice(start, start + 5);
const game = (overrides = {}) => ({
  blueTeam: "Alpha",
  redTeam: "Beta",
  winner: "Alpha",
  durationSeconds: 900,
  bans: { blue: ["h21"], red: [] },
  picks: { blue: side(0), red: side(5) },
  ...overrides
});
const series = (overrides = {}) => ({
  event: "KPL Autumn",
  stage: "Final",
  teamA: "Alpha",
  teamB: "Beta",
  bestOf: 5,
  playedOn: "2026-03-02",
  patch: "1.2",
  sourceUrl: "https://example.test/vod",
  note: "",
  games: [game(), game({ blueTeam: "Beta", redTeam: "Alpha", winner: "Beta" })],
  ...overrides
});
const rejects = (input, code = "invalid_body") =>
  assert.throws(
    () => parseTournamentSeries(input, known),
    error => error.code === code,
    JSON.stringify(input).slice(0, 80)
  );

describe("series validation", () => {
  test("a complete series is normalised and scored", () => {
    const parsed = parseTournamentSeries(series({ event: "  KPL   Autumn ", stage: "" }), known);
    assert.equal(parsed.event, "KPL Autumn");
    assert.deepEqual(parsed.score, { teamA: 1, teamB: 1 });
    assert.deepEqual(
      parsed.games.map(item => item.gameNumber),
      [1, 2]
    );
  });

  test("what cannot have happened is refused", () => {
    rejects(series({ teamB: "alpha" }));
    rejects(series({ bestOf: 0 }));
    rejects(series({ bestOf: 1 }), "invalid_body");
    rejects(series({ playedOn: "2026-02-30" }));
    rejects(series({ playedOn: "2999-01-01" }));
    rejects(series({ sourceUrl: "http://example.test" }));
    // a series always keeps the way back to its source (the video or the page it was read from)
    rejects(series({ sourceUrl: "" }), "invalid_body");
    rejects(series({ sourceUrl: undefined }), "invalid_body");
    rejects(series({ sourceUrl: null }), "invalid_body");
    rejects(series({ games: [] }));
    rejects(series({ event: "<b>x</b>" }));
    rejects(series({ games: [game({ winner: "Gamma" })] }));
    rejects(series({ games: [game({ blueTeam: "Alpha", redTeam: "Alpha" })] }));
    rejects(series({ games: [game({ picks: { blue: side(0).slice(0, 4), red: side(5) } })] }));
    rejects(
      series({ games: [game({ picks: { blue: side(0), red: [...side(5).slice(0, 4), "h01"] } })] }),
      "invalid_body"
    );
    rejects(series({ games: [game({ bans: { blue: ["h06"], red: [] } })] }), "invalid_body");
    rejects(
      series({
        games: [game({ picks: { blue: [...side(0).slice(0, 4), "nope"], red: side(5) } })]
      }),
      "unknown_hero"
    );
    rejects(series({ games: [game({ durationSeconds: 5 })] }));
  });

  test("any number of bans from 0 to 5 per side is accepted (older patches had fewer, and bans are sometimes forgotten)", () => {
    for (const [blue, red] of [
      [0, 0],
      [2, 3],
      [4, 1],
      [5, 5],
      [0, 5]
    ]) {
      const bans = { blue: ids.slice(20, 20 + blue), red: ids.slice(25, 25 + red) };
      const parsed = parseTournamentSeries(series({ games: [game({ bans })] }), known);
      assert.deepEqual(
        [parsed.games[0].bans.blue.length, parsed.games[0].bans.red.length],
        [blue, red]
      );
    }
    rejects(series({ games: [game({ bans: { blue: ids.slice(20, 26), red: [] } })] }));
  });

  test("days are real calendar days", () => {
    assert.equal(parseDay("2026-02-28", "d"), "2026-02-28");
    assert.throws(() => parseDay("2026-13-01", "d"));
    assert.throws(() => parseDay("26-1-1", "d"));
  });
});

describe("hero statistics", () => {
  const games = [
    { ...game(), playedOn: "2026-03-01" },
    { ...game({ bans: { blue: [], red: [] } }), playedOn: "2026-03-02" },
    { ...game({ winner: "Beta" }), playedOn: "2025-06-01" },
    {
      ...game({ picks: { blue: side(10), red: side(15) }, bans: { blue: ["h01"], red: [] } }),
      playedOn: "2026-04-01"
    }
  ];

  test("picks, bans, wins and the top allies / enemies when the hero won", () => {
    const stats = heroTournamentStats(games, "h01");
    assert.deepEqual(
      [stats.totalGames, stats.picks, stats.bans, stats.wins, stats.losses],
      [4, 3, 1, 2, 1]
    );
    assert.equal(stats.winRate, 2 / 3);
    assert.equal(stats.presence, 1);
    assert.deepEqual(stats.side.blue, { picks: 3, wins: 2, winRate: 2 / 3 });
    // the heroes it wins best with / against: 2 wins in 3 games for each of the nine others, so the ties go to fewer games, then to the id
    assert.deepEqual(
      stats.bestAllies.map(item => [item.heroId, item.count, item.games]),
      [
        ["h02", 2, 3],
        ["h03", 2, 3],
        ["h04", 2, 3]
      ]
    );
    assert.ok(
      stats.bestEnemies.every(
        item => item.count === 2 && item.games === 3 && side(5).includes(item.heroId)
      )
    );
    assert.equal(stats.lastPlayed, "2026-03-02");
    // a hero it only lost with or against is not among the heroes it wins with or against
    const lostBoth = heroTournamentStats(
      [games[0], games[0]].map(g => ({ ...g, winner: "Beta" })),
      "h01"
    );
    assert.deepEqual(
      [lostBoth.bestAllies, lostBoth.bestEnemies],
      [[], []],
      "never won with any of them"
    );
    // one game together says nothing: it needs PAIRING_MIN_GAMES
    const once = heroTournamentStats([games[0]], "h01");
    assert.deepEqual([once.bestAllies, once.bestEnemies], [[], []], "met in a single game");
    // a better record comes first: 2 of 2 before 1 of 2
    const mixed = [
      game({ picks: { blue: ["h01", "h02", "h03", "h04", "h05"], red: side(5) } }),
      game({ picks: { blue: ["h01", "h02", "h13", "h14", "h15"], red: side(5) } }),
      game({ picks: { blue: ["h01", "h03", "h13", "h14", "h15"], red: side(5) }, winner: "Beta" })
    ].map(g => ({ ...g, playedOn: "2026-03-01" }));
    const withMixed = heroTournamentStats(mixed, "h01");
    assert.deepEqual(
      withMixed.bestAllies.map(item => [item.heroId, item.count, item.games]),
      [
        ["h02", 2, 2],
        ["h03", 1, 2],
        ["h13", 1, 2]
      ],
      "h02 won 2 of 2; h03, h13, h14 and h15 won 1 of 2 and the ties go by id"
    );
  });

  test("the heroes it loses most with / against never repeat one of the other lists", () => {
    const lost = heroTournamentStats(
      [games[0], games[0]].map(g => ({ ...g, winner: "Beta" })),
      "h01"
    );
    assert.deepEqual(
      lost.worstAllies.map(item => [item.heroId, item.count, item.games]),
      [
        ["h02", 2, 2],
        ["h03", 2, 2],
        ["h04", 2, 2]
      ]
    );
    assert.equal(lost.worstEnemies.length, 3);
    // two wins and two losses with the same four allies: a hero listed among the wins is not listed among the losses
    const split = [
      game({ picks: { blue: ["h01", "h02", "h03", "h04", "h05"], red: side(5) } }),
      game({ picks: { blue: ["h01", "h02", "h03", "h04", "h05"], red: side(5) } }),
      game({ picks: { blue: ["h01", "h02", "h03", "h04", "h05"], red: side(5) }, winner: "Beta" }),
      game({ picks: { blue: ["h01", "h02", "h03", "h04", "h05"], red: side(5) }, winner: "Beta" })
    ].map(g => ({ ...g, playedOn: "2026-03-01" }));
    const stats = heroTournamentStats(split, "h01");
    const listed = [
      stats.bestAllies,
      stats.bestEnemies,
      stats.worstAllies,
      stats.worstEnemies
    ].flatMap(list => list.map(item => item.heroId));
    assert.equal(new Set(listed).size, listed.length, "no hero twice");
    assert.deepEqual(
      stats.bestAllies.map(item => item.heroId),
      ["h02", "h03", "h04"]
    );
    assert.deepEqual(
      stats.worstAllies.map(item => item.heroId),
      ["h05"],
      "h02-h04 are placed among the wins: only h05 is left"
    );
  });

  test("a hero that never appears has zero counts and no rates over its own games", () => {
    const stats = heroTournamentStats(games, "h30");
    assert.deepEqual([stats.picks, stats.bans, stats.winRate, stats.bestAllies], [0, 0, null, []]);
  });

  test("no games at all gives no rates (never invented)", () => {
    const stats = heroTournamentStats([], "h01");
    assert.deepEqual([stats.totalGames, stats.pickRate, stats.presence], [0, null, null]);
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("admin API", { skip }, () => {
  test("only an administrator reaches it", async () => {
    assert.equal((await app.browser().get("/api/admin/tournaments")).status, 401);
    const user = await app.signIn("Plain");
    assert.equal((await user.browser.get("/api/admin/tournaments")).status, 403);
    assert.equal((await user.browser.post("/api/admin/tournaments", series())).status, 403);
    assert.equal((await user.browser.put("/api/builds/h01/1", { items: ["A"] })).status, 403);
  });

  test("add, list, edit (rename + change a game), delete; stats follow every change and the recency window", async () => {
    const admin = await app.signIn("Admin", { admin: true });
    const created = await admin.browser.post("/api/admin/tournaments", series());
    assert.equal(created.status, 200, created.text);
    const id = created.body.id;
    const older = await admin.browser.post(
      "/api/admin/tournaments",
      series({ event: "Old Cup", playedOn: "2025-05-05" })
    );
    assert.equal(older.status, 200, older.text);

    const list = (await admin.browser.get("/api/admin/tournaments")).body;
    assert.equal(list.total, 2);
    assert.equal(list.items[0].event, "KPL Autumn", "newest first");
    assert.deepEqual(list.items[0].score, { teamA: 1, teamB: 1 });
    assert.equal((await admin.browser.get("/api/admin/tournaments?q=old")).body.total, 1);
    assert.deepEqual(
      (await admin.browser.get("/api/admin/tournaments/suggestions")).body.teams.sort(),
      ["Alpha", "Beta"]
    );

    const all = (await app.browser().get("/api/heroes/h01")).body.tournament;
    assert.deepEqual([all.totalGames, all.picks, all.wins], [4, 4, 4]);
    const recent = (await app.browser().get("/api/heroes/h01?since=2026-01-01")).body.tournament;
    assert.deepEqual([recent.since, recent.totalGames, recent.picks], ["2026-01-01", 2, 2]);
    assert.equal((await app.browser().get("/api/heroes/h01?since=nope")).status, 400);

    const full = (await admin.browser.get(`/api/admin/tournaments/${id}`)).body;
    assert.equal(full.games.length, 2);
    const edited = await admin.browser.put(`/api/admin/tournaments/${id}`, {
      ...full,
      event: "KPL Autumn Finals",
      games: [{ ...full.games[0], winner: "Beta" }, full.games[1]]
    });
    assert.equal(edited.status, 200, edited.text);
    assert.equal(
      (await admin.browser.get(`/api/admin/tournaments/${id}`)).body.event,
      "KPL Autumn Finals"
    );
    assert.deepEqual((await admin.browser.get("/api/admin/tournaments")).body.items[0].score, {
      teamA: 0,
      teamB: 2
    });
    assert.equal(
      (await app.browser().get("/api/heroes/h01?since=2026-01-01")).body.tournament.wins,
      1,
      "the cache is dropped on write"
    );

    assert.equal(
      (await admin.browser.put(`/api/admin/tournaments/${id}`, series({ games: [] }))).status,
      400
    );
    assert.equal(
      (
        await admin.browser.put(
          "/api/admin/tournaments/00000000-0000-4000-8000-000000000000",
          series()
        )
      ).status,
      404
    );
    assert.equal((await admin.browser.delete(`/api/admin/tournaments/${id}`)).status, 200);
    assert.equal((await admin.browser.get(`/api/admin/tournaments/${id}`)).status, 404);
    assert.equal((await app.browser().get("/api/heroes/h01")).body.tournament.totalGames, 2);
  });

  test("a hero id the roster does not know is refused", async () => {
    const admin = await app.signIn("Admin2", { admin: true });
    const response = await admin.browser.post(
      "/api/admin/tournaments",
      series({ games: [game({ picks: { blue: [...side(0).slice(0, 4), "h99"], red: side(5) } })] })
    );
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "unknown_hero");
  });
});

describe("the Ultimate Battle", () => {
  const decider = (extra = {}) => ({
    blueTeam: "Alpha",
    redTeam: "Beta",
    winner: "Alpha",
    durationSeconds: 900,
    bans: { blue: [], red: [] },
    picks: { blue: side(0), red: side(5) },
    ...extra
  });
  const tied = (lastGame, overrides = {}) =>
    series({
      bestOf: 3,
      rule: "global-ban-pick",
      games: [
        decider({ picks: { blue: side(0), red: side(5) } }),
        decider({
          blueTeam: "Beta",
          redTeam: "Alpha",
          winner: "Beta",
          picks: { blue: side(10), red: side(15) }
        }),
        lastGame
      ],
      ...overrides
    });

  test("the deciding game of a tied Global Ban & Pick series may use the heroes again, and says so", () => {
    const heroesAgain = decider({ ultimateBattle: true, picks: { blue: side(0), red: side(5) } });
    const parsed = parseTournamentSeries(tied(heroesAgain), known);
    assert.equal(parsed.games[2].ultimateBattle, true);
    assert.equal(parsed.games[0].ultimateBattle, false);
    // the same heroes again WITHOUT the Ultimate Battle break the Global Ban & Pick rule
    rejects(tied(decider({ picks: { blue: side(0), red: side(5) } })));
  });

  test("only the deciding last game of a Global Ban & Pick series, tied before it", () => {
    const flagged = decider({ ultimateBattle: true, picks: { blue: side(20), red: side(25) } });
    rejects(tied(flagged, { rule: "free-for-all" }));
    rejects(tied(flagged, { rule: "classic" }));
    rejects(tied(flagged, { bestOf: 5 }), "invalid_body");
    rejects(
      series({
        bestOf: 3,
        rule: "global-ban-pick",
        games: [decider({ ultimateBattle: true, picks: { blue: side(0), red: side(5) } })]
      })
    );
    rejects(
      series({
        bestOf: 3,
        rule: "global-ban-pick",
        games: [
          decider({ winner: "Alpha" }),
          decider({
            blueTeam: "Beta",
            redTeam: "Alpha",
            winner: "Alpha",
            picks: { blue: side(10), red: side(15) }
          }),
          decider({ ultimateBattle: true, picks: { blue: side(20), red: side(25) } })
        ]
      }),
      "invalid_body"
    );
    rejects(tied({ ...flagged, ultimateBattle: "yes" }));
  });

  test("the lineups are submitted blind: both teams may take the same hero, nowhere else", () => {
    const mirrored = { picks: { blue: side(20), red: side(20) } };
    const parsed = parseTournamentSeries(
      tied(decider({ ultimateBattle: true, ...mirrored })),
      known
    );
    assert.deepEqual(parsed.games[2].picks.blue, parsed.games[2].picks.red);
    // an ordinary game cannot have a hero on both teams
    rejects(tied(decider(mirrored)), "invalid_body");
    // not twice in one team, and not picked and banned, even in the Ultimate Battle
    const twice = [...side(20).slice(0, 4), side(20)[0]];
    rejects(
      tied(decider({ ultimateBattle: true, picks: { blue: twice, red: side(25) } })),
      "invalid_body"
    );
    rejects(
      tied(
        decider({
          ultimateBattle: true,
          ...mirrored,
          bans: { blue: [side(20)[0]], red: [] }
        })
      ),
      "invalid_body"
    );
  });

  test("a hero both teams took counts once for each team in its statistics", () => {
    const parsed = parseTournamentSeries(
      tied(decider({ ultimateBattle: true, picks: { blue: side(20), red: side(20) } })),
      known
    );
    const games = parsed.games.map(game => ({
      ...game,
      rule: "global-ban-pick",
      playedOn: "2026-01-01"
    }));
    const stats = heroTournamentStats(games, side(20)[0]);
    assert.equal(stats.picks, 2);
    assert.equal(stats.wins, 1);
    assert.equal(stats.losses, 1);
  });
});

describe("how sure a series is", () => {
  test("a series is verified unless it says otherwise; video and listed are accepted, anything else is not", () => {
    assert.equal(parseTournamentSeries(series(), known).verification, "verified");
    for (const verification of ["verified", "video", "listed"]) {
      assert.equal(
        parseTournamentSeries(series({ verification }), known).verification,
        verification
      );
    }
    rejects(series({ verification: "sure" }));
    rejects(series({ verification: 3 }));
  });

  test("the points still to check are a short list of lines", () => {
    assert.deepEqual(parseTournamentSeries(series(), known).toCheck, []);
    assert.deepEqual(
      parseTournamentSeries(series({ toCheck: ["game 1: ban R3 is doubtful", ""] }), known).toCheck,
      ["game 1: ban R3 is doubtful"]
    );
    rejects(series({ toCheck: "one line" }));
    rejects(series({ toCheck: Array.from({ length: 41 }, () => "x") }));
    rejects(series({ toCheck: ["x".repeat(201)] }));
  });

  test("only a series that is not a plain list of heroes knows the order of the picks", () => {
    assert.equal(knowsPickOrder("verified"), true);
    assert.equal(knowsPickOrder("video"), true);
    assert.equal(knowsPickOrder("listed"), false);
  });

  test("a series says whether the order of its picks is known: a list of heroes does not, the others do unless they say so", () => {
    const order = input => parseTournamentSeries(input, known).pickOrderKnown;
    assert.equal(order(series()), true);
    assert.equal(order(series({ verification: "video" })), true);
    assert.equal(order(series({ verification: "listed" })), false);
    // checked against its results page, but the order of the picks was never seen
    const checked = parseTournamentSeries(
      series({ verification: "verified", pickOrderKnown: false }),
      known
    );
    assert.deepEqual([checked.verification, checked.pickOrderKnown], ["verified", false]);
    assert.equal(order(series({ verification: "listed", pickOrderKnown: true })), true);
    rejects(series({ pickOrderKnown: "no" }));
    rejects(series({ pickOrderKnown: 0 }));
  });

  test("a series hangs together when one team reached the wins it needs and no game came after", () => {
    const played = (bestOf, winners) =>
      parseTournamentSeries(
        series({ bestOf, games: winners.map(winner => game({ winner })) }),
        known
      );
    assert.deepEqual(
      seriesProblems(played(5, ["Alpha", "Beta", "Alpha", "Alpha"])),
      [],
      "3-1 of 5"
    );
    assert.deepEqual(seriesProblems(played(3, ["Beta", "Beta"])), [], "2-0 of 3");
    assert.deepEqual(
      seriesProblems(played(7, ["Alpha", "Beta", "Alpha", "Beta", "Alpha", "Beta", "Beta"])),
      [],
      "the seventh game decides a 3-3"
    );
    const unfinished = seriesProblems(played(5, ["Alpha", "Beta"]));
    assert.equal(unfinished.length, 1, "1-1 of 5: nobody has won the series");
    assert.match(unfinished[0], /3 wins/);
    const afterwards = seriesProblems(played(3, ["Alpha", "Alpha", "Beta"]));
    assert.equal(afterwards.length, 1, "a third game after 2-0");
    assert.match(afterwards[0], /game 3/);
  });

  test("the position of a hero in the picks and bans counts only the games whose order is known", () => {
    const known5 = side(0);
    const games = [
      { ...game(), pickOrderKnown: true },
      { ...game({ picks: { blue: [...known5].reverse(), red: side(5) } }), pickOrderKnown: true },
      { ...game({ picks: { blue: [...known5].reverse(), red: side(5) } }), pickOrderKnown: false },
      {
        ...game({
          bans: { blue: ["h21", "h01"], red: [] },
          picks: { blue: side(10), red: side(15) }
        }),
        pickOrderKnown: true
      }
    ];
    const stats = pickOrderStats(games, "h01");
    assert.equal(stats.games, 3, "the game of a list is left out");
    assert.equal(stats.picked, 2);
    assert.equal(stats.pickPosition, 3, "first pick once, fifth once");
    assert.equal(stats.banned, 1);
    assert.equal(stats.banPosition, 2);
    assert.deepEqual(pickOrderStats([{ ...game(), pickOrderKnown: false }], "h01"), {
      games: 0,
      picked: 0,
      pickPosition: null,
      banned: 0,
      banPosition: null
    });
    assert.deepEqual(
      heroTournamentStats(games, "h01").order,
      stats,
      "the hero statistics carry it"
    );
    assert.equal(
      pickOrderStats([game()], "h01").games,
      0,
      "an order that is not said known is not trusted"
    );
  });
});

describe("the Ultimate Battle: the admin API", { skip }, () => {
  test("it is stored with the game, shown in the list, and counted under the classic rules in the hero statistics", async () => {
    const admin = await app.signIn("Ultimate", { admin: true });
    const base = {
      blueTeam: "Alpha",
      redTeam: "Beta",
      winner: "Alpha",
      durationSeconds: 900,
      bans: { blue: [], red: [] }
    };
    const body = series({
      event: "Ultimate Cup",
      bestOf: 3,
      rule: "global-ban-pick",
      games: [
        { ...base, picks: { blue: side(0), red: side(5) } },
        {
          ...base,
          blueTeam: "Beta",
          redTeam: "Alpha",
          winner: "Beta",
          picks: { blue: side(10), red: side(15) }
        },
        { ...base, ultimateBattle: true, picks: { blue: side(0), red: side(5) } }
      ]
    });
    const created = await admin.browser.post("/api/admin/tournaments", body);
    assert.equal(created.status, 200, created.text);
    const stored = (await admin.browser.get(`/api/admin/tournaments/${created.body.id}`)).body;
    assert.deepEqual(
      stored.games.map(game => game.ultimateBattle),
      [false, false, true]
    );
    const listed = (await admin.browser.get("/api/admin/tournaments?q=Ultimate")).body.items[0];
    assert.equal(listed.ultimateBattle, true, "the list says the series has one");
    const hero = (await app.browser().get("/api/heroes/h01")).body.tournament;
    assert.equal(
      hero.byRule["global-ban-pick"].picks,
      1,
      "its two other games stay under Global Ban & Pick"
    );
    assert.equal(
      hero.byRule.classic.picks,
      1,
      "the Ultimate Battle counts under the classic rules"
    );
    const refused = await admin.browser.post("/api/admin/tournaments", {
      ...body,
      rule: "classic"
    });
    assert.equal(refused.status, 400, "no Ultimate Battle outside Global Ban & Pick");
    const again = await admin.browser.put(`/api/admin/tournaments/${created.body.id}`, stored);
    assert.equal(again.status, 200, again.text);
    assert.equal(
      (await admin.browser.get(`/api/admin/tournaments/${created.body.id}`)).body.games[2]
        .ultimateBattle,
      true,
      "a series read back and sent again keeps it"
    );
  });
});

describe("how sure a series is: the admin API", { skip }, () => {
  test("it is stored, filtered on, counted, and a list of heroes does not feed the order statistics", async () => {
    const admin = await app.signIn("Reliability", { admin: true });
    const first = await admin.browser.post(
      "/api/admin/tournaments",
      series({ event: "Rel Verified", verification: "verified" })
    );
    const second = await admin.browser.post(
      "/api/admin/tournaments",
      series({
        event: "Rel Video",
        verification: "video",
        toCheck: ["game 2: lane of Beta mid unread"]
      })
    );
    const third = await admin.browser.post(
      "/api/admin/tournaments",
      series({ event: "Rel Listed", verification: "listed" })
    );
    for (const created of [first, second, third]) {
      assert.equal(created.status, 200, created.text);
    }
    assert.equal(
      (await admin.browser.post("/api/admin/tournaments", series({ verification: "sure" }))).status,
      400
    );

    const only = async verification =>
      (await admin.browser.get(`/api/admin/tournaments?q=Rel&verification=${verification}`)).body;
    assert.deepEqual(
      (await only("listed")).items.map(item => item.event),
      ["Rel Listed"]
    );
    const video = await only("video");
    assert.equal(video.items[0].verification, "video");
    assert.deepEqual(video.items[0].toCheck, ["game 2: lane of Beta mid unread"]);
    assert.equal(
      (await only("verified")).items.every(item => item.verification === "verified"),
      true
    );
    assert.equal((await only("nonsense")).total >= 3, true, "an unknown filter shows everything");

    const summary = (await admin.browser.get("/api/admin/tournaments")).body.summary;
    assert.equal(summary.verifications.listed >= 1, true);
    assert.equal(summary.verifications.video >= 1, true);

    const saved = (await admin.browser.get(`/api/admin/tournaments/${second.body.id}`)).body;
    assert.equal(saved.verification, "video");
    const edited = await admin.browser.put(`/api/admin/tournaments/${second.body.id}`, {
      ...saved,
      verification: "verified",
      toCheck: []
    });
    assert.equal(edited.status, 200, edited.text);
    const after = (await admin.browser.get(`/api/admin/tournaments/${second.body.id}`)).body;
    assert.deepEqual([after.verification, after.toCheck], ["verified", []]);

    const order = (await app.browser().get("/api/heroes/h01")).body.tournament.order;
    assert.equal(order.games >= 2, true);
    const listedGames = (await only("listed")).items[0].gamesCount;
    assert.equal(listedGames >= 1, true);
    const all = (await app.browser().get("/api/heroes/h01")).body.tournament.totalGames;
    assert.equal(
      all - order.games >= listedGames,
      true,
      "the games of a list are counted but not in the order"
    );
  });

  test("a series checked against its page, whose pick order is unknown, stays unordered when it is edited", async () => {
    const admin = await app.signIn("Unordered", { admin: true });
    const heroOrder = async () => (await app.browser().get("/api/heroes/h01")).body.tournament;
    const before = await heroOrder();
    const created = await admin.browser.post(
      "/api/admin/tournaments",
      series({ event: "Rel Unordered", verification: "verified", pickOrderKnown: false })
    );
    assert.equal(created.status, 200, created.text);
    const saved = (await admin.browser.get(`/api/admin/tournaments/${created.body.id}`)).body;
    assert.deepEqual([saved.verification, saved.pickOrderKnown], ["verified", false]);
    const listed = (
      await admin.browser.get("/api/admin/tournaments?q=Rel%20Unordered&verification=verified")
    ).body.items[0];
    assert.equal(listed.pickOrderKnown, false, "the list says so");

    const during = await heroOrder();
    assert.equal(during.totalGames, before.totalGames + 2, "its games count");
    assert.equal(during.order.games, before.order.games, "but not in the order of the picks");

    // the editor sends the series back as it came: a note changes, the order stays unknown
    const noted = await admin.browser.put(`/api/admin/tournaments/${created.body.id}`, {
      ...saved,
      note: "checked"
    });
    assert.equal(noted.status, 200, noted.text);
    const stillSo = (await admin.browser.get(`/api/admin/tournaments/${created.body.id}`)).body;
    assert.deepEqual([stillSo.note, stillSo.pickOrderKnown], ["checked", false]);

    // somebody who has seen the order says so, and the games enter the order statistics
    const ordered = await admin.browser.put(`/api/admin/tournaments/${created.body.id}`, {
      ...saved,
      pickOrderKnown: true
    });
    assert.equal(ordered.status, 200, ordered.text);
    assert.equal((await heroOrder()).order.games, before.order.games + 2);
  });
});
