// Client-side draft model (pure): lane slots, timer states, hero availability.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  advanceDraft,
  applyDraftAction,
  createDraft,
  startDraftTimer
} from "../server/features/series/series-draft.js";
import {
  DRAFT_STEPS,
  PICK_LANES,
  banSlots,
  expectedLane,
  formatClock,
  heroAvailability,
  nextBanIndex,
  pickSlots,
  timerState,
  usedHeroes
} from "./draft-model.js";
import { DRAFT_STEPS as SERVER_STEPS } from "../server/features/series/series-draft.js";

const heroes = [
  { id: "mid1", name: "Mid One", lanes: ["Mid Lane"], availableGlobal: true },
  { id: "jg1", name: "Jungler", lanes: ["Jungle"], availableGlobal: true },
  { id: "clash1", name: "Clasher", lanes: ["Clash Lane"], availableGlobal: true },
  { id: "farm1", name: "Farmer", lanes: ["Farm Lane"], availableGlobal: true },
  { id: "sup1", name: "Supporter", lanes: ["Roamer"], availableGlobal: true },
  ...Array.from({ length: 12 }, (_, index) => ({
    id: `x${index}`,
    name: `X${index}`,
    lanes: ["Clash Lane"],
    availableGlobal: true
  }))
];

/** A real server draft in which blue picks a Mid hero first: the server swaps lane priority. */
function draftWithSwap() {
  const draft = createDraft({ blueTeam: "A", redTeam: "B" });
  startDraftTimer(draft, 1000);
  let tick = 1001;
  for (const heroId of ["x0", "x1", "x2", "x3"]) {
    applyDraftAction(draft, heroId, { now: tick++, heroes });
  } // 4 bans
  applyDraftAction(draft, "mid1", { now: tick, heroes }); // blue pick 1 = a Mid hero while pick 1 "belongs" to Clash
  return draft;
}

describe("draft model", () => {
  test("the client step order matches the server", () => {
    assert.deepEqual(DRAFT_STEPS, SERVER_STEPS);
  });

  test("picks fill the slots IN PICK ORDER, whatever the hero's role (a Mid hero first goes to slot 1)", () => {
    const draft = draftWithSwap();
    assert.equal(
      draft.pickAssignments.blue[0].lane,
      "Mid Lane",
      "the server still swaps lane priority for the auto-pick"
    );
    const slots = pickSlots(draft, "blue");
    assert.deepEqual(
      slots.map(slot => slot.heroId),
      ["mid1", null, null, null, null]
    );
    assert.deepEqual(
      slots.map(slot => slot.rank),
      [1, 2, 3, 4, 5]
    );
  });

  test("slots keep their role rank (only the auto-pick uses it) and never restrict a pick", () => {
    const draft = createDraft({ blueTeam: "A", redTeam: "B" });
    startDraftTimer(draft, 1000);
    let tick = 1001;
    for (const heroId of ["x0", "x1", "x2", "x3"]) {
      applyDraftAction(draft, heroId, { now: tick++, heroes });
    }
    // blue picks five Roamers' worth of the same role: every pick is accepted
    const sameRole = heroes.filter(hero => hero.lanes.includes("Clash Lane"));
    assert.ok(sameRole.length >= 5);
    applyDraftAction(draft, sameRole[0].id, { now: tick, heroes });
    assert.deepEqual(
      pickSlots(draft, "blue").map(slot => slot.lane),
      PICK_LANES
    );
    assert.equal(pickSlots(draft, "blue")[0].heroId, sameRole[0].id);
  });

  test("a full draft fills every slot exactly once", () => {
    const draft = createDraft({ blueTeam: "A", redTeam: "B" });
    startDraftTimer(draft, 1000);
    const order = [
      "x0",
      "x1",
      "x2",
      "x3",
      "mid1",
      "jg1",
      "clash1",
      "farm1",
      "sup1",
      "x4",
      "x5",
      "x6",
      "x7",
      "x8",
      "x9",
      "x10",
      "x11"
    ];
    let tick = 1001;
    for (const heroId of order) {
      applyDraftAction(draft, heroId, { now: tick++, heroes });
    }
    for (const side of ["blue", "red"]) {
      const placed = pickSlots(draft, side)
        .filter(slot => slot.heroId)
        .map(slot => slot.heroId);
      assert.equal(new Set(placed).size, placed.length);
      assert.equal(placed.length, draft.picks[side].length);
    }
  });

  test("drafts without lane assignments (older games) still show in pick order", () => {
    const legacy = { picks: { blue: ["a", "b"], red: [] }, bans: { blue: [], red: [] } };
    assert.deepEqual(
      pickSlots(legacy, "blue").map(slot => slot.heroId),
      ["a", "b", null, null, null]
    );
  });

  test("ban slots are always five long", () => {
    assert.deepEqual(banSlots({ bans: { blue: ["a"], red: [] } }, "blue"), [
      "a",
      null,
      null,
      null,
      null
    ]);
  });

  test("the next ban takes the slot after the bans made AND the ones nobody made", () => {
    const draft = createDraft({ blueTeam: "A", redTeam: "B" });
    assert.equal(nextBanIndex(draft, "blue"), 0);
    startDraftTimer(draft, 1000);
    advanceDraft(draft, 31_000); // Blue's first ban times out: slot 0 stays empty
    assert.equal(nextBanIndex(draft, "blue"), 1, "the next ban of Blue is the second slot");
    assert.equal(nextBanIndex(draft, "red"), 0, "the other side is not affected");
    applyDraftAction(draft, "r1", { now: 32_000 });
    applyDraftAction(draft, "b2", { now: 33_000 });
    assert.equal(nextBanIndex(draft, "blue"), 2);
    assert.equal(nextBanIndex(draft, "red"), 1);
    assert.equal(
      nextBanIndex({ bans: { blue: ["a", "b"], red: [] } }, "blue"),
      2,
      "drafts without an action log count the bans that were made"
    );
  });

  test("the next expected lane follows the invisible priority order", () => {
    const draft = draftWithSwap();
    assert.equal(expectedLane(draft, "blue"), draft.pickLaneOrder.blue[1]);
    assert.equal(expectedLane(createDraft({ blueTeam: "A", redTeam: "B" }), "red"), "Clash Lane");
  });
});

describe("timer states", () => {
  const draft = overrides => ({ started: true, phase: "draft", deadline: 100_000, ...overrides });
  test("normal, warning and expired are three distinct states", () => {
    assert.equal(timerState(draft(), 70_000).name, "normal");
    assert.equal(timerState(draft(), 70_000).label, "00:30");
    assert.equal(timerState(draft(), 95_001).name, "warning");
    assert.equal(timerState(draft(), 100_000).name, "expired");
    assert.equal(timerState(draft(), 250_000).name, "expired");
  });
  test("the boundary is the last five seconds", () => {
    assert.equal(timerState(draft(), 94_999).name, "normal");
    assert.equal(timerState(draft(), 95_000).name, "warning");
  });
  test("ready check, pending ban and finished draft", () => {
    assert.equal(timerState(draft({ started: false, deadline: null }), 0).name, "idle");
    assert.equal(timerState(draft({ deadline: null }), 0).name, "idle");
    assert.equal(timerState(draft({ phase: "complete", deadline: null }), 0).name, "done");
  });
  test("clock formatting rounds up and never goes negative", () => {
    assert.equal(formatClock(30_000), "00:30");
    assert.equal(formatClock(29_001), "00:30");
    assert.equal(formatClock(-5), "00:00");
    assert.equal(formatClock(125_000), "02:05");
  });
});

describe("hero availability", () => {
  const draft = { bans: { blue: ["b1"], red: [] }, picks: { blue: ["p1"], red: [] }, stepIndex: 4 }; // blue's first pick
  const series = { gameMode: "global-ban-pick" };
  const flowbornIds = ["581", "582"];
  const flow = (id, name) => ({ id, name });
  const check = (hero, used = [], canAct = true, gameMode = "global-ban-pick") =>
    heroAvailability({
      hero,
      draft,
      series: { gameMode },
      usedByActingTeam: used,
      flowbornIds,
      canAct
    });

  test("heroes already banned or picked this game are blocked", () => {
    assert.deepEqual(check({ id: "b1", name: "x" }), { blocked: true, label: "Used this game" });
    assert.deepEqual(check({ id: "p1", name: "x" }), { blocked: true, label: "Used this game" });
  });
  test("Global Ban & Pick blocks the acting team's earlier picks and every Flowborn form", () => {
    assert.deepEqual(check({ id: "h", name: "H" }, ["h"]), {
      blocked: true,
      label: "Used in series"
    });
    assert.equal(check(flow("582", "Flowborn (Mage)"), ["581"]).label, "Used in series");
    assert.equal(check(flow("582", "Flowborn (Mage)"), []).blocked, false);
  });
  test("Free For All allows repeats", () => {
    assert.equal(check({ id: "h", name: "H" }, ["h"], true, "free-for-all").blocked, false);
  });
  test("bans are never limited by series usage", () => {
    const banStep = { ...draft, stepIndex: 0 };
    assert.equal(
      heroAvailability({
        hero: { id: "h", name: "H" },
        draft: banStep,
        series,
        usedByActingTeam: ["h"],
        flowbornIds,
        canAct: true
      }).blocked,
      false
    );
  });
  test("a player who is not on turn sees every hero as waiting", () => {
    assert.deepEqual(check({ id: "h", name: "H" }, [], false), { blocked: true, label: "Waiting" });
  });
  test("series usage lists a team's picks from both sides", () => {
    const played = {
      games: [
        { blueTeam: "A", redTeam: "B", draft: { picks: { blue: ["1"], red: ["2"] } } },
        { blueTeam: "B", redTeam: "A", draft: { picks: { blue: ["3"], red: ["4"] } } }
      ]
    };
    assert.deepEqual(usedHeroes(played, "A"), ["1", "4"]);
    assert.deepEqual(usedHeroes(played, "B"), ["2", "3"]);
  });
});
