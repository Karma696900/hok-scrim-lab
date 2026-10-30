// Global Ban & Pick: the series rule (no hero twice per team over the series, ONE Flowborn form per
// team) holds everywhere a series is written: live drafts (manual pick and auto-pick), imports,
// hand-entered tournaments, and the client's hero cards. Pure tests, no database.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { heroAvailability } from "../../../shared/draft-model.js";
import {
  advanceDraft,
  applyDraftAction,
  assertGlobalBanPick,
  createDraft,
  startDraftTimer
} from "./series-draft.js";
import { parseTournamentSeries } from "../tournaments/tournament-domain.js";
import { lanePool } from "../tier-lists/tier-list-domain.js";
import { parseSeriesImport } from "./series-validation.js";

const ids = (from, count) =>
  Array.from({ length: count }, (_, index) => `h${String(from + index).padStart(2, "0")}`);
const known = new Set(ids(1, 30));
const FLOWBORN = ["h29", "h30"];

describe("assertGlobalBanPick", () => {
  test("a team cannot pick the same hero in two games, its opponent can", () => {
    const entries = [
      { team: "Alpha", heroes: ids(1, 5) },
      { team: "Bravo", heroes: ids(11, 5) },
      { team: "Bravo", heroes: ids(1, 5) }, // the opponent takes what Alpha took: allowed
      { team: "Alpha", heroes: ids(11, 5) }
    ];
    assert.doesNotThrow(() => assertGlobalBanPick(entries, FLOWBORN));
    assert.throws(
      () => assertGlobalBanPick([...entries, { team: "Alpha", heroes: ["h03"] }], FLOWBORN),
      /Alpha already picked this hero/
    );
  });

  test("a team can use one Flowborn form in the whole series, whichever form and whichever game", () => {
    const entries = [
      { team: "Alpha", heroes: ["h29", ...ids(2, 4)] },
      { team: "Bravo", heroes: ["h30", ...ids(12, 4)] } // the other team has its own Flowborn
    ];
    assert.doesNotThrow(() => assertGlobalBanPick(entries, FLOWBORN));
    assert.throws(
      () =>
        assertGlobalBanPick(
          [...entries, { team: "Alpha", heroes: ["h30", ...ids(6, 4)] }],
          FLOWBORN
        ),
      /Alpha can only use Flowborn once/
    );
    assert.throws(
      () =>
        assertGlobalBanPick([{ team: "Alpha", heroes: ["h29", "h30", ...ids(2, 3)] }], FLOWBORN),
      /Alpha can only use Flowborn once/,
      "two forms in the same game"
    );
  });

  test("`from` only reports entries at or after it (a game being corrected is checked against the others)", () => {
    const entries = [
      { team: "Alpha", heroes: ["h01"] },
      { team: "Alpha", heroes: ["h01"] }
    ];
    assert.doesNotThrow(() => assertGlobalBanPick(entries, [], { from: 2 }));
    assert.throws(() => assertGlobalBanPick(entries, [], { from: 1 }), /already picked/);
  });
});

describe("live draft: Flowborn counts the picks of the current game too", () => {
  const blueDraft = () => {
    const draft = createDraft({ blueTeam: "A", redTeam: "B", gameMode: "global-ban-pick" });
    draft.stepIndex = 4; // blue's first pick
    startDraftTimer(draft, 1000);
    return draft;
  };

  test("a second Flowborn form is refused in the same game", () => {
    const draft = blueDraft();
    applyDraftAction(draft, "h29", { now: 1001, flowbornIds: FLOWBORN });
    // red answers twice, then blue picks again
    applyDraftAction(draft, "h01", { now: 1002, flowbornIds: FLOWBORN });
    applyDraftAction(draft, "h02", { now: 1003, flowbornIds: FLOWBORN });
    assert.throws(
      () => applyDraftAction(draft, "h30", { now: 1004, flowbornIds: FLOWBORN }),
      /Flowborn once/
    );
    assert.doesNotThrow(() => applyDraftAction(draft, "h03", { now: 1005, flowbornIds: FLOWBORN }));
  });

  test("the other team can still take a Flowborn form in that game", () => {
    const draft = blueDraft();
    applyDraftAction(draft, "h29", { now: 1001, flowbornIds: FLOWBORN });
    assert.doesNotThrow(() => applyDraftAction(draft, "h30", { now: 1002, flowbornIds: FLOWBORN }));
  });

  test("the auto-pick never takes a second Flowborn form", () => {
    const draft = blueDraft();
    draft.picks.blue.push("h29"); // blue already has its Flowborn; its next lane is Jungle
    const heroes = [
      { id: "h30", name: "Flowborn (Assassin)", lanes: ["Jungle"], availableGlobal: true },
      { id: "h10", name: "Hero 10", lanes: ["Jungle"], availableGlobal: true }
    ];
    advanceDraft(draft, 1000 + 31_000, { heroes, flowbornIds: FLOWBORN, random: () => 0 });
    assert.deepEqual(draft.picks.blue, ["h29", "h10"]);
  });
});

describe("imported series", () => {
  const game = (blue, red, picks) => ({
    blueTeam: blue,
    redTeam: red,
    winner: blue,
    durationSeconds: 900,
    draft: { bans: { blue: ids(21, 5), red: [] }, picks }
  });
  const body = (games, gameMode = "global-ban-pick") => ({
    teamA: { name: "Alpha" },
    teamB: { name: "Bravo" },
    bestOf: 3,
    gameMode,
    games
  });
  const valid = [
    game("Alpha", "Bravo", { blue: ids(1, 5), red: ids(11, 5) }),
    game("Bravo", "Alpha", { blue: ids(16, 5), red: ids(6, 5) })
  ];

  test("a valid Global Ban & Pick series is accepted", () => {
    assert.doesNotThrow(() => parseSeriesImport(body(valid), known, { flowbornIds: FLOWBORN }));
  });

  test("a hero reused by the same team in another game is refused", () => {
    const reused = [
      valid[0],
      game("Bravo", "Alpha", { blue: ids(16, 5), red: ["h01", ...ids(7, 4)] })
    ];
    assert.throws(
      () => parseSeriesImport(body(reused), known, { flowbornIds: FLOWBORN }),
      /Alpha already picked this hero/
    );
  });

  test("a second Flowborn form for the same team is refused", () => {
    const twice = [
      game("Alpha", "Bravo", { blue: ["h29", ...ids(2, 4)], red: ids(11, 5) }),
      game("Bravo", "Alpha", { blue: ids(16, 5), red: ["h30", ...ids(7, 4)] })
    ];
    assert.throws(
      () => parseSeriesImport(body(twice), known, { flowbornIds: FLOWBORN }),
      /Alpha can only use Flowborn once/
    );
  });

  test("Free For All and Classic keep allowing repeats", () => {
    const reused = [
      valid[0],
      game("Bravo", "Alpha", { blue: ids(16, 5), red: ["h01", ...ids(7, 4)] })
    ];
    assert.doesNotThrow(() =>
      parseSeriesImport(body(reused, "free-for-all"), known, { flowbornIds: FLOWBORN })
    );
  });
});

describe("hand-entered tournaments", () => {
  const side = start => ids(start + 1, 5);
  const game = (overrides = {}) => ({
    blueTeam: "Alpha",
    redTeam: "Beta",
    winner: "Alpha",
    durationSeconds: 900,
    bans: { blue: ["h21"], red: [] },
    picks: { blue: side(0), red: side(5) },
    ...overrides
  });
  const series = (rule, games) => ({
    event: "KPL",
    stage: "",
    teamA: "Alpha",
    teamB: "Beta",
    bestOf: 5,
    rule,
    playedOn: "2026-03-02",
    patch: "1.2",
    sourceUrl: "https://example.test/vod",
    note: "",
    games
  });
  const parse = input => parseTournamentSeries(input, known, { flowbornIds: FLOWBORN });
  const swapped = overrides =>
    game({ blueTeam: "Beta", redTeam: "Alpha", winner: "Beta", ...overrides });

  test("a valid Global Ban & Pick series passes; a repeated hero or a second Flowborn does not", () => {
    assert.doesNotThrow(() =>
      parse(
        series("global-ban-pick", [game(), swapped({ picks: { blue: side(10), red: side(15) } })])
      )
    );
    assert.throws(
      () => parse(series("global-ban-pick", [game(), game()])),
      error => error.code === "invalid_body" && /already picked this hero/.test(error.message)
    );
    const flowborn = [
      game({ picks: { blue: ["h30", ...ids(2, 4)], red: side(5) } }),
      swapped({ picks: { blue: side(10), red: ["h29", ...ids(16, 4)] } })
    ];
    assert.throws(
      () => parse(series("global-ban-pick", flowborn)),
      error => error.code === "invalid_body" && /Flowborn once/.test(error.message)
    );
  });

  test("other rules are not affected", () => {
    assert.doesNotThrow(() => parse(series("free-for-all", [game(), game()])));
    assert.doesNotThrow(() => parse(series("classic", [game(), game()])));
  });
});

describe("a Flowborn form with an extra lane (admin)", () => {
  const tank = {
    id: "581",
    name: "Flowborn (Tank)",
    lanes: ["Clash Lane", "Jungle"],
    laneSources: { "Clash Lane": "camp", Jungle: "manual" },
    availableGlobal: true
  };
  const assassin = {
    id: "583",
    name: "Flowborn (Assassin)",
    lanes: ["Jungle"],
    laneSources: { Jungle: "camp" },
    availableGlobal: true
  };

  test("a lane list keeps one Flowborn: the form whose own lane it is", () => {
    assert.deepEqual(
      lanePool([tank, assassin], "Jungle").map(hero => hero.id),
      ["583"]
    );
    assert.deepEqual(
      lanePool([tank, assassin], "Clash Lane").map(hero => hero.id),
      ["581"]
    );
    assert.deepEqual(
      lanePool([assassin, tank], "Jungle").map(hero => hero.id),
      ["583"]
    );
  });

  test("with no native form on the lane, the extra-lane form is still offered", () => {
    assert.deepEqual(
      lanePool([tank], "Jungle").map(hero => hero.id),
      ["581"]
    );
  });

  test("All Roles still lists every form once", () => {
    assert.deepEqual(
      lanePool([tank, assassin], null).map(hero => hero.id),
      ["581", "583"]
    );
  });
});

describe("hero cards", () => {
  test("a Flowborn form already picked in this game locks the other forms for the acting team", () => {
    const draft = { bans: { blue: [], red: [] }, picks: { blue: ["581"], red: [] }, stepIndex: 4 }; // blue's pick
    const result = heroAvailability({
      hero: { id: "582", name: "Flowborn (Mage)" },
      draft,
      series: { gameMode: "global-ban-pick" },
      usedByActingTeam: [],
      flowbornIds: ["581", "582"],
      canAct: true
    });
    assert.deepEqual(result, { blocked: true, label: "Used in series" });
  });
});
