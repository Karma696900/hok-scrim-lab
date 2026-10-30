// Classic mode: picks only, both sides may take the same hero; online, nobody sees the other side's
// picks before the draft ends.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { heroAvailability, takenFor } from "../../../shared/draft-model.js";
import {
  PICK_ONLY_STEPS,
  advanceDraft,
  applyDraftAction,
  createDraft,
  markDraftReady,
  rewriteDraftHeroes
} from "./series-draft.js";
import { createSeries, startNextGame } from "./series.js";
import { sampleHeroes, startTestServer } from "../../../testing/test-app.js";

const heroes = sampleHeroes(40).map(hero => ({ ...hero, availableGlobal: true }));
const id = number => `h${String(number).padStart(2, "0")}`;
const startedDraft = gameMode => {
  const draft = createDraft({ blueTeam: "A", redTeam: "B", gameMode, picksOnly: true });
  markDraftReady(draft, null, { localStart: true, now: 0 });
  return draft;
};
// The pick order of a picks-only draft: blue, red, red, blue, blue, red, red, blue, blue, red.
const ORDER = PICK_ONLY_STEPS.map(step => step.team);

describe("classic draft (pure)", () => {
  test("a series in classic mode drafts the ten picks only", () => {
    const series = createSeries({ teamA: "A", teamB: "B", bestOf: 3, gameMode: "classic" });
    startNextGame(series);
    assert.equal(series.currentGame.draft.picksOnly, true);
    assert.equal(series.currentGame.draft.gameMode, "classic");
  });

  test("both sides can pick the same hero; a side cannot pick one of its own twice", () => {
    const draft = startedDraft("classic");
    applyDraftAction(draft, id(1), { now: 1000, heroes }); // blue
    applyDraftAction(draft, id(1), { now: 2000, heroes }); // red takes the very same hero
    assert.deepEqual([draft.picks.blue, draft.picks.red], [[id(1)], [id(1)]]);
    applyDraftAction(draft, id(2), { now: 3000, heroes }); // red
    assert.throws(
      () => applyDraftAction(draft, id(1), { now: 4000, heroes }),
      /unavailable/,
      "blue already has h01"
    );
    applyDraftAction(draft, id(2), { now: 5000, heroes }); // blue may take what red has
    assert.deepEqual(draft.picks.blue, [id(1), id(2)]);
  });

  test("the other modes keep their rule: a hero is taken once for the whole draft", () => {
    const draft = startedDraft("free-for-all");
    applyDraftAction(draft, id(1), { now: 1000, heroes });
    assert.throws(() => applyDraftAction(draft, id(1), { now: 2000, heroes }), /unavailable/);
  });

  test("the auto-pick of a side may take a hero the other side already has", () => {
    const small = heroes.slice(0, 5).map(hero => ({
      ...hero,
      lanes: ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"]
    }));
    const draft = startedDraft("classic");
    [0, 0, 1, 1, 2].forEach((hero, index) =>
      applyDraftAction(draft, small[hero].id, { now: (index + 1) * 1000, heroes: small })
    ); // blue: 0,1,2 · red: 0,1
    assert.equal(ORDER[5], "red");
    advanceDraft(draft, 10 ** 9, { heroes: small, random: () => 0 });
    assert.equal(draft.picks.red.at(-1), small[2].id, "red's first free hero is one blue has");
  });

  test("the client mirror follows the same rule", () => {
    const draft = startedDraft("classic");
    applyDraftAction(draft, id(1), { now: 1000, heroes }); // blue; red is up
    assert.deepEqual(takenFor(draft, "red"), []);
    assert.deepEqual(takenFor(draft, "blue"), [id(1)]);
    assert.equal(
      heroAvailability({
        hero: heroes[0],
        draft,
        series: { gameMode: "classic" },
        usedByActingTeam: [],
        flowbornIds: [],
        canAct: true
      }).blocked,
      false
    );
  });

  test("a correction keeps the rule: the same hero on both sides is fine, twice on one side is not, bans are refused", () => {
    const blank = () => ({
      picksOnly: true,
      gameMode: "classic",
      actions: [],
      bans: { blue: [], red: [] },
      picks: { blue: [], red: [] }
    });
    const none = { blue: [], red: [] };
    const same = rewriteDraftHeroes(
      blank(),
      { bans: none, picks: { blue: [id(1), id(2)], red: [id(1), id(3)] } },
      heroes
    );
    assert.deepEqual(
      [same.picks.blue, same.picks.red],
      [
        [id(1), id(2)],
        [id(1), id(3)]
      ]
    );
    assert.throws(
      () =>
        rewriteDraftHeroes(
          blank(),
          { bans: none, picks: { blue: [id(1), id(1)], red: [] } },
          heroes
        ),
      /once/
    );
    assert.throws(
      () => rewriteDraftHeroes(blank(), { bans: { blue: [id(5)], red: [] }, picks: none }, heroes),
      /no bans/
    );
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("classic over HTTP", { skip }, () => {
  test("solo: both sides are visible and the same hero can be picked on both", async () => {
    const me = app.browser();
    const { body: series } = await me.post("/api/series", {
      teamA: "Solo A",
      teamB: "Solo B",
      bestOf: 1,
      gameMode: "classic"
    });
    assert.equal(series.gameMode, "classic");
    await me.post(`/api/series/${series.id}/game`, { blueTeam: "Solo A" });
    await me.post(`/api/series/${series.id}/game/ready`);
    assert.equal(
      (await me.post(`/api/series/${series.id}/game/action`, { heroId: id(1) })).status,
      200
    );
    const second = await me.post(`/api/series/${series.id}/game/action`, { heroId: id(1) });
    assert.equal(second.status, 200, second.text);
    const draft = second.body.currentGame.draft;
    assert.deepEqual(
      [draft.picks.blue, draft.picks.red, draft.hiddenPicks],
      [[id(1)], [id(1)], undefined]
    );
  });

  test("online: you see your own picks, the other side's only as a count, until the draft ends", async () => {
    const a = await app.signIn("ClassicA");
    const b = await app.signIn("ClassicB");
    const room = (
      await a.browser.post("/api/online/series", {
        teamA: "Alpha",
        teamB: "Bravo",
        bestOf: 1,
        gameMode: "classic"
      })
    ).body;
    await b.browser.post(`/api/online/${room.online.invitationCode}/join`);
    const base = `/api/series/${room.id}`;
    await a.browser.post(`${base}/game`, { blueTeam: "Alpha" }); // Alpha (player A) is blue, Bravo (player B) red
    await a.browser.post(`${base}/game/ready`);
    await b.browser.post(`${base}/game/ready`);

    const watcher = await app.signIn("ClassicWatcher");
    const invite = (await a.browser.post(`${base}/invites`, { role: "viewer" })).body;
    assert.equal(
      (await watcher.browser.post("/api/invites/accept", { token: invite.token })).status,
      200
    );

    const play = async (index, heroId) => {
      const response = await (ORDER[index] === "blue" ? a : b).browser.post(`${base}/game/action`, {
        heroId
      });
      assert.equal(response.status, 200, response.text);
    };
    const seen = async who => (await who.browser.get(base)).body.currentGame.draft;
    const heroesInLog = draft => draft.actions.filter(action => action.heroId);

    await play(0, id(1)); // blue
    await play(1, id(1)); // red picks the same hero: allowed

    const ofA = await seen(a);
    assert.deepEqual(
      [ofA.picks.blue, ofA.picks.red, ofA.hiddenPicks],
      [[id(1)], [], { red: 1 }],
      "A sees its pick and only the count of B's"
    );
    assert.deepEqual(ofA.pickAssignments.red, []);
    assert.deepEqual(
      heroesInLog(ofA).map(action => action.team),
      ["blue"],
      "the log does not leak B's hero"
    );
    const ofB = await seen(b);
    assert.deepEqual([ofB.picks.blue, ofB.picks.red, ofB.hiddenPicks], [[], [id(1)], { blue: 1 }]);
    const ofWatcher = await seen(watcher);
    assert.deepEqual(
      [ofWatcher.picks.blue, ofWatcher.picks.red, ofWatcher.hiddenPicks],
      [[], [], { blue: 1, red: 1 }],
      "a spectator sees no pick, only how many were made"
    );
    assert.equal(heroesInLog(ofWatcher).length, 0);

    // the stored series is not touched by the masking
    const stored = await app.database.pool?.query?.("SELECT data_json FROM series WHERE id = ?", [
      room.id
    ]);
    if (stored) {
      assert.deepEqual(JSON.parse(stored[0][0].data_json).currentGame.draft.picks, {
        blue: [id(1)],
        red: [id(1)]
      });
    }

    for (let index = 2; index < 10; index += 1) {
      await play(index, id(index + 1));
    }
    const done = await seen(watcher);
    assert.equal(done.phase, "waiting");
    assert.equal(done.hiddenPicks, undefined, "once the draft is over everything is shown");
    assert.deepEqual(
      [done.picks.blue[0], done.picks.red[0]],
      [id(1), id(1)],
      "both sides picked h01"
    );
    assert.equal(done.picks.blue.length + done.picks.red.length, 10);
  });
});
