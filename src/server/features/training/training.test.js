// Training: focus heroes, private notebook, maps and prepared situations (administrators), answers.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { parseFocus, parseNote, parseScenario } from "./training-domain.js";
import sharp from "../../platform/images/sharp-safe.js";
import { startTestServer } from "../../../testing/test-app.js";

const known = new Set([
  "h01",
  "h02",
  "h03",
  "h04",
  "h05",
  "h06",
  "h07",
  "h08",
  "h09",
  "h10",
  "h11",
  "h12"
]);
const maps = new Set(["map-1"]);
const hero = (id, side, extra = {}) => ({
  id: `p${id}`,
  type: "hero",
  heroId: id,
  side,
  x: 0.5,
  y: 0.5,
  ...extra
});
const scenarioBody = (extra = {}) => ({
  mapId: "map-1",
  title: "Dragon fight",
  brief: "Two minutes to the objective.",
  published: true,
  pins: [
    hero("h01", "blue"),
    hero("h02", "red", { dead: true }),
    { id: "c1", type: "camp", label: "Red buff", side: "blue", x: 0.2, y: 0.8 }
  ],
  ...extra
});

describe("training validation (pure)", () => {
  test("the focus heroes are known Global heroes, once each, at most 30", () => {
    assert.deepEqual(parseFocus({ heroIds: ["h02", "h01"] }, known), ["h02", "h01"]);
    assert.throws(() => parseFocus({ heroIds: ["h01", "h01"] }, known), /once/);
    assert.throws(() => parseFocus({ heroIds: ["nope"] }, known), /Unknown hero/);
    assert.throws(
      () => parseFocus({ heroIds: Array.from({ length: 31 }, (_, i) => `x${i}`) }, known),
      /at most/
    );
    assert.throws(() => parseFocus({}, known));
  });

  test("a note: title required, a combo needs a hero and steps, only a combo has steps", () => {
    const goal = parseNote(
      { kind: "goal", title: "  Last-hit under tower ", body: "10 min a day" },
      known
    );
    assert.deepEqual(
      [goal.title, goal.status, goal.heroId, goal.steps],
      ["Last-hit under tower", "todo", null, []]
    );
    assert.throws(() => parseNote({ kind: "goal", title: "" }, known), /required/);
    assert.throws(
      () => parseNote({ kind: "combo", title: "x", steps: [{ skillId: "s1" }] }, known),
      /belongs to a hero/
    );
    assert.throws(
      () => parseNote({ kind: "combo", heroId: "h01", title: "x", steps: [] }, known),
      /at least one step/
    );
    assert.throws(
      () => parseNote({ kind: "mechanic", title: "x", steps: [{ skillId: "s1" }] }, known),
      /Only a combo/
    );
    assert.throws(
      () =>
        parseNote(
          {
            kind: "combo",
            heroId: "h01",
            title: "x",
            steps: Array.from({ length: 13 }, () => ({ skillId: "s1" }))
          },
          known
        ),
      /at most/
    );
    assert.throws(
      () =>
        parseNote(
          { kind: "combo", heroId: "h01", title: "x", steps: [{ skillId: "../x" }] },
          known
        ),
      /needs a skill/
    );
    assert.throws(
      () => parseNote({ kind: "goal", title: "<b>x</b>" }, known),
      /control characters/
    );
    assert.throws(() => parseNote({ kind: "goal", title: "x", status: "done" }, known), /status/);
    const combo = parseNote(
      {
        kind: "combo",
        heroId: "h01",
        title: "Burst",
        steps: [{ skillId: "1101", hint: "dash first" }, { skillId: "1102" }]
      },
      known
    );
    assert.deepEqual(combo.steps, [
      { skillId: "1101", hint: "dash first" },
      { skillId: "1102", hint: "" }
    ]);
    const woven = parseNote(
      {
        kind: "combo",
        heroId: "h01",
        title: "Auto",
        steps: [{ skillId: "1101" }, { skillId: "basic" }]
      },
      known
    );
    assert.deepEqual(
      woven.steps.map(step => step.skillId),
      ["1101", "basic"],
      "the basic attack is a step of a personal combo too"
    );
  });

  test("a situation: positions are shares of the map, at most 5 heroes a side, hero pins carry a side and may be dead", () => {
    const parsed = parseScenario(scenarioBody(), { knownHeroIds: known, knownMapIds: maps });
    assert.equal(parsed.pins.length, 3);
    assert.equal(parsed.pins[1].dead, true);
    assert.equal(parsed.pins[2].label, "Red buff");
    const check = body =>
      assert.throws(() => parseScenario(body, { knownHeroIds: known, knownMapIds: maps }));
    check(scenarioBody({ mapId: "other" }));
    check(scenarioBody({ pins: [hero("h01", "blue", { x: 1.2 })] }));
    check(scenarioBody({ pins: [hero("h01", "green")] }));
    check(scenarioBody({ pins: [hero("nope", "blue")] }));
    check(scenarioBody({ pins: [hero("h01", "blue"), { ...hero("h01", "blue"), id: "again" }] }));
    check(
      scenarioBody({ pins: ["h01", "h02", "h03", "h04", "h05", "h06"].map(id => hero(id, "blue")) })
    );
    check(scenarioBody({ pins: [{ id: "a", type: "dragon", x: 0.1, y: 0.1 }] }));
    check(
      scenarioBody({
        pins: Array.from({ length: 81 }, (_, i) => ({ id: `t${i}`, type: "tower", x: 0.1, y: 0.1 }))
      })
    );
    // the same hero may be on both sides (a mirror), but only once per side
    assert.equal(
      parseScenario(
        scenarioBody({ pins: [hero("h01", "blue"), hero("h01", "red", { id: "q" })] }),
        { knownHeroIds: known, knownMapIds: maps }
      ).pins.length,
      2
    );
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";
const picture = () =>
  sharp({ create: { width: 400, height: 300, channels: 3, background: "#224466" } })
    .png()
    .toBuffer();
const upload = (user, name, body, type = "image/png") =>
  fetch(`${app.baseUrl}/api/training/maps?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: {
      "content-type": type,
      cookie: user ? `hok_session=${user.browser.jar.get("hok_session")}` : ""
    },
    body
  });

describe("training over HTTP", { skip }, () => {
  test("the focus heroes belong to the signed-in player", async () => {
    const a = await app.signIn("TrainA");
    const b = await app.signIn("TrainB");
    assert.equal((await app.browser().get("/api/training/focus")).status, 401);
    assert.equal(
      (await a.browser.put("/api/training/focus", { heroIds: ["h03", "h01"] })).status,
      200
    );
    assert.deepEqual(
      (await a.browser.get("/api/training/focus")).body.heroIds,
      ["h03", "h01"],
      "the order is kept"
    );
    assert.deepEqual(
      (await b.browser.get("/api/training/focus")).body.heroIds,
      [],
      "nobody else sees it"
    );
    assert.equal((await a.browser.put("/api/training/focus", { heroIds: ["nope"] })).status, 400);
    assert.deepEqual(
      (await a.browser.get("/api/training/focus")).body.heroIds,
      ["h03", "h01"],
      "a refused change changes nothing"
    );
    assert.equal((await a.browser.put("/api/training/focus", { heroIds: [] })).status, 200);
  });

  test("the notebook is private: other players cannot read, change or delete a note", async () => {
    const a = await app.signIn("NoteA");
    const b = await app.signIn("NoteB");
    const goal = await a.browser.post("/api/training/notes", {
      kind: "goal",
      title: "Wave control",
      body: "Freeze the wave at 4:00",
      heroId: "h02"
    });
    assert.equal(goal.status, 200, goal.text);
    const combo = await a.browser.post("/api/training/notes", {
      kind: "combo",
      heroId: "h01",
      title: "Burst",
      steps: [{ skillId: "1101", hint: "dash" }, { skillId: "1103" }]
    });
    assert.equal(combo.status, 200, combo.text);
    assert.deepEqual(
      combo.body.steps.map(step => step.skillId),
      ["1101", "1103"]
    );
    assert.equal((await a.browser.get("/api/training/notes")).body.notes.length, 2);
    assert.equal((await a.browser.get("/api/training/notes?kind=combo")).body.notes.length, 1);
    assert.equal((await a.browser.get("/api/training/notes?heroId=h02")).body.notes.length, 1);
    assert.deepEqual((await b.browser.get("/api/training/notes")).body.notes, []);
    const id = goal.body.id;
    assert.equal(
      (await b.browser.put(`/api/training/notes/${id}`, { kind: "goal", title: "Mine now" }))
        .status,
      404
    );
    assert.equal((await b.browser.delete(`/api/training/notes/${id}`)).status, 404);
    const moved = await a.browser.put(`/api/training/notes/${id}`, {
      kind: "goal",
      title: "Wave control",
      status: "mastered",
      heroId: "h02"
    });
    assert.equal(moved.body.status, "mastered");
    assert.equal(
      (
        await a.browser.post("/api/training/notes", {
          kind: "combo",
          title: "No hero",
          steps: [{ skillId: "1" }]
        })
      ).status,
      400
    );
    assert.equal((await a.browser.delete(`/api/training/notes/${id}`)).status, 200);
    assert.equal((await a.browser.get("/api/training/notes")).body.notes.length, 1);
  });

  test("maps: administrators upload (re-encoded to WebP), everybody reads the picture, a map in use cannot be deleted", async () => {
    const admin = await app.signIn("MapAdmin", { admin: true });
    const player = await app.signIn("MapPlayer");
    const png = await picture();
    assert.equal((await upload(null, "Summoner map", png)).status, 401);
    assert.equal((await upload(player, "Summoner map", png)).status, 403);
    assert.equal((await upload(admin, "Summoner map", Buffer.from("not an image"))).status, 400);
    assert.equal((await upload(admin, "Summoner map", png, "text/html")).status >= 400, true);
    assert.equal((await upload(admin, "", png)).status, 400, "a map needs a name");
    const saved = await upload(admin, "Summoner map", png);
    assert.equal(saved.status, 200);
    const map = await saved.json();
    assert.deepEqual([map.name, map.width, map.height], ["Summoner map", 400, 300]);
    const served = await fetch(`${app.baseUrl}/training-maps/${map.id}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), "image/webp");
    assert.equal((await fetch(`${app.baseUrl}/training-maps/not-an-id`)).status, 404);
    assert.ok(
      (await app.browser().get("/api/training/maps")).body.maps.some(item => item.id === map.id),
      "anybody can list the maps"
    );

    const scenario = await admin.browser.post(
      "/api/training/scenarios",
      scenarioBody({ mapId: map.id })
    );
    assert.equal(scenario.status, 200, scenario.text);
    assert.equal(
      (await admin.browser.delete(`/api/training/maps/${map.id}`)).status,
      409,
      "a situation still uses it"
    );
    assert.equal((await player.browser.delete(`/api/training/maps/${map.id}`)).status, 403);
    await admin.browser.delete(`/api/training/scenarios/${scenario.body.id}`);
    assert.equal((await admin.browser.delete(`/api/training/maps/${map.id}`)).status, 200);
    assert.equal((await fetch(`${app.baseUrl}/training-maps/${map.id}`)).status, 404);
  });

  test("situations: administrators write them, drafts stay hidden, everybody reads the published ones, answers are private", async () => {
    const admin = await app.signIn("SceneAdmin", { admin: true });
    const a = await app.signIn("SceneA");
    const b = await app.signIn("SceneB");
    const map = await (await upload(admin, "Map", await picture())).json();
    const body = (extra = {}) => scenarioBody({ mapId: map.id, ...extra });

    assert.equal((await a.browser.post("/api/training/scenarios", body())).status, 403);
    assert.equal(
      (await admin.browser.post("/api/training/scenarios", body({ pins: [hero("nope", "blue")] })))
        .status,
      400
    );
    const draft = (await admin.browser.post("/api/training/scenarios", body({ published: false })))
      .body;
    assert.equal(draft.published, false);
    assert.equal(draft.pins.length, 3);
    assert.equal(
      (await a.browser.get("/api/training/scenarios")).body.scenarios.some(
        item => item.id === draft.id
      ),
      false,
      "a draft is not listed for players"
    );
    assert.equal((await a.browser.get(`/api/training/scenarios/${draft.id}`)).status, 404);
    assert.equal(
      (await a.browser.put(`/api/training/scenarios/${draft.id}/answer`, { answer: "x" })).status,
      404,
      "nor can it be answered"
    );
    assert.equal(
      (await admin.browser.get("/api/training/scenarios")).body.scenarios.some(
        item => item.id === draft.id
      ),
      true,
      "administrators see drafts"
    );

    const published = await admin.browser.put(
      `/api/training/scenarios/${draft.id}`,
      body({
        title: "Dragon fight v2",
        published: true,
        pins: [hero("h01", "blue", { dead: true }), hero("h05", "red")]
      })
    );
    assert.equal(published.status, 200, published.text);
    const seen = await app.browser().get(`/api/training/scenarios/${draft.id}`);
    assert.equal(seen.status, 200, "visitors read published situations");
    assert.equal(seen.body.title, "Dragon fight v2");
    assert.deepEqual(
      seen.body.pins.map(pin => [pin.heroId, pin.side, pin.dead]),
      [
        ["h01", "blue", true],
        ["h05", "red", false]
      ]
    );
    assert.equal(seen.body.answer, null);

    assert.equal(
      (await app.browser().put(`/api/training/scenarios/${draft.id}/answer`, { answer: "x" }))
        .status,
      401
    );
    assert.equal(
      (await a.browser.put(`/api/training/scenarios/${draft.id}/answer`, { answer: "" })).status,
      400
    );
    assert.equal(
      (
        await a.browser.put(`/api/training/scenarios/${draft.id}/answer`, {
          answer: "Bait the dragon, then flank."
        })
      ).status,
      200
    );
    assert.equal(
      (
        await a.browser.put(`/api/training/scenarios/${draft.id}/answer`, {
          answer: "Bait, flank, then reset."
        })
      ).status,
      200,
      "an answer can be rewritten"
    );
    assert.equal(
      (await a.browser.get(`/api/training/scenarios/${draft.id}`)).body.answer.answer,
      "Bait, flank, then reset."
    );
    assert.equal(
      (await b.browser.get(`/api/training/scenarios/${draft.id}`)).body.answer,
      null,
      "answers are private"
    );

    assert.equal((await a.browser.delete(`/api/training/scenarios/${draft.id}`)).status, 403);
    assert.equal((await admin.browser.delete(`/api/training/scenarios/${draft.id}`)).status, 200);
    assert.equal((await app.browser().get(`/api/training/scenarios/${draft.id}`)).status, 404);
  });
});
