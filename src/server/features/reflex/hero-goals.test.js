// What a team asks for a hero: its combos acquired (in one form, or in both), by every player who is
// asked to train. The staff sets it and follows each player; a player is followed on their own.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { parseHeroGoal } from "./reflex-domain.js";
import { startTestServer } from "../../../testing/test-app.js";

const refuses = (build, code = "invalid_body") =>
  assert.throws(build, error => error.code === code);

describe("a goal about a hero (pure)", () => {
  const known = new Set(["h01", "h02"]);
  test("a hero of the roster and the form its combos must be acquired in", () => {
    assert.deepEqual(parseHeroGoal({ heroId: "h01", form: "both" }, known), {
      heroId: "h01",
      form: "both"
    });
    for (const form of ["normal", "animationCancel", "both"]) {
      assert.equal(parseHeroGoal({ heroId: "h02", form }, known).form, form);
    }
    refuses(() => parseHeroGoal({ heroId: "h99", form: "normal" }, known));
    refuses(() => parseHeroGoal({ heroId: 7, form: "normal" }, known));
    refuses(() => parseHeroGoal({ heroId: "h01", form: "slow" }, known));
    refuses(() => parseHeroGoal({ heroId: "h01" }, known));
    refuses(() => parseHeroGoal(null, known));
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const team = (overrides = {}) => ({
  name: "Goal Squad",
  tag: "GOAL",
  description: "",
  region: "EU",
  timezone: "UTC+1",
  languages: ["en"],
  level: "amateur",
  ...overrides
});
const addMember = (teamId, user, role) =>
  app.store.pool.execute(
    "INSERT INTO team_members (team_id, user_id, role, lane, joined_at) VALUES (?, ?, ?, '', ?)",
    [teamId, user.user.id, role, Date.now()]
  );
const skillSheet = ids => ({
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
  await app.store.saveHeroDetails("h01", skillSheet(["1101", "1102"]));
  await app.store.saveHeroDetails("h02", skillSheet(["2101"]));
  await app.store.saveHeroDetails("h03", skillSheet(["3101"]));
}
/** Combos written by an editor: `count` for the hero, each one step long. */
async function writeCombos(editor, heroId, skillId, count) {
  const ids = [];
  for (let index = 0; index < count; index += 1) {
    const saved = await editor.browser.post(`/api/combos/${heroId}`, {
      name: `Combo ${index + 1}`,
      steps: [{ skillId }]
    });
    assert.equal(saved.status, 200, saved.text);
    ids.push(saved.body.id);
  }
  return ids;
}

describe("hero goals over HTTP", { skip }, () => {
  test("the staff asks for the combos of a hero; each player is followed on their own", async () => {
    const editor = await app.signIn("GoalEditor", { admin: true });
    const owner = await app.signIn("GoalOwner");
    const coach = await app.signIn("GoalCoach");
    const ana = await app.signIn("GoalAna");
    const ben = await app.signIn("GoalBen");
    const analyst = await app.signIn("GoalAnalyst");
    const stranger = await app.signIn("GoalStranger");
    const teamId = (await owner.browser.post("/api/teams", team())).body.id;
    await addMember(teamId, coach, "coach");
    await addMember(teamId, ana, "player");
    await addMember(teamId, ben, "captain");
    await addMember(teamId, analyst, "analyst");
    const combos = await writeCombos(editor, "h01", "1101", 3);
    await writeCombos(editor, "h02", "2101", 1);
    const goals = `/api/teams/${teamId}/training/hero-goals`;
    const training = who => who.browser.get(`/api/teams/${teamId}/training`);

    // who may ask, and what may be asked
    for (const who of [ana, ben, stranger]) {
      assert.equal((await who.browser.post(goals, { heroId: "h01", form: "both" })).status, 403);
    }
    assert.equal((await app.browser().post(goals, { heroId: "h01", form: "both" })).status, 401);
    assert.equal(
      (await coach.browser.post(goals, { heroId: "h03", form: "both" })).status,
      400,
      "no combo written for h03"
    );
    assert.equal(
      (await coach.browser.post(goals, { heroId: "h99", form: "both" })).status,
      400,
      "unknown hero"
    );
    assert.equal((await coach.browser.post(goals, { heroId: "h01", form: "slow" })).status, 400);
    assert.equal((await coach.browser.post(goals, { heroId: 7, form: "normal" })).status, 400);
    const normal = await coach.browser.post(goals, { heroId: "h01", form: "normal" });
    assert.equal(normal.status, 200, normal.text);
    assert.deepEqual([normal.body.heroId, normal.body.form], ["h01", "normal"]);
    assert.equal(
      (await coach.browser.post(goals, { heroId: "h01", form: "normal" })).status,
      409,
      "asked twice"
    );
    const both = await owner.browser.post(goals, { heroId: "h01", form: "both" });
    assert.equal(both.status, 200);
    const cancel = await coach.browser.post(goals, { heroId: "h01", form: "animationCancel" });
    assert.equal(cancel.status, 200);

    // what the players have acquired
    await ana.browser.put(`/api/training/combos/${combos[0]}`, {
      normal: true,
      animationCancel: true
    });
    await ana.browser.put(`/api/training/combos/${combos[1]}`, { normal: true });
    await ben.browser.put(`/api/training/combos/${combos[2]}`, { animationCancel: true });

    // the staff sees every goal and every player
    const board = (await training(coach)).body;
    assert.deepEqual(
      board.heroGoals.map(goal => [goal.heroId, goal.form, goal.target]),
      [
        ["h01", "normal", 3],
        ["h01", "both", 3],
        ["h01", "animationCancel", 3]
      ],
      "in the order they were asked; the target is how many combos the hero has"
    );
    assert.deepEqual(board.heroesWithCombos, { h01: 3, h02: 1 }, "for the form of the staff");
    const lineOf = (body, name) => body.players.find(entry => entry.name === name).heroProgress;
    assert.deepEqual(lineOf(board, "GoalAna")[normal.body.id], {
      done: 2,
      target: 3,
      complete: false
    });
    assert.deepEqual(lineOf(board, "GoalAna")[both.body.id], {
      done: 1,
      target: 3,
      complete: false
    });
    assert.deepEqual(lineOf(board, "GoalAna")[cancel.body.id], {
      done: 1,
      target: 3,
      complete: false
    });
    assert.deepEqual(lineOf(board, "GoalBen")[normal.body.id], {
      done: 0,
      target: 3,
      complete: false
    });
    assert.deepEqual(lineOf(board, "GoalBen")[cancel.body.id], {
      done: 1,
      target: 3,
      complete: false
    });
    assert.deepEqual(
      board.players.map(entry => entry.name).sort(),
      ["GoalAna", "GoalBen"],
      "the players and the captain are asked, not the analyst"
    );

    // a player sees their own line only, and not the form of the staff
    const own = (await training(ana)).body;
    assert.deepEqual(
      own.players.map(entry => entry.name),
      ["GoalAna"]
    );
    assert.deepEqual(own.heroesWithCombos, {});
    assert.equal(own.heroGoals.length, 3, "the goals are the team's: everybody reads them");

    // the training area asks for what the teams ask of the person
    const assigned = (await ana.browser.get("/api/training/assigned")).body;
    assert.deepEqual(
      assigned.teams.map(entry => [
        entry.team.name,
        entry.heroGoals.map(goal => goal.progress.done)
      ]),
      [["Goal Squad", [2, 1, 1]]]
    );
    assert.deepEqual((await analyst.browser.get("/api/training/assigned")).body.teams, []);
    assert.deepEqual((await stranger.browser.get("/api/training/assigned")).body.teams, []);
    assert.equal((await app.browser().get("/api/training/assigned")).status, 401);

    // the third combo in the normal form completes that goal; a combo written later moves the target
    await ana.browser.put(`/api/training/combos/${combos[2]}`, { normal: true });
    assert.deepEqual(lineOf((await training(coach)).body, "GoalAna")[normal.body.id], {
      done: 3,
      target: 3,
      complete: true
    });
    await writeCombos(editor, "h01", "1102", 1);
    assert.deepEqual(
      lineOf((await training(coach)).body, "GoalAna")[normal.body.id],
      { done: 3, target: 4, complete: false },
      "the editors wrote a fourth combo: there is one more to acquire"
    );
    await editor.browser.delete(`/api/combos/h01/${combos[2]}`);
    assert.deepEqual(
      lineOf((await training(coach)).body, "GoalAna")[normal.body.id],
      { done: 2, target: 3, complete: false },
      "and a combo that is deleted is not counted any more"
    );

    // removing a goal
    assert.equal((await ana.browser.delete(`${goals}/${both.body.id}`)).status, 403);
    assert.equal((await coach.browser.delete(`${goals}/${both.body.id}`)).status, 200);
    assert.equal((await coach.browser.delete(`${goals}/${both.body.id}`)).status, 404);
    assert.equal((await coach.browser.delete(`${goals}/not-an-id`)).status, 400);
    assert.equal((await training(coach)).body.heroGoals.length, 2);
  });

  test("a team asks for at most ten, and its goals go with it", async () => {
    const editor = await app.signIn("LimitEditor", { admin: true });
    const owner = await app.signIn("LimitOwner2");
    const teamId = (
      await owner.browser.post("/api/teams", team({ name: "Limit Two", tag: "LIM2" }))
    ).body.id;
    await writeCombos(editor, "h03", "3101", 1);
    // ten goals made straight in the table (there are fewer than ten pairs of hero and form to ask)
    for (let index = 1; index <= 10; index += 1) {
      await app.store.pool.execute(
        "INSERT INTO team_hero_goals (id, team_id, hero_id, form, created_by, created_at) VALUES (UUID(), ?, ?, 'normal', NULL, ?)",
        [teamId, `h${String(index).padStart(2, "0")}`, Date.now()]
      );
    }
    const refused = await owner.browser.post(`/api/teams/${teamId}/training/hero-goals`, {
      heroId: "h03",
      form: "both"
    });
    assert.equal(refused.status, 400, refused.text);
    assert.equal((await owner.browser.delete(`/api/teams/${teamId}`)).status, 200);
    const [[left]] = await app.store.pool.query(
      "SELECT COUNT(*) AS total FROM team_hero_goals WHERE team_id = ?",
      [teamId]
    );
    assert.equal(Number(left.total), 0, "the goals go with the team");
  });
});
