// Correcting the bans/picks of a game after the fact.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { rewriteDraftHeroes } from "./series-draft.js";
import { editGameDraft } from "./series.js";
import { banSlots, pickSlots } from "../../../shared/draft-model.js";
import { sampleHeroes, startTestServer } from "../../../testing/test-app.js";

const ids = (from, count) =>
  Array.from({ length: count }, (_, index) => `h${String(from + index).padStart(2, "0")}`);
const heroes = sampleHeroes(40).map(hero => ({ ...hero, availableGlobal: true }));
const edit = (overrides = {}) => ({
  bans: { blue: ids(21, 5), red: ids(26, 5) },
  picks: { blue: ids(1, 5), red: ids(11, 5) },
  ...overrides
});
const game = (blue = "Alpha", red = "Bravo", winner = blue) => ({
  blueTeam: blue,
  redTeam: red,
  winner,
  durationSeconds: 1500,
  draft: {
    bans: { blue: ids(21, 5), red: ids(26, 5) },
    picks: { blue: ids(1, 5), red: ids(11, 5) }
  }
});

describe("rewriteDraftHeroes (pure)", () => {
  const blankDraft = () => ({
    actions: [],
    bans: { blue: [], red: [] },
    picks: { blue: [], red: [] }
  });

  test("replaces bans and picks, rebuilds the action log in draft order and the lane assignments", () => {
    const draft = rewriteDraftHeroes(blankDraft(), edit(), heroes);
    assert.deepEqual(draft.picks.blue, ids(1, 5));
    assert.equal(draft.actions.length, 20);
    assert.deepEqual(
      draft.actions.slice(0, 4).map(action => [action.team, action.action, action.heroId]),
      [
        ["blue", "ban", "h21"],
        ["red", "ban", "h26"],
        ["blue", "ban", "h22"],
        ["red", "ban", "h27"]
      ]
    );
    assert.deepEqual(draft.actions[4], {
      team: "blue",
      action: "pick",
      heroId: "h01",
      lane: draft.actions[4].lane,
      edited: true,
      completedAt: draft.actions[4].completedAt
    });
    assert.equal(draft.pickAssignments.blue.length, 5);
    assert.equal(
      new Set(draft.pickAssignments.blue.map(item => item.lane)).size,
      5,
      "each lane is used once"
    );
  });

  test("a change keeps untouched actions (timing flags) and marks edited ones", () => {
    const first = rewriteDraftHeroes(blankDraft(), edit(), heroes);
    first.actions[0] = { ...first.actions[0], timedOut: true };
    const second = rewriteDraftHeroes(
      first,
      edit({ bans: { blue: ["h35", ...ids(22, 4)], red: ids(26, 5) } }),
      heroes
    );
    assert.equal(second.actions[0].heroId, "h35");
    assert.equal(second.actions[0].edited, true);
    assert.equal(second.actions[2].heroId, "h22", "other actions are unchanged");
    assert.equal(second.actions.filter(action => action.edited).length >= 1, true);
  });

  test("the picks follow the pick order on the board (rank = order, not role)", () => {
    const draft = rewriteDraftHeroes(
      blankDraft(),
      edit({ picks: { blue: ["h05", "h04", "h03", "h02", "h01"], red: [] } }),
      heroes
    );
    assert.deepEqual(
      pickSlots(draft, "blue").map(slot => slot.heroId),
      ["h05", "h04", "h03", "h02", "h01"]
    );
  });

  test("rejects: unknown hero, duplicates, more than 5, bad shapes", () => {
    for (const bad of [
      edit({ bans: { blue: ["nope", ...ids(22, 4)], red: ids(26, 5) } }),
      edit({ picks: { blue: ids(1, 5), red: ["h01", ...ids(12, 4)] } }),
      edit({ picks: { blue: ids(1, 6), red: ids(11, 5) } }),
      edit({ bans: { blue: [5], red: [] } }),
      { bans: null, picks: {} }
    ]) {
      assert.throws(
        () => rewriteDraftHeroes(blankDraft(), bad, heroes),
        /at most 5|Unknown hero|only appear once/
      );
    }
  });

  test("a null ban is a skipped ban: it keeps its position and is logged as skipped", () => {
    const draft = rewriteDraftHeroes(
      blankDraft(),
      { bans: { blue: ["h21", null, "h22"], red: ["h26"] }, picks: { blue: [], red: [] } },
      heroes
    );
    assert.deepEqual(draft.bans.blue, ["h21", "h22"]);
    assert.deepEqual(
      draft.actions
        .filter(action => action.team === "blue" && action.action === "ban")
        .map(action => action.heroId),
      ["h21", null, "h22"]
    );
    assert.equal(draft.actions.find(action => action.heroId === null).skipped, true);
    assert.deepEqual(banSlots(draft, "blue"), ["h21", null, "h22", null, null]);
    assert.throws(
      () =>
        rewriteDraftHeroes(
          blankDraft(),
          { bans: { blue: [], red: [] }, picks: { blue: [null], red: [] } },
          heroes
        ),
      /Unknown hero/
    );
  });

  test("partial drafts are allowed (fewer than 5) and an empty edit clears the draft", () => {
    const partial = rewriteDraftHeroes(
      blankDraft(),
      { bans: { blue: ["h21"], red: [] }, picks: { blue: [], red: [] } },
      heroes
    );
    assert.equal(partial.actions.length, 1);
    assert.equal(
      rewriteDraftHeroes(
        partial,
        { bans: { blue: [], red: [] }, picks: { blue: [], red: [] } },
        heroes
      ).bans.blue.length,
      0
    );
  });
});

describe("editGameDraft (series rules)", () => {
  // game 1: Alpha (blue) h01-05, Bravo (red) h11-15. game 2: Bravo (blue) h16-20, Alpha (red)
  // h06-10.
  const series = mode => ({
    gameMode: mode,
    currentGame: null,
    updatedAt: "x",
    games: [
      {
        ...game(),
        draft: {
          actions: [],
          bans: { blue: ids(21, 5), red: ids(26, 5) },
          picks: { blue: ids(1, 5), red: ids(11, 5) }
        }
      },
      {
        ...game("Bravo", "Alpha", "Bravo"),
        draft: {
          actions: [],
          bans: { blue: ids(21, 5), red: ids(26, 5) },
          picks: { blue: ids(16, 5), red: ids(6, 5) }
        }
      }
    ]
  });
  const FLOWBORN = ["h38", "h39"];

  test("Free For All: heroes can be reused from other games", () => {
    const s = series("free-for-all");
    assert.doesNotThrow(() =>
      editGameDraft(s, s.games[1], edit({ picks: { blue: ids(11, 5), red: ids(1, 5) } }), {
        heroes
      })
    );
  });

  test("Global Ban & Pick: a team cannot take a hero it already picked in another game", () => {
    const s = series("global-ban-pick");
    assert.throws(
      () =>
        editGameDraft(
          s,
          s.games[1],
          edit({ picks: { blue: ids(16, 5), red: ["h01", ...ids(32, 4)] } }),
          { heroes }
        ),
      /Alpha already picked this hero/
    );
    assert.throws(
      () =>
        editGameDraft(
          s,
          s.games[1],
          edit({ picks: { blue: ["h11", ...ids(17, 4)], red: ids(6, 5) } }),
          { heroes }
        ),
      /Bravo already picked this hero/
    );
    assert.doesNotThrow(() =>
      editGameDraft(s, s.games[1], edit({ picks: { blue: ids(16, 5), red: ids(31, 5) } }), {
        heroes
      })
    );
  });

  test("Global Ban & Pick: one Flowborn per team per series, any form", () => {
    const s = series("global-ban-pick");
    editGameDraft(
      s,
      s.games[0],
      edit({ picks: { blue: ["h38", ...ids(2, 4)], red: ids(11, 5) } }),
      { heroes, flowbornIds: FLOWBORN }
    );
    assert.throws(
      () =>
        editGameDraft(
          s,
          s.games[1],
          edit({ picks: { blue: ids(16, 5), red: ["h39", ...ids(31, 4)] } }),
          { heroes, flowbornIds: FLOWBORN }
        ),
      /Flowborn once/
    );
    assert.throws(
      () =>
        editGameDraft(
          s,
          s.games[0],
          edit({ picks: { blue: ["h38", "h39", ...ids(2, 3)], red: ids(11, 5) } }),
          { heroes, flowbornIds: FLOWBORN }
        ),
      /Flowborn once/
    );
  });

  test("the current game can only be edited once its draft is over", () => {
    const s = series("free-for-all");
    s.currentGame = {
      ...game(),
      draft: {
        actions: [],
        phase: "draft",
        bans: { blue: [], red: [] },
        picks: { blue: [], red: [] }
      }
    };
    assert.throws(() => editGameDraft(s, s.currentGame, edit(), { heroes }), /still in progress/);
    s.currentGame.draft.phase = "complete";
    assert.doesNotThrow(() => editGameDraft(s, s.currentGame, edit(), { heroes }));
  });

  test("a failed edit changes nothing", () => {
    const s = series("free-for-all");
    const before = JSON.stringify(s.games[0].draft);
    assert.throws(() =>
      editGameDraft(s, s.games[0], edit({ bans: { blue: ["nope"], red: [] } }), { heroes })
    );
    assert.equal(JSON.stringify(s.games[0].draft), before);
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";
const importBody = (extra = {}) => ({
  teamA: { name: "Alpha" },
  teamB: { name: "Bravo" },
  bestOf: 3,
  gameMode: "free-for-all",
  games: [game(), game("Bravo", "Alpha", "Alpha")],
  ...extra
});

describe("editing over HTTP", { skip }, () => {
  test("the owner corrects a finished game; statistics and later reads follow", async () => {
    const me = app.browser();
    const series = (await me.post("/api/series/import", importBody())).body;
    const response = await me.patch(`/api/series/${series.id}/games/0/draft`, {
      ...edit({ picks: { blue: ["h06", ...ids(2, 4)], red: ids(11, 5) } }),
      expectedVersion: series.version
    });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.body.games[0].draft.picks.blue[0], "h06");
    assert.equal(response.body.version, series.version + 1);
    assert.equal(response.body.games[0].draft.actions.length, 20);
    const stats = (await me.get("/api/heroes/h06/scrims?minGames=1")).body;
    assert.equal(stats.picked, 1, "statistics use the corrected pick");
    assert.equal(
      (await me.get("/api/heroes/h01/scrims?minGames=1")).body.picked,
      1,
      "h01 is now only picked in game 2"
    );
    assert.equal(response.body.games[1].draft.picks.blue[0], "h01", "other games are untouched");
  });

  test("a stale version is refused (409) and invalid edits are 400 and change nothing", async () => {
    const me = app.browser();
    const series = (await me.post("/api/series/import", importBody())).body;
    assert.equal(
      (
        await me.patch(`/api/series/${series.id}/games/0/draft`, {
          ...edit(),
          expectedVersion: series.version + 7
        })
      ).status,
      409
    );
    for (const bad of [
      edit({ picks: { blue: ids(1, 5), red: ["h01", ...ids(12, 4)] } }),
      edit({ bans: { blue: ["../x"], red: [] } }),
      { bans: "x" },
      edit({ picks: { blue: ids(1, 6), red: [] } })
    ]) {
      assert.equal((await me.patch(`/api/series/${series.id}/games/0/draft`, bad)).status, 400);
    }
    assert.equal((await me.patch(`/api/series/${series.id}/games/9/draft`, edit())).status, 404);
    assert.deepEqual(
      (await me.get(`/api/series/${series.id}`)).body.games[0].draft.picks.blue,
      ids(1, 5)
    );
  });

  test("Global Ban & Pick rules apply to edits", async () => {
    const me = app.browser();
    const second = {
      ...game("Bravo", "Alpha", "Bravo"),
      draft: {
        bans: { blue: ids(21, 5), red: ids(26, 5) },
        picks: { blue: ids(16, 5), red: ids(6, 5) }
      }
    };
    const series = (
      await me.post(
        "/api/series/import",
        importBody({ gameMode: "global-ban-pick", games: [game(), second] })
      )
    ).body;
    const refused = await me.patch(
      `/api/series/${series.id}/games/1/draft`,
      edit({ picks: { blue: ids(16, 5), red: ["h01", ...ids(11, 4)] } })
    );
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /already picked this hero/);
  });

  test("an imported Global Ban & Pick series keeps the rule too: refused with the reason, nothing saved", async () => {
    const me = app.browser();
    const second = (picks, bans = { blue: ids(21, 5), red: ids(26, 5) }) => ({
      ...game("Bravo", "Alpha", "Bravo"),
      draft: { bans, picks }
    });
    const refused = await me.post(
      "/api/series/import",
      importBody({
        gameMode: "global-ban-pick",
        games: [game(), second({ blue: ids(16, 5), red: ["h01", ...ids(7, 4)] })]
      })
    );
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /Alpha already picked this hero/);
    assert.equal(
      (await me.get("/api/series")).body.items.length,
      0,
      "the refused file saved nothing"
    );
    const accepted = await me.post(
      "/api/series/import",
      importBody({
        gameMode: "global-ban-pick",
        games: [game(), second({ blue: ids(16, 5), red: ids(6, 5) })]
      })
    );
    assert.equal(accepted.status, 200, accepted.text);
  });

  test("viewers and strangers cannot edit; editors of a local series can; online: creator only", async () => {
    const owner = app.browser();
    const series = (await owner.post("/api/series/import", importBody())).body;
    const path = `/api/series/${series.id}/games/0/draft`;
    assert.equal((await app.browser().patch(path, edit())).status, 404);
    const viewer = app.browser();
    await viewer.post("/api/invites/accept", {
      token: (await owner.post(`/api/series/${series.id}/invites`, { role: "viewer" })).body.token
    });
    assert.equal((await viewer.patch(path, edit())).status, 403);
    const editor = app.browser();
    await editor.post("/api/invites/accept", {
      token: (await owner.post(`/api/series/${series.id}/invites`, { role: "editor" })).body.token
    });
    assert.equal((await editor.patch(path, edit())).status, 200);

    const a = await app.signIn("OnlineA");
    const b = await app.signIn("OnlineB");
    const room = (
      await a.browser.post("/api/online/series", {
        teamA: "Alpha",
        teamB: "Bravo",
        bestOf: 1,
        gameMode: "free-for-all"
      })
    ).body;
    await b.browser.post(`/api/online/${room.online.invitationCode}/join`);
    assert.equal((await b.browser.patch(`/api/series/${room.id}/game/draft`, edit())).status, 403);
  });

  test("the current game is editable only after its draft is over", async () => {
    const me = app.browser();
    const { body: series } = await me.post("/api/series", {
      teamA: "Live A",
      teamB: "Live B",
      bestOf: 1,
      gameMode: "free-for-all"
    });
    await me.post(`/api/series/${series.id}/game`, { blueTeam: "Live A" });
    await me.post(`/api/series/${series.id}/game/ready`);
    assert.equal((await me.patch(`/api/series/${series.id}/game/draft`, edit())).status, 400);
    for (let index = 0; index < 10; index += 1) {
      await me.post(`/api/series/${series.id}/game/action`, {
        heroId: `h${String(index + 1).padStart(2, "0")}`
      });
    }
    assert.equal(
      (await me.patch(`/api/series/${series.id}/game/draft`, edit())).status,
      400,
      "a picks-only draft has no bans to edit"
    );
    const fixed = await me.patch(
      `/api/series/${series.id}/game/draft`,
      edit({ bans: { blue: [], red: [] }, picks: { blue: ["h30", ...ids(2, 4)], red: ids(11, 5) } })
    );
    assert.equal(fixed.status, 200, fixed.text);
    assert.equal(fixed.body.currentGame.draft.picks.blue[0], "h30");
  });

  test("an edited series exports with the corrected picks", async () => {
    const me = app.browser();
    const series = (await me.post("/api/series/import", importBody())).body;
    await me.patch(
      `/api/series/${series.id}/games/0/draft`,
      edit({ picks: { blue: ["h07", ...ids(2, 4)], red: ids(11, 5) } })
    );
    const { extractFromPdf } = await import("./series-file.js");
    const cookie = [...me.jar].map(([key, value]) => `${key}=${value}`).join("; ");
    const file = await fetch(`${app.baseUrl}/api/series/${series.id}/export`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({})
    });
    assert.equal(file.status, 200);
    const envelope = await extractFromPdf(Buffer.from(await file.arrayBuffer()));
    assert.equal(envelope.series[0].games[0].draft.picks.blue[0], "h07");
  });
});
