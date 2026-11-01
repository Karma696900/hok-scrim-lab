// The popularity pages: the period (at least three months, never before the first game), the drafts
// and the heroes that are played most and that win most, from the tournament games only.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import {
  addDays,
  addMonths,
  defaultPeriod,
  earliestEnd,
  spansEnough
} from "../../../shared/period.js";
import { confidenceOf, groupDrafts, popularDrafts, popularHeroes } from "./popular.js";
import { startTestServer } from "../../../testing/test-app.js";

const id = number => `h${String(number).padStart(2, "0")}`;
const five = start => Array.from({ length: 5 }, (_, index) => id(start + index));
const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];

describe("a period of time", () => {
  test("months are calendar months, and the last day of a short month stands in", () => {
    assert.equal(addMonths("2026-07-01", 3), "2026-10-01");
    assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
    assert.equal(addMonths("2028-01-31", 1), "2028-02-29", "a leap year");
    assert.equal(addMonths("2026-11-30", 3), "2027-02-28", "over the end of the year");
    assert.equal(addMonths("2026-03-15", -3), "2025-12-15");
    assert.equal(addDays("2026-02-28", 1), "2026-03-01");
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  });

  test("a period spans three months when its last day is the day before the same day three months on", () => {
    assert.equal(earliestEnd("2026-07-01"), "2026-09-30");
    assert.equal(spansEnough("2026-07-01", "2026-09-30"), true);
    assert.equal(spansEnough("2026-07-01", "2026-09-29"), false);
    assert.equal(spansEnough("2026-07-01", "2027-01-01"), true);
    // 31 August plus three months is 30 November (a month has no 31st): the period ends on the 29th
    assert.equal(earliestEnd("2026-08-31"), "2026-11-29");
    assert.equal(spansEnough("2026-08-31", "2026-11-28"), false);
    assert.equal(spansEnough("2026-08-31", "2026-11-29"), true);
  });

  test("by default: the last three months, from the first game when that is more recent", () => {
    assert.deepEqual(defaultPeriod({ today: "2026-10-07", first: "2025-01-01" }), {
      from: "2026-07-08",
      to: "2026-10-07"
    });
    assert.deepEqual(defaultPeriod({ today: "2026-10-07", first: null }), {
      from: "2026-07-08",
      to: "2026-10-07"
    });
    const recent = defaultPeriod({ today: "2026-10-07", first: "2026-09-20" });
    assert.equal(recent.from, "2026-09-20", "never before the first game");
    assert.equal(spansEnough(recent.from, recent.to), true, "and still three months long");
  });
});

/** A tournament game: the picks of each side (and the lanes when given). */
const game = ({
  blue,
  red,
  winner = "blue",
  lanes = true,
  playedOn = "2026-09-01",
  rule = "free-for-all"
}) => ({
  gameNumber: 1,
  blueTeam: "Alpha",
  redTeam: "Beta",
  winner: winner === "blue" ? "Alpha" : "Beta",
  playedOn,
  rule,
  picks: { blue, red },
  bans: { blue: [], red: [] },
  pickLanes: lanes
    ? { blue: LANES.slice(), red: LANES.slice() }
    : { blue: Array(5).fill(null), red: Array(5).fill(null) }
});

describe("popular drafts", () => {
  const games = [
    game({ blue: five(1), red: five(11), winner: "blue" }),
    game({ blue: five(1).reverse(), red: five(16), winner: "blue" }), // the same five, picked in another order
    game({ blue: five(1), red: five(11), winner: "red" }),
    game({ blue: five(6), red: five(21), winner: "blue" }),
    game({ blue: five(26).slice(0, 4), red: five(11), winner: "blue" }) // four picks: not a draft
  ];

  test("a draft is its five heroes, whatever the order; each side has its own", () => {
    const { blue, red } = popularDrafts(games);
    assert.equal(
      blue.different,
      2,
      "two different blue drafts (the one with four picks is left out)"
    );
    const first = blue.byPlays[0];
    assert.deepEqual(
      [first.heroes.join(), first.games, first.wins, first.losses],
      [five(1).join(), 3, 2, 1],
      "played three times, won twice, in lane order"
    );
    assert.equal(first.laned, true);
    assert.equal(first.winRate, 2 / 3);
    assert.equal(first.lastPlayed, "2026-09-01");
    assert.equal(
      red.different,
      3,
      "the red side counts its own drafts: five(11), five(16), five(21)"
    );
    const same = red.byPlays[0];
    assert.deepEqual(
      [same.heroes.join(), same.games, same.wins],
      [five(11).join(), 3, 1],
      "red played five(11) three times (even against four picks) and won once"
    );
  });

  test("the two rankings: the best score first (then more games), or most played", () => {
    const { blue } = popularDrafts(games);
    // the score pulls both toward 50 % by ten games: one win in one game and two in three end close
    assert.deepEqual(
      blue.byWinRate.map(entry => [entry.heroes[0], entry.winRate, entry.games]),
      [
        [id(6), 1, 1],
        [id(1), 2 / 3, 3]
      ]
    );
    assert.ok(blue.byWinRate[0].score - blue.byWinRate[1].score < 0.01);
    assert.deepEqual(
      blue.byPlays.map(entry => [entry.heroes[0], entry.games]),
      [
        [id(1), 3],
        [id(6), 1]
      ]
    );
    const strict = popularDrafts(games, { minGames: 2 }).blue;
    assert.deepEqual(
      [strict.eligible, strict.byWinRate.length, strict.byPlays.map(entry => entry.heroes[0])],
      [1, 1, [id(1)]],
      "a minimum of games leaves the drafts played less out of the rankings"
    );
    assert.equal(popularDrafts(games, { limit: 1 }).blue.byPlays.length, 1, "the top of the list");
  });

  test("the three heroes met most when it won, and when it lost", () => {
    const { blue } = popularDrafts(games);
    const draft = blue.byPlays[0];
    assert.deepEqual(
      draft.whenWon.map(entry => [entry.heroId, entry.count]),
      [
        [id(11), 1],
        [id(12), 1],
        [id(13), 1]
      ],
      "won twice, against five(11) and five(16): equal counts come out in a stable order, three of them"
    );
    assert.deepEqual(
      draft.whenLost.map(entry => [entry.heroId, entry.count]),
      [
        [id(11), 1],
        [id(12), 1],
        [id(13), 1]
      ],
      "lost once, against five(11)"
    );
    const twice = popularDrafts([
      game({ blue: five(1), red: five(11), winner: "blue" }),
      game({ blue: five(1), red: [id(11), id(30), id(31), id(32), id(33)], winner: "blue" })
    ]).blue.byPlays[0];
    assert.deepEqual(
      twice.whenWon[0],
      { heroId: id(11), count: 2 },
      "the hero met twice comes first"
    );
  });

  test("a draft whose lanes were not all entered is shown sorted by hero id", () => {
    const { blue } = popularDrafts([
      game({ blue: five(3).reverse(), red: five(11), lanes: false })
    ]);
    assert.equal(blue.byPlays[0].laned, false);
    assert.deepEqual(blue.byPlays[0].heroes, five(3));
  });
});

describe("popular heroes", () => {
  test("the lane is the one that was entered for the pick; a pick without a lane is not put anywhere", () => {
    const result = popularHeroes([
      game({ blue: five(1), red: five(11), winner: "blue" }),
      game({ blue: five(1), red: five(11), winner: "red", lanes: false })
    ]);
    assert.equal(result.placed, 10);
    assert.equal(result.unplaced, 10, "the second game has no lane at all");
    const clash = result.lanes.find(entry => entry.lane === "Clash Lane");
    assert.equal(clash.picks, 2, "two picks in Clash Lane (one per side)");
    const blue = clash.blue.byPlays[0];
    assert.deepEqual([blue.heroId, blue.games, blue.wins], [id(1), 1, 1]);
    const red = clash.red.byPlays[0];
    assert.deepEqual([red.heroId, red.games, red.wins], [id(11), 1, 0]);
    assert.equal(clash.all.byPlays.length, 2, "both sides together");
  });

  test("a hero is ranked in each lane it was played in, with who it met", () => {
    const games = [
      { ...game({ blue: five(1), red: five(11), winner: "blue" }) },
      { ...game({ blue: five(1), red: five(11), winner: "blue" }) },
      { ...game({ blue: [id(2), id(1), id(3), id(4), id(5)], red: five(11), winner: "red" }) }
    ];
    const { lanes } = popularHeroes(games);
    const clash = lanes.find(entry => entry.lane === "Clash Lane").blue;
    assert.deepEqual(
      clash.byWinRate.map(entry => [entry.heroId, entry.games, entry.wins]),
      [
        [id(1), 2, 2],
        [id(2), 1, 0]
      ]
    );
    const jungle = lanes.find(entry => entry.lane === "Jungle").blue;
    assert.deepEqual(
      jungle.byPlays.map(entry => [entry.heroId, entry.games]),
      [
        [id(2), 2],
        [id(1), 1]
      ],
      "the same hero in another lane is another line"
    );
    const hero = clash.byWinRate[0];
    assert.deepEqual(
      hero.whenWon.map(entry => [entry.heroId, entry.count]),
      [
        [id(11), 2],
        [id(12), 2],
        [id(13), 2]
      ],
      "met in both games it won: three of the five heroes of the other side"
    );
    assert.deepEqual(hero.whenLost, [], "it never lost");
    assert.deepEqual(
      clash.byWinRate[1].whenLost.map(entry => entry.heroId),
      [id(11), id(12), id(13)]
    );
  });
});

describe("a win rate that can be believed", () => {
  test("the lower end of the 95 % interval: few games weigh little, many games weigh much", () => {
    const rounded = (wins, played) => Math.round(confidenceOf(wins, played) * 100);
    assert.equal(rounded(1, 1), 21, "one win in one game");
    assert.equal(rounded(2, 3), 21);
    assert.equal(rounded(8, 10), 49);
    assert.equal(rounded(80, 100), 71);
    assert.equal(rounded(0, 5) < 25, true);
    assert.equal(confidenceOf(0, 0), 0, "no game, no confidence");
    assert.equal(
      confidenceOf(10, 10) > confidenceOf(1, 1),
      true,
      "10 of 10 is worth more than 1 of 1"
    );
    assert.equal(confidenceOf(50, 100) < 0.5, true, "never above the raw rate");
  });

  test("a hero played once and won does not beat one that won 8 of 10; most played stays the popularity", () => {
    const lucky = id(30);
    const proven = id(1);
    const games = [
      ...Array.from({ length: 10 }, (_, index) =>
        game({ blue: five(1), red: five(11), winner: index < 8 ? "blue" : "red" })
      ),
      game({ blue: [lucky, id(2), id(3), id(4), id(5)], red: five(11), winner: "blue" })
    ];
    const clash = popularHeroes(games).lanes.find(entry => entry.lane === "Clash Lane").blue;
    assert.deepEqual(
      clash.byWinRate.map(entry => entry.heroId),
      [proven, lucky],
      "8 wins in 10 comes before the lucky 1 in 1"
    );
    assert.deepEqual(
      clash.byPlays.map(entry => entry.heroId),
      [proven, lucky]
    );
    assert.equal(clash.byWinRate[0].confidence > clash.byWinRate[1].confidence, true);
  });
});

describe("drafts that look alike are one group", () => {
  const lead = five(1); // h01..h05
  const one = [id(1), id(2), id(3), id(4), id(40)]; // one hero swapped
  const two = [id(1), id(2), id(3), id(41), id(40)]; // two heroes swapped
  const three = [id(1), id(2), id(42), id(41), id(40)]; // three heroes swapped: another draft
  const games = [
    ...Array.from({ length: 4 }, () => game({ blue: lead, red: five(11), winner: "blue" })),
    game({ blue: one, red: five(11), winner: "blue" }),
    game({ blue: one, red: five(16), winner: "red" }),
    game({ blue: two, red: five(11), winner: "blue" }),
    game({ blue: three, red: five(11), winner: "red" })
  ];

  test("at most two heroes of difference: the most played leads and the others are its variants, with what was swapped", () => {
    const { blue } = popularDrafts(games);
    assert.equal(blue.different, 4, "four exact drafts");
    assert.equal(
      blue.groups,
      2,
      "in two groups: the three that resemble each other, and the one that does not"
    );
    const group = blue.byPlays[0];
    assert.deepEqual(group.heroes, lead, "the leader is the most played draft");
    assert.deepEqual(
      [group.games, group.wins, group.losses],
      [7, 6, 1],
      "the figures of the group add up its variants"
    );
    assert.deepEqual(group.core, [id(1), id(2), id(3)], "the heroes every variant has");
    assert.deepEqual(
      group.variants.map(variant => [variant.heroes.join(), variant.games, variant.leader]),
      [
        [lead.join(), 4, true],
        [one.join(), 2, false],
        [two.join(), 1, false]
      ],
      "the variants, the most played first"
    );
    assert.deepEqual(
      group.variants[1].swaps,
      [{ out: id(5), in: id(40) }],
      "one hero took the place of another"
    );
    assert.deepEqual(
      group.variants[2].swaps,
      [
        { out: id(4), in: id(41) },
        { out: id(5), in: id(40) }
      ],
      "two swaps, each hero paired with the one that stands in its lane"
    );
    assert.deepEqual(group.variants[0].swaps, [], "the leader has nothing swapped");
    const alone = blue.byPlays[1];
    assert.deepEqual(
      [alone.heroes.join(), alone.games, alone.variants.length],
      [three.join(), 1, 1]
    );
  });

  test("a minimum of games counts the group, not each variant; the win rate of a group is its own", () => {
    const strict = popularDrafts(games, { minGames: 5 }).blue;
    assert.deepEqual(
      [strict.eligible, strict.byPlays.length, strict.byPlays[0].heroes.join()],
      [1, 1, lead.join()],
      "seven games together reach five although no draft played five times but the leader"
    );
    const rate = popularDrafts(games).blue.byWinRate[0];
    assert.equal(rate.winRate, 6 / 7);
    assert.equal(rate.confidence, confidenceOf(6, 7));
  });

  test("a draft goes to the leader it shares the most heroes with, the bigger group when equal; the leader never moves", () => {
    const entry = (heroes, played, won) => ({
      key: [...heroes].sort().join("."),
      heroes: [...heroes].sort(),
      order: null,
      games: played,
      wins: won,
      lastPlayed: "2026-09-01",
      beaten: new Map(),
      lostTo: new Map()
    });
    const big = entry(five(1), 10, 5); // h01..h05
    const small = entry([id(1), id(2), id(3), id(50), id(51)], 3, 1); // 3 shared with big, leads its own group? no: close to big
    const apart = entry(five(60), 5, 2);
    const groups = groupDrafts([small, apart, big]);
    assert.deepEqual(
      groups.map(group => [group.leader.key === big.key, group.variants.length, group.games]),
      [
        [true, 2, 13],
        [false, 1, 5]
      ],
      "ordered by the games of the leader: the group of the most played first"
    );
    // a draft that is close to two leaders joins the one it shares the most with
    const first = entry([id(1), id(2), id(3), id(4), id(5)], 9, 4);
    const second = entry([id(1), id(2), id(6), id(7), id(8)], 8, 4); // shares 2 with the first: another group
    const between = entry([id(1), id(2), id(6), id(7), id(9)], 1, 1); // shares 4 with the second, 2 with the first
    const result = groupDrafts([first, second, between]);
    assert.equal(result.length, 2);
    assert.deepEqual(
      result.map(group => group.variants.length),
      [1, 2],
      "the in-between draft is a variant of the second group"
    );
    assert.deepEqual(groupDrafts([]), []);
  });

  test("the order a group is listed in is stable: the same games always give the same list", () => {
    const first = JSON.stringify(popularDrafts(games));
    const reversed = JSON.stringify(popularDrafts(games.slice().reverse()));
    assert.equal(first, reversed);
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("the popularity API", { skip }, () => {
  const tournament = (playedOn, blue, red, extra = {}) => ({
    event: `Cup ${playedOn}`,
    stage: "Final",
    teamA: "Alpha",
    teamB: "Beta",
    bestOf: 3,
    playedOn,
    patch: "",
    sourceUrl: "https://example.test/vod",
    note: "",
    games: [
      {
        blueTeam: "Alpha",
        redTeam: "Beta",
        winner: extra.winner ?? "Alpha",
        durationSeconds: 900,
        bans: { blue: [], red: [] },
        picks: { blue, red },
        pickLanes: { blue: LANES, red: LANES }
      }
    ],
    ...(extra.rule ? { rule: extra.rule } : {})
  });

  test("public, a period of at least three months, never before the first game, the tournaments only", async () => {
    const admin = await app.signIn("Popular", { admin: true });
    const reader = app.browser();
    const empty = await reader.get("/api/popular/drafts");
    assert.equal(empty.status, 200, "no account is needed");
    assert.equal(empty.body.totalGames, 0);
    assert.deepEqual(empty.body.sides.blue.byPlays, [], "no data: empty lists, not an error");
    assert.equal(empty.body.period.first, null);

    for (const [day, blue, red, extra] of [
      ["2026-07-10", five(1), five(11), { winner: "Alpha" }],
      ["2026-08-20", five(1), five(16), { winner: "Beta" }],
      ["2026-09-25", five(1), five(11), { winner: "Alpha", rule: "global-ban-pick" }]
    ]) {
      const saved = await admin.browser.post(
        "/api/admin/tournaments",
        tournament(day, blue, red, extra)
      );
      assert.equal(saved.status, 200, `${day}: ${saved.text}`);
    }

    const all = (await reader.get("/api/popular/drafts?from=2026-07-01&to=2026-12-31")).body;
    assert.equal(all.period.first, "2026-07-10", "the first game that was entered");
    assert.equal(all.period.from, "2026-07-10", "a period never starts before it");
    assert.equal(all.totalGames, 3);
    const blue = all.sides.blue.byPlays[0];
    assert.deepEqual(
      [blue.heroes.join(), blue.games, blue.wins],
      [five(1).join(), 3, 2],
      "the same five played three times, won twice"
    );

    // a period that starts before the first game is trimmed, not refused (and a period that ends
    // before it is simply empty)
    const early = (await reader.get("/api/popular/drafts?from=2026-06-01&to=2026-09-30")).body;
    assert.deepEqual([early.period.from, early.period.to], ["2026-07-10", "2026-09-30"]);
    assert.equal(early.totalGames, 3);
    const ancient = (await reader.get("/api/popular/drafts?from=2026-01-01&to=2026-03-31")).body;
    assert.equal(ancient.totalGames, 0, "nothing before the first game");
    assert.equal(ancient.period.from, "2026-07-10");

    const middle = (await reader.get("/api/popular/drafts?from=2026-08-01&to=2026-11-01")).body;
    assert.equal(middle.totalGames, 2, "only the games of the period");
    assert.equal(middle.sides.blue.byPlays[0].games, 2);

    const rule = (
      await reader.get("/api/popular/drafts?from=2026-07-10&to=2026-12-31&rule=global-ban-pick")
    ).body;
    assert.equal(rule.totalGames, 1, "a rule can be chosen");

    const short = await reader.get("/api/popular/drafts?from=2026-08-01&to=2026-08-31");
    assert.equal(short.status, 400, "a month is not enough");
    assert.match(short.text, /at least 3 months|3 months/);
    assert.equal(
      (await reader.get("/api/popular/drafts?from=2026-08-01&to=2026-10-30")).status,
      400
    );
    assert.equal(
      (await reader.get("/api/popular/drafts?from=2026-08-01&to=2026-10-31")).status,
      200,
      "1 August to 31 October is three months"
    );
    assert.equal(
      (await reader.get("/api/popular/drafts?from=2026-02-30")).status,
      400,
      "not a day"
    );
    assert.equal((await reader.get("/api/popular/drafts?minGames=0")).status, 400);
    assert.equal((await reader.get("/api/popular/drafts?rule=nonsense")).status, 400);

    // the scrims of a team are not tournament games: they do not count, whatever is in them
    const before = JSON.stringify(
      (await reader.get("/api/popular/drafts?from=2026-07-01&to=2026-12-31")).body
    );
    const scrims = await admin.browser.post("/api/series/import", {
      teamA: { name: "Alpha" },
      teamB: { name: "Bravo" },
      bestOf: 3,
      gameMode: "free-for-all",
      games: [
        {
          blueTeam: "Alpha",
          redTeam: "Bravo",
          winner: "Alpha",
          durationSeconds: 1200,
          draft: { bans: { blue: [], red: [] }, picks: { blue: five(1), red: five(21) } }
        }
      ]
    });
    assert.equal(scrims.status, 200, scrims.text);
    assert.equal(
      JSON.stringify((await reader.get("/api/popular/drafts?from=2026-07-01&to=2026-12-31")).body),
      before,
      "a scrim changes nothing"
    );

    const heroes = (await reader.get("/api/popular/heroes?from=2026-07-01&to=2026-12-31")).body;
    assert.equal(heroes.lanes.length, 5);
    assert.equal(heroes.placed, 30, "three games, ten picks, every lane entered");
    const clash = heroes.lanes.find(lane => lane.lane === "Clash Lane");
    assert.deepEqual(
      [clash.blue.byPlays[0].heroId, clash.blue.byPlays[0].games, clash.blue.byPlays[0].wins],
      [id(1), 3, 2]
    );
  });
});
