// The daily check of the combos a player has acquired (spaced repetition): a combo that is acquired
// comes back after a day, then a little later each time the player still masters it, and goes back
// to the start when they do not. The combos that are not acquired yet are suggested besides.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import mysql from "mysql2/promise";
import { REVIEW_DAYS, REVIEW_SHOWN, TO_LEARN_SHOWN } from "../../../shared/combo-model.js";
import { firstReview, nextReview, parseReviewAnswer } from "./combo-domain.js";
import { MIGRATIONS, runMigrations } from "../../platform/database/migrations/index.js";
import { createTestDatabase, startTestServer } from "../../../testing/test-app.js";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 7, 6, 0, 0);

describe("when a combo comes back (pure)", () => {
  test("the first check is a day after it was acquired", () => {
    assert.deepEqual(firstReview(now), { box: 1, dueAt: now + DAY });
    assert.deepEqual(REVIEW_DAYS, [1, 3, 7, 14, 30]);
  });

  test("still mastered: one box further, a little later each time, and the last box stays", () => {
    let box = 1;
    const days = [];
    for (let check = 0; check < 7; check += 1) {
      const next = nextReview(box, true, now);
      days.push((next.dueAt - now) / DAY);
      box = next.box;
    }
    assert.deepEqual(days, [3, 7, 14, 30, 30, 30, 30], "3, 7, 14 then 30 days, for ever after");
    assert.equal(box, 5);
  });

  test("not mastered any more: back to the first box, to be checked tomorrow", () => {
    for (const box of [1, 2, 3, 4, 5]) {
      assert.deepEqual(
        nextReview(box, false, now),
        { box: 1, dueAt: now + DAY },
        `from box ${box}`
      );
    }
  });

  test("a box that is not one of ours is read as the first", () => {
    assert.equal(nextReview(0, true, now).box, 2);
    assert.equal(nextReview(-3, true, now).box, 2);
    assert.equal(nextReview(99, true, now).box, 5);
  });

  test("the answer is yes or no, nothing else", () => {
    assert.equal(parseReviewAnswer({ sharp: true }), true);
    assert.equal(parseReviewAnswer({ sharp: false }), false);
    for (const body of [{}, { sharp: "yes" }, { sharp: 1 }, { sharp: null }, null, []]) {
      assert.throws(
        () => parseReviewAnswer(body),
        error => error.code === "invalid_body"
      );
    }
  });
});

const app = await startTestServer();
const database = await createTestDatabase();
const legacyPool = database ? mysql.createPool({ ...database.config, connectionLimit: 3 }) : null;
after(async () => {
  await legacyPool?.end();
  await database?.drop();
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const skills = ids => ({
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
  // each test has heroes of its own: the combos written in one do not show up in another
  for (const id of ["h01", "h02", "h03", "h04", "h05", "h06", "h07", "h08"]) {
    await app.store.saveHeroDetails(id, skills(["1101", "1102"]));
  }
}
const write = async (editor, heroId, skillId, count) => {
  const ids = [];
  for (let index = 0; index < count; index += 1) {
    const saved = await editor.browser.post(`/api/combos/${heroId}`, {
      name: `${heroId} combo ${index + 1}`,
      steps: [{ skillId }]
    });
    assert.equal(saved.status, 200, saved.text);
    ids.push(saved.body.id);
  }
  return ids;
};
const scheduleOf = async (who, comboId) =>
  (
    await app.store.pool.query(
      "SELECT box, reviewed_at, due_at FROM combo_reviews WHERE user_id = ? AND combo_id = ?",
      [who.user.id, comboId]
    )
  )[0][0] ?? null;
const makeDue = (who, comboId) =>
  app.store.pool.execute("UPDATE combo_reviews SET due_at = ? WHERE user_id = ? AND combo_id = ?", [
    Date.now() - 1000,
    who.user.id,
    comboId
  ]);
const review = who => who.browser.get("/api/training/combos/review");

describe("the schedule of the combos", { skip }, () => {
  test("acquiring a combo puts it in the schedule, a second form leaves its place alone, losing both takes it out", async () => {
    const editor = await app.signIn("ReviewEditor", { admin: true });
    const ana = await app.signIn("ReviewAna");
    const [combo] = await write(editor, "h01", "1101", 1);
    const put = body => ana.browser.put(`/api/training/combos/${combo}`, body);

    assert.equal(await scheduleOf(ana, combo), null, "nothing acquired, nothing to check");
    const before = Date.now();
    await put({ normal: true });
    const first = await scheduleOf(ana, combo);
    assert.equal(first.box, 1);
    assert.ok(Number(first.due_at) >= before + DAY && Number(first.due_at) <= Date.now() + DAY);

    // the player is checked, still masters it: box 2; then the other form is acquired: still box 2
    await makeDue(ana, combo);
    await ana.browser.post(`/api/training/combos/${combo}/review`, { sharp: true });
    assert.equal((await scheduleOf(ana, combo)).box, 2);
    await put({ animationCancel: true });
    assert.equal((await scheduleOf(ana, combo)).box, 2, "a second form does not start it over");

    // one form left: still in the schedule; none: out of it
    await put({ normal: false });
    assert.equal((await scheduleOf(ana, combo)).box, 2);
    await put({ animationCancel: false });
    assert.equal(await scheduleOf(ana, combo), null, "acquired in no form: nothing to check");
    // acquired again later: it starts over in the first box
    await put({ normal: true });
    assert.equal((await scheduleOf(ana, combo)).box, 1);
  });

  test("the player is asked what is due, oldest first, and answers", async () => {
    const editor = await app.signIn("AskEditor", { admin: true });
    const ben = await app.signIn("AskBen");
    const other = await app.signIn("AskOther");
    const [first, second, third] = await write(editor, "h02", "1101", 3);
    assert.equal((await app.browser().get("/api/training/combos/review")).status, 401);
    const empty = (await review(ben)).body;
    assert.deepEqual([empty.due, empty.dueTotal], [[], 0]);

    for (const id of [first, second, third]) {
      await ben.browser.put(`/api/training/combos/${id}`, { normal: true });
    }
    assert.equal(
      (await review(ben)).body.dueTotal,
      0,
      "acquired just now: they come back tomorrow"
    );
    // the second and the first come due, the third not yet; the second has waited longer
    await app.store.pool.execute(
      "UPDATE combo_reviews SET due_at = ? WHERE user_id = ? AND combo_id = ?",
      [Date.now() - 2 * DAY, ben.user.id, second]
    );
    await makeDue(ben, first);
    const asked = (await review(ben)).body;
    assert.deepEqual(
      asked.due.map(combo => combo.id),
      [second, first],
      "the oldest due first; the one that is not due is not asked"
    );
    assert.equal(asked.dueTotal, 2);
    const row = asked.due[0];
    assert.deepEqual(
      [row.heroId, row.normal, row.animationCancel, row.box, row.steps],
      ["h02", true, false, 1, [{ skillId: "1101", hint: "" }]]
    );
    assert.deepEqual(
      asked.skills.h02.map(skill => [skill.id, skill.name]),
      [
        ["1101", "Move 1101"],
        ["1102", "Move 1102"]
      ],
      "the skills of the heroes that appear come with them, a name and a picture each"
    );

    // answering: still sharp goes one box further and leaves the list; rusty starts over
    const sharp = await ben.browser.post(`/api/training/combos/${second}/review`, { sharp: true });
    assert.equal(sharp.status, 200, sharp.text);
    assert.equal(sharp.body.box, 2);
    assert.ok(Math.abs(sharp.body.dueAt - (Date.now() + 3 * DAY)) < 60_000, "in three days");
    const rusty = await ben.browser.post(`/api/training/combos/${first}/review`, { sharp: false });
    assert.deepEqual(rusty.body.box, 1);
    assert.ok(Math.abs(rusty.body.dueAt - (Date.now() + DAY)) < 60_000, "tomorrow");
    assert.equal((await review(ben)).body.dueTotal, 0, "nothing left for today");

    // what is refused, and what is each one's own
    assert.equal(
      (await ben.browser.post(`/api/training/combos/${second}/review`, { sharp: "yes" })).status,
      400
    );
    assert.equal(
      (await other.browser.post(`/api/training/combos/${second}/review`, { sharp: true })).status,
      404,
      "not in the schedule of this player"
    );
    assert.equal(
      (await app.browser().post(`/api/training/combos/${second}/review`, { sharp: true })).status,
      401
    );
    assert.equal(
      (await ben.browser.post("/api/training/combos/not-an-id/review", { sharp: true })).status,
      400
    );
    assert.deepEqual((await review(other)).body.due, [], "another player has their own");
  });

  test("a combo that is no longer acquired is not asked, even if its schedule is still there", async () => {
    const editor = await app.signIn("StaleEditor", { admin: true });
    const cal = await app.signIn("StaleCal");
    const [combo] = await write(editor, "h03", "1101", 1);
    await cal.browser.put(`/api/training/combos/${combo}`, { normal: true });
    await makeDue(cal, combo);
    assert.equal((await review(cal)).body.dueTotal, 1);
    // a form taken back without going through the API (a stale row)
    await app.store.pool.execute(
      "UPDATE combo_progress SET normal_done = 0, cancel_done = 0 WHERE user_id = ? AND combo_id = ?",
      [cal.user.id, combo]
    );
    assert.deepEqual((await review(cal)).body.due, []);
  });

  test("at most ten are asked at once, and the total says how many wait", async () => {
    const editor = await app.signIn("ManyEditor", { admin: true });
    const dee = await app.signIn("ManyDee");
    const ids = await write(editor, "h04", "1101", REVIEW_SHOWN + 3);
    for (const id of ids) {
      await dee.browser.put(`/api/training/combos/${id}`, { normal: true });
      await makeDue(dee, id);
    }
    const asked = (await review(dee)).body;
    assert.equal(asked.due.length, REVIEW_SHOWN);
    assert.equal(asked.dueTotal, REVIEW_SHOWN + 3);
  });

  test("the combos still to learn come from the heroes the player works on and the ones their team asks for", async () => {
    const editor = await app.signIn("LearnEditor", { admin: true });
    const owner = await app.signIn("LearnOwner");
    const eli = await app.signIn("LearnEli");
    const fay = await app.signIn("LearnFay");
    const pool = await write(editor, "h05", "1101", 2);
    const asked = await write(editor, "h06", "1101", 2);
    await write(editor, "h07", "1101", 1); // a hero nobody works on or asks for
    const teamId = (
      await owner.browser.post("/api/teams", {
        name: "Learn Squad",
        tag: "LERN",
        description: "",
        region: "EU",
        timezone: "UTC+1",
        languages: ["en"],
        level: "amateur"
      })
    ).body.id;
    await app.store.pool.execute(
      "INSERT INTO team_members (team_id, user_id, role, lane, joined_at) VALUES (?, ?, 'player', '', ?)",
      [teamId, eli.user.id, Date.now()]
    );
    await owner.browser.post(`/api/teams/${teamId}/training/hero-goals`, {
      heroId: "h06",
      form: "both"
    });

    // nothing chosen, nothing asked: nothing to suggest
    assert.deepEqual((await review(fay)).body.toLearn, []);
    // the team asks for h02: its combos come first for the player of that team, not for others
    const withGoal = (await review(eli)).body;
    assert.deepEqual(
      withGoal.toLearn.map(combo => combo.id),
      asked,
      "the heroes the team asks for"
    );
    assert.deepEqual((await review(fay)).body.toLearn, [], "another player is not asked the same");
    // the player also works on h05: the team's heroes first, then their own, each in the editors' order
    await eli.browser.put("/api/training/focus", { heroIds: ["h05"] });
    await fay.browser.put("/api/training/focus", { heroIds: ["h05"] });
    const both = (await review(eli)).body;
    assert.deepEqual(
      both.toLearn.map(combo => combo.id),
      [...asked, ...pool]
    );
    assert.equal(both.toLearnTotal, 4);
    assert.deepEqual(
      (await review(fay)).body.toLearn.map(combo => combo.id),
      pool
    );
    assert.deepEqual(
      Object.keys(both.skills).sort(),
      ["h05", "h06"],
      "the skills of the heroes that appear"
    );

    // acquiring one takes it out of the list; at most five are suggested
    await eli.browser.put(`/api/training/combos/${asked[0]}`, { animationCancel: true });
    assert.deepEqual(
      (await review(eli)).body.toLearn.map(combo => combo.id),
      [asked[1], ...pool]
    );
    const crowd = await write(editor, "h05", "1102", TO_LEARN_SHOWN + 2);
    const capped = (await review(fay)).body;
    assert.equal(capped.toLearn.length, TO_LEARN_SHOWN);
    assert.equal(capped.toLearnTotal, pool.length + crowd.length);
  });

  test("the schedule goes with the player and with the combo", async () => {
    const editor = await app.signIn("GoneEditor2", { admin: true });
    const gus = await app.signIn("GoneGus");
    const [combo, other] = await write(editor, "h08", "1101", 2);
    for (const id of [combo, other]) {
      await gus.browser.put(`/api/training/combos/${id}`, { normal: true });
    }
    await editor.browser.delete(`/api/combos/h08/${combo}`);
    assert.equal(await scheduleOf(gus, combo), null, "a combo that is deleted leaves the schedule");
    assert.ok(await scheduleOf(gus, other));
    await app.store.pool.execute("DELETE FROM users WHERE id = ?", [gus.user.id]);
    const [[left]] = await app.store.pool.query(
      "SELECT COUNT(*) AS total FROM combo_reviews WHERE user_id = ?",
      [gus.user.id]
    );
    assert.equal(Number(left.total), 0, "an account that is deleted takes its schedule with it");
  });
});

describe("the schedule of what was acquired before it existed", { skip }, () => {
  test("the migration puts every combo acquired in some form in the schedule, a day after it was ticked", async () => {
    // a database as it was before this migration: everything up to the one before it
    const before = MIGRATIONS.filter(migration => migration.version < 25);
    await runMigrations(legacyPool, before);
    const now = Date.now();
    await legacyPool.query(
      "INSERT INTO users (id, google_subject, email, name, picture, created_at, updated_at) VALUES ('ux', 'sx', 'x@x.io', 'X', '', ?, ?)",
      ["2026-09-30T10:00:00.000Z", "2026-09-30T10:00:00.000Z"]
    );
    await legacyPool.query(
      "INSERT INTO heroes (id, name, image, roles_json, lanes_json, source_ids_json, available_global, source_updated, updated_at) VALUES ('h01', 'Hero', '', '[]', '[]', '[]', TRUE, '20260930', '2026-09-30')"
    );
    const heroId = "h01";
    for (const id of [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333"
    ]) {
      await legacyPool.query(
        "INSERT INTO hero_combos (id, hero_id, position, name, note, steps_json, created_at, updated_at) VALUES (?, ?, 0, 'c', '', '[]', ?, ?)",
        [id, heroId, now, now]
      );
    }
    await legacyPool.query(
      "INSERT INTO combo_progress (user_id, combo_id, normal_done, cancel_done, updated_at) VALUES ('ux', '11111111-1111-4111-8111-111111111111', 1, 0, ?), ('ux', '22222222-2222-4222-8222-222222222222', 0, 1, ?), ('ux', '33333333-3333-4333-8333-333333333333', 0, 0, ?)",
      [now - 5 * DAY, now - 2 * DAY, now]
    );

    const applied = await runMigrations(legacyPool);
    assert.ok(applied.includes(25));
    const [rows] = await legacyPool.query(
      "SELECT combo_id, box, reviewed_at, due_at FROM combo_reviews ORDER BY combo_id"
    );
    assert.deepEqual(
      rows.map(row => [
        row.combo_id.slice(0, 2),
        row.box,
        Number(row.due_at) - Number(row.reviewed_at)
      ]),
      [
        ["11", 1, DAY],
        ["22", 1, DAY]
      ],
      "the two that are acquired, not the third"
    );
    assert.equal(Number(rows[0].reviewed_at), now - 5 * DAY, "from the day it was ticked");
    // running everything again changes nothing
    assert.deepEqual(await runMigrations(legacyPool), []);
  });
});
