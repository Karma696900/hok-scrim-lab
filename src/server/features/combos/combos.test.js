// The combos of the heroes: the editors write them (as many as they want, each one a few skills of
// the hero with a hint), everybody reads them on the page of the hero, and each signed-in player says
// which ones they have acquired, in two forms: as they are and with the animation cancelled.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { parseCombo, parseOrder, parseProgress, COMBOS_PER_HERO_MAX } from "./combo-domain.js";
import { BASIC_ATTACK_ID, COMBO_STEPS_MAX } from "../../../shared/combo-model.js";
import { startTestServer } from "../../../testing/test-app.js";

const skills = new Set(["1101", "1102", "1103", "1104"]);

describe("a combo (pure)", () => {
  test("a name, a note and one to twelve steps, each a skill of the hero with a hint", () => {
    assert.deepEqual(
      parseCombo(
        {
          name: "  Burst  ",
          note: "After the first hit.",
          steps: [{ skillId: "1101", hint: " dash " }, { skillId: "1103" }]
        },
        skills
      ),
      {
        name: "Burst",
        note: "After the first hit.",
        steps: [
          { skillId: "1101", hint: "dash" },
          { skillId: "1103", hint: "" }
        ]
      }
    );
    const one = parseCombo({ name: "Poke", steps: [{ skillId: "1104" }] }, skills);
    assert.equal(one.note, "", "the note is optional");
    assert.equal(
      parseCombo(
        {
          name: "Long",
          steps: Array.from({ length: COMBO_STEPS_MAX }, () => ({ skillId: "1101" }))
        },
        skills
      ).steps.length,
      COMBO_STEPS_MAX,
      "a skill may come several times"
    );
  });

  test("the basic attack is a step like a skill, for every hero, between two skills or alone", () => {
    const combo = parseCombo(
      {
        name: "Auto weave",
        steps: [
          { skillId: "1101" },
          { skillId: BASIC_ATTACK_ID, hint: " then " },
          { skillId: "1102" },
          { skillId: BASIC_ATTACK_ID }
        ]
      },
      skills
    );
    assert.deepEqual(
      combo.steps.map(step => step.skillId),
      ["1101", "basic", "1102", "basic"]
    );
    assert.equal(combo.steps[1].hint, "then");
    assert.equal(
      parseCombo({ name: "Just hit", steps: [{ skillId: "basic" }] }, new Set()).steps.length,
      1,
      "a hero whose skills are not known yet still has its basic attack"
    );
    assert.throws(
      () => parseCombo({ name: "a", steps: [{ skillId: "Basic" }] }, skills),
      /needs a skill/,
      "only the exact id is the basic attack"
    );
  });

  test("refused: no name, no step, too many steps, a skill the hero does not have", () => {
    const step = { skillId: "1101" };
    for (const [label, body, message] of [
      ["no name", { steps: [step] }, /name/],
      ["a blank name", { name: "   ", steps: [step] }, /name/],
      ["a name too long", { name: "x".repeat(81), steps: [step] }, /name/],
      ["a note too long", { name: "a", note: "x".repeat(501), steps: [step] }, /note/],
      ["no steps", { name: "a" }, /at most/],
      ["an empty list of steps", { name: "a", steps: [] }, /at least one/],
      [
        "too many steps",
        { name: "a", steps: Array.from({ length: COMBO_STEPS_MAX + 1 }, () => step) },
        /at most/
      ],
      ["a skill of another hero", { name: "a", steps: [{ skillId: "9999" }] }, /needs a skill/],
      ["a skill that is not an id", { name: "a", steps: [{ skillId: "../x" }] }, /needs a skill/],
      ["a step that is not an object", { name: "a", steps: ["1101"] }, /steps\[0\]/],
      ["a hint too long", { name: "a", steps: [{ skillId: "1101", hint: "x".repeat(61) }] }, /hint/]
    ]) {
      assert.throws(() => parseCombo(body, skills), message, label);
    }
    assert.throws(() => parseCombo(null, skills), /JSON object/);
    assert.throws(() => parseCombo([], skills), /JSON object/);
  });

  test("an order lists every combo of the hero once", () => {
    const current = ["a", "b", "c"];
    assert.deepEqual(parseOrder({ ids: ["c", "a", "b"] }, current), ["c", "a", "b"]);
    for (const ids of [["a", "b"], ["a", "b", "b"], ["a", "b", "x"], ["a", "b", "c", "d"], "abc"]) {
      assert.throws(() => parseOrder({ ids }, current), /every combo/, JSON.stringify(ids));
    }
    assert.throws(() => parseOrder({}, current), /every combo/);
  });

  test("progress says which form is acquired; the other one is left alone", () => {
    assert.deepEqual(parseProgress({ normal: true }), { normal: true, animationCancel: undefined });
    assert.deepEqual(parseProgress({ animationCancel: false }), {
      normal: undefined,
      animationCancel: false
    });
    assert.deepEqual(parseProgress({ normal: true, animationCancel: true }), {
      normal: true,
      animationCancel: true
    });
    assert.throws(() => parseProgress({}), /which form/);
    assert.throws(() => parseProgress({ normal: "yes" }), /true or false/);
    assert.throws(() => parseProgress({ animationCancel: 1 }), /true or false/);
    assert.ok(COMBOS_PER_HERO_MAX > 100, "no limit a person would meet");
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const sheet = ids => ({
  skills: ids.map((id, index) => ({
    id,
    index: index + 1,
    type: "skill",
    label: `Skill ${index + 1}`,
    name: `Move ${id}`,
    icon: null,
    description: [{ t: "A move.", c: null }],
    cost: null,
    cooldownSeconds: 5,
    tags: [],
    video: null
  }))
});
if (app) {
  await app.store.saveHeroDetails("h01", sheet(["1101", "1102", "1103", "1104"]));
  await app.store.saveHeroDetails("h02", sheet(["2101", "2102"]));
}

const combo = (name, ...ids) => ({ name, steps: ids.map(skillId => ({ skillId })) });
const combosOf = async (browser, heroId = "h01") =>
  (await browser.get(`/api/heroes/${heroId}`)).body.combos;

describe("combos over HTTP", { skip }, () => {
  test("the editors write them, everybody reads them on the page of the hero", async () => {
    const admin = await app.signIn("ComboChief", { admin: true });
    const helper = await app.signIn("ComboHelper");
    const person = await app.signIn("ComboPerson");
    await admin.browser.put(`/api/admin/players/${helper.user.tag}/labels`, {
      labels: ["contributor"]
    });
    const body = { ...combo("Burst", "1101", "1103"), note: "Dash in, then hit." };

    // who may write
    assert.equal((await app.browser().post("/api/combos/h01", body)).status, 401, "no session");
    assert.equal((await person.browser.post("/api/combos/h01", body)).status, 403);
    assert.equal((await person.browser.put("/api/combos/h01/order", { ids: [] })).status, 403);
    const first = await admin.browser.post("/api/combos/h01", body);
    assert.equal(first.status, 200, first.text);
    assert.deepEqual(
      [first.body.heroId, first.body.name, first.body.note, first.body.position],
      ["h01", "Burst", "Dash in, then hit.", 0]
    );
    const second = await helper.browser.post("/api/combos/h01", combo("Poke", "1102"));
    assert.equal(second.status, 200, "a Contributor writes too");
    assert.equal(second.body.position, 1);
    const [[row]] = await app.store.pool.query("SELECT updated_by FROM hero_combos WHERE id = ?", [
      second.body.id
    ]);
    assert.equal(row.updated_by, helper.user.id, "the combo says who wrote it");

    // who reads: everybody, without a session, in the order of the editors
    for (const browser of [app.browser(), person.browser, helper.browser]) {
      const listed = await combosOf(browser);
      assert.deepEqual(
        listed.map(entry => entry.name),
        ["Burst", "Poke"]
      );
      assert.deepEqual(
        listed[0].steps,
        [
          { skillId: "1101", hint: "" },
          { skillId: "1103", hint: "" }
        ],
        "the steps are the skills of the hero sheet"
      );
    }
    assert.deepEqual(await combosOf(app.browser(), "h02"), [], "another hero has its own");

    // the editors see how many each hero has; nobody else needs it
    assert.deepEqual((await helper.browser.get("/api/combos")).body.counts, { h01: 2 });
    assert.equal((await person.browser.get("/api/combos")).status, 403);
    assert.equal((await app.browser().get("/api/combos")).status, 401);

    // change, then delete
    const changed = await helper.browser.put(`/api/combos/h01/${first.body.id}`, {
      name: "Burst 2",
      note: "",
      steps: [{ skillId: "1104", hint: "last" }]
    });
    assert.equal(changed.status, 200, changed.text);
    assert.deepEqual(
      (await combosOf(app.browser())).map(entry => [entry.name, entry.steps.length]),
      [
        ["Burst 2", 1],
        ["Poke", 1]
      ],
      "the place of a combo does not change when it is edited"
    );
    assert.equal((await person.browser.delete(`/api/combos/h01/${first.body.id}`)).status, 403);
    assert.equal((await helper.browser.delete(`/api/combos/h01/${first.body.id}`)).status, 200);
    assert.equal(
      (await helper.browser.delete(`/api/combos/h01/${first.body.id}`)).status,
      404,
      "already gone"
    );
    assert.deepEqual(
      (await combosOf(app.browser())).map(entry => entry.name),
      ["Poke"]
    );

    // the label taken away closes the door
    await admin.browser.put(`/api/admin/players/${helper.user.tag}/labels`, { labels: [] });
    assert.equal((await helper.browser.post("/api/combos/h01", combo("Late", "1101"))).status, 403);
  });

  test("a combo is checked as the notebook ones are, against the skills of the hero", async () => {
    const admin = await app.signIn("ComboChecker", { admin: true });
    const post = (heroId, body) => admin.browser.post(`/api/combos/${heroId}`, body);
    assert.equal((await post("h01", combo("Ghost", "9999"))).status, 400, "not a skill of h01");
    assert.equal(
      (await post("h01", combo("Borrowed", "2101"))).status,
      400,
      "a skill of another hero"
    );
    assert.equal((await post("h01", { name: "Empty", steps: [] })).status, 400);
    assert.equal((await post("h01", { steps: [{ skillId: "1101" }] })).status, 400, "no name");
    assert.equal(
      (await post("h03", combo("No sheet", "1101"))).status,
      400,
      "the skills of h03 have not been fetched, nothing to check against"
    );
    assert.equal((await post("h77", combo("Nobody", "1101"))).status, 404, "unknown hero");
    assert.equal((await post("../x", combo("Path", "1101"))).status, 404);
    const mine = await post("h02", combo("Mine", "2101", "2102"));
    assert.equal(mine.status, 200, mine.text);
    assert.equal(
      (await admin.browser.put(`/api/combos/h01/${mine.body.id}`, combo("Moved", "1101"))).status,
      404,
      "a combo is edited through its own hero"
    );
    assert.equal((await admin.browser.delete(`/api/combos/h01/${mine.body.id}`)).status, 404);
    assert.equal(
      (await admin.browser.put("/api/combos/h02/not-an-id", combo("Bad", "2101"))).status,
      400
    );
    assert.deepEqual(
      (await combosOf(app.browser(), "h02")).map(entry => entry.name),
      ["Mine"]
    );
  });

  test("no limit a person would meet, and the editors choose the order", async () => {
    const admin = await app.signIn("ComboOrder", { admin: true });
    const person = await app.signIn("ComboWatcher");
    const created = [];
    for (let index = 0; index < 25; index += 1) {
      const saved = await admin.browser.post(
        "/api/combos/h02",
        combo(`Combo ${index}`, index % 2 ? "2101" : "2102")
      );
      assert.equal(saved.status, 200, saved.text);
      created.push(saved.body.id);
    }
    const before = await combosOf(person.browser, "h02");
    assert.ok(before.length >= 25, "far more than the twelve steps of one combo");
    const names = before.map(entry => entry.name);
    assert.deepEqual(
      names.filter(name => name.startsWith("Combo ")),
      Array.from({ length: 25 }, (_, index) => `Combo ${index}`),
      "in the order they were written"
    );

    const everyId = before.map(entry => entry.id);
    const reversed = [...everyId].reverse();
    assert.equal(
      (await person.browser.put("/api/combos/h02/order", { ids: reversed })).status,
      403
    );
    const moved = await admin.browser.put("/api/combos/h02/order", { ids: reversed });
    assert.equal(moved.status, 200, moved.text);
    assert.deepEqual(
      moved.body.combos.map(entry => entry.id),
      reversed,
      "the answer is the new order"
    );
    assert.deepEqual(
      (await combosOf(person.browser, "h02")).map(entry => entry.id),
      reversed,
      "and everybody reads it"
    );

    for (const [label, ids] of [
      ["one missing", reversed.slice(1)],
      ["one twice", [...reversed.slice(1), reversed[1]]],
      ["a stranger", [...reversed.slice(1), "00000000-0000-4000-8000-000000000000"]],
      ["an id that is not a combo", [...reversed.slice(1), `${created[0]}x`]]
    ]) {
      assert.equal((await admin.browser.put("/api/combos/h02/order", { ids })).status, 400, label);
    }
    assert.deepEqual(
      (await combosOf(person.browser, "h02")).map(entry => entry.id),
      reversed,
      "a refused order changes nothing"
    );
    // a new combo goes to the end
    const added = await admin.browser.post("/api/combos/h02", combo("Last", "2101"));
    const after = await combosOf(person.browser, "h02");
    assert.equal(after.at(-1).id, added.body.id);
  });

  test("a player validates a combo in two forms, normal and animation cancel, alone", async () => {
    const admin = await app.signIn("ComboAuthor", { admin: true });
    const ana = await app.signIn("ComboAna");
    const ben = await app.signIn("ComboBen");
    const saved = await admin.browser.post("/api/combos/h01", combo("Practice", "1101", "1102"));
    const other = await admin.browser.post("/api/combos/h02", combo("Elsewhere", "2101"));
    const id = saved.body.id;
    const put = (who, body, target = id) => who.browser.put(`/api/training/combos/${target}`, body);

    assert.equal(
      (await app.browser().put(`/api/training/combos/${id}`, { normal: true })).status,
      401
    );
    assert.equal((await app.browser().get("/api/training/combos")).status, 401);
    assert.deepEqual((await ana.browser.get("/api/training/combos")).body.progress, {});

    // two forms, each on its own
    assert.deepEqual((await put(ana, { normal: true })).body, {
      normal: true,
      animationCancel: false
    });
    assert.deepEqual((await put(ana, { animationCancel: true })).body, {
      normal: true,
      animationCancel: true
    });
    assert.deepEqual((await put(ana, { normal: false })).body, {
      normal: false,
      animationCancel: true
    });
    assert.deepEqual((await put(ana, { normal: true, animationCancel: false })).body, {
      normal: true,
      animationCancel: false
    });
    assert.deepEqual((await put(ana, { normal: true })).body, {
      normal: true,
      animationCancel: false
    });

    // refused
    assert.equal((await put(ana, {})).status, 400, "no form said");
    assert.equal((await put(ana, { normal: "yes" })).status, 400);
    assert.equal((await put(ana, { normal: true }, "not-an-id")).status, 400);
    assert.equal(
      (await put(ana, { normal: true }, "00000000-0000-4000-8000-000000000000")).status,
      404
    );

    // each player has their own
    assert.deepEqual((await ben.browser.get("/api/training/combos")).body.progress, {});
    await put(ben, { animationCancel: true });
    await put(ana, { normal: true }, other.body.id);
    assert.deepEqual((await ben.browser.get("/api/training/combos")).body.progress, {
      [id]: { normal: false, animationCancel: true }
    });
    assert.deepEqual((await ana.browser.get("/api/training/combos")).body.progress, {
      [id]: { normal: true, animationCancel: false },
      [other.body.id]: { normal: true, animationCancel: false }
    });
    assert.deepEqual(
      (await ana.browser.get("/api/training/combos?heroId=h01")).body.progress,
      { [id]: { normal: true, animationCancel: false } },
      "the combos of one hero"
    );
    assert.deepEqual(
      (await ana.browser.get("/api/training/combos?heroId=../x")).body.progress,
      (await ana.browser.get("/api/training/combos")).body.progress,
      "a hero that is not an id is no filter"
    );

    // the combo goes, what was acquired goes with it
    assert.equal((await admin.browser.delete(`/api/combos/h01/${id}`)).status, 200);
    const [[count]] = await app.store.pool.query(
      "SELECT COUNT(*) AS total FROM combo_progress WHERE combo_id = ?",
      [id]
    );
    assert.equal(Number(count.total), 0);
    assert.deepEqual((await ben.browser.get("/api/training/combos")).body.progress, {});
  });
});
