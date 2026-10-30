// Reflex training, the server side: what a finished run may say, how a day or a week is cut on the
// clock of a team, what a team can ask of its players and who sees how far each one is.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import {
  dayNumber,
  parseGoal,
  parseOffset,
  parseRun,
  periodWindow,
  progressOf,
  streakOf
} from "./reflex-domain.js";
import {
  EXERCISES,
  ROUTINES,
  bestOf,
  chosenExercises,
  exerciseOf,
  isBetter,
  routineOf
} from "../../../shared/reflex-model.js";
import { startTestServer } from "../../../testing/test-app.js";

const refuses = (build, code = "invalid_body") =>
  assert.throws(build, error => error.code === code);
const at = text => Date.parse(text);

describe("the exercises", () => {
  test("each one says which score wins, and a score is compared the right way round", () => {
    const reaction = exerciseOf("reaction");
    const sequence = exerciseOf("sequence");
    assert.equal(EXERCISES.length, 8);
    assert.equal(new Set(EXERCISES.map(exercise => exercise.id)).size, 8, "each id once");
    assert.ok(isBetter(reaction, 240, 260), "a shorter time wins");
    assert.ok(!isBetter(reaction, 260, 240));
    assert.ok(!isBetter(reaction, 240, 240), "a tie is not a record");
    assert.ok(isBetter(sequence, 9, 8), "a higher level wins");
    assert.ok(isBetter(sequence, 1, null), "the first run is a record");
    assert.equal(bestOf(reaction, [300, 240, 280]), 240);
    assert.equal(bestOf(sequence, [3, 9, 5]), 9);
    assert.equal(bestOf(sequence, []), null);
    assert.equal(exerciseOf("nope"), null);
  });
});

describe("the routines", () => {
  test("each is a few exercises of the list, each once, and has a name of its own", () => {
    const ids = EXERCISES.map(exercise => exercise.id);
    assert.ok(ROUTINES.length >= 3);
    assert.equal(new Set(ROUTINES.map(routine => routine.id)).size, ROUTINES.length);
    for (const routine of ROUTINES) {
      assert.ok(routine.exercises.length >= 2, routine.id);
      assert.equal(new Set(routine.exercises).size, routine.exercises.length, routine.id);
      assert.ok(
        routine.exercises.every(id => ids.includes(id)),
        routine.id
      );
    }
    assert.deepEqual(routineOf("everything").exercises, ids, "one of them plays everything");
    assert.equal(routineOf("nope"), null);
  });

  test("a choice of exercises is put in the order of the list, once each, unknown ones dropped", () => {
    assert.deepEqual(chosenExercises(["inputs", "reaction", "reaction", "nope"]), [
      "reaction",
      "inputs"
    ]);
    assert.deepEqual(chosenExercises([]), []);
    assert.deepEqual(chosenExercises(["lasthit"]), ["lasthit"]);
  });
});

describe("a finished run", () => {
  test("an exercise, a score within what the exercise allows, how long it lasted", () => {
    assert.deepEqual(parseRun({ exercise: "reaction", score: 251, durationMs: 14_000 }), {
      exercise: "reaction",
      score: 251,
      durationMs: 14_000
    });
    refuses(() => parseRun({ exercise: "nope", score: 1, durationMs: 20_000 }));
    refuses(() => parseRun({ exercise: "reaction", score: -1, durationMs: 14_000 }));
    refuses(() => parseRun({ exercise: "reaction", score: 5001, durationMs: 14_000 }));
    refuses(() => parseRun({ exercise: "reaction", score: 250.5, durationMs: 14_000 }));
    refuses(() => parseRun({ exercise: "reaction", score: "250", durationMs: 14_000 }));
    refuses(() => parseRun({ exercise: "chimp", score: 41, durationMs: 20_000 }), "invalid_body");
    refuses(() => parseRun(null));
  });

  test("a run cannot be shorter than the exercise, nor last half an hour", () => {
    refuses(() => parseRun({ exercise: "reaction", score: 250, durationMs: 1000 }));
    refuses(() => parseRun({ exercise: "reaction", score: 250, durationMs: 31 * 60_000 }));
    assert.equal(parseRun({ exercise: "sequence", score: 0, durationMs: 3000 }).score, 0);
  });
});

describe("what a team asks", () => {
  test("a number of runs or of minutes, each day or each week, for one exercise or any", () => {
    assert.deepEqual(parseGoal({ period: "day", metric: "runs", amount: 10 }), {
      period: "day",
      metric: "runs",
      amount: 10,
      exercise: ""
    });
    assert.equal(
      parseGoal({ period: "week", metric: "minutes", amount: 90, exercise: "aim" }).exercise,
      "aim"
    );
    refuses(() => parseGoal({ period: "month", metric: "runs", amount: 5 }));
    refuses(() => parseGoal({ period: "day", metric: "hours", amount: 5 }));
    refuses(() => parseGoal({ period: "day", metric: "runs", amount: 0 }));
    refuses(() => parseGoal({ period: "day", metric: "runs", amount: 201 }), "invalid_body");
    refuses(() => parseGoal({ period: "day", metric: "minutes", amount: 481 }));
    refuses(() => parseGoal({ period: "week", metric: "runs", amount: 5, exercise: "nope" }));
    refuses(() => parseGoal({ period: "day", metric: "runs", amount: 2.5 }));
    refuses(() => parseGoal([]));
  });

  test("a time zone offset is minutes east of UTC, as far as the clocks go", () => {
    assert.equal(parseOffset(undefined), 0);
    assert.equal(parseOffset("120"), 120);
    assert.equal(parseOffset("-300"), -300);
    refuses(() => parseOffset("841"));
    refuses(() => parseOffset("two"));
    refuses(() => parseOffset("12.5"));
  });
});

describe("a day and a week on the clock of a team", () => {
  test("in UTC a day is the calendar day and a week starts on Monday", () => {
    const wednesday = at("2026-10-07T15:00:00Z");
    assert.deepEqual(periodWindow(wednesday, 0, "day"), {
      from: at("2026-10-07T00:00:00Z"),
      to: at("2026-10-08T00:00:00Z")
    });
    assert.deepEqual(periodWindow(wednesday, 0, "week"), {
      from: at("2026-10-05T00:00:00Z"),
      to: at("2026-10-12T00:00:00Z")
    });
  });

  test("Monday and Sunday belong to the week that starts on that Monday", () => {
    assert.equal(
      periodWindow(at("2026-10-05T00:00:00Z"), 0, "week").from,
      at("2026-10-05T00:00:00Z")
    );
    assert.equal(
      periodWindow(at("2026-10-11T23:59:59Z"), 0, "week").from,
      at("2026-10-05T00:00:00Z")
    );
    assert.equal(
      periodWindow(at("2026-10-12T00:00:00Z"), 0, "week").from,
      at("2026-10-12T00:00:00Z")
    );
  });

  test("a team east of UTC changes day before it, a team west of it after", () => {
    // 23:30 UTC on Wednesday is already 01:30 on Thursday at UTC+2
    const late = at("2026-10-07T23:30:00Z");
    assert.deepEqual(periodWindow(late, 120, "day"), {
      from: at("2026-10-07T22:00:00Z"),
      to: at("2026-10-08T22:00:00Z")
    });
    assert.equal(periodWindow(late, 120, "week").from, at("2026-10-04T22:00:00Z"));
    // 02:00 UTC on Wednesday is still Tuesday evening at UTC-5
    const early = at("2026-10-07T02:00:00Z");
    assert.deepEqual(periodWindow(early, -300, "day"), {
      from: at("2026-10-06T05:00:00Z"),
      to: at("2026-10-07T05:00:00Z")
    });
    // Sunday night UTC is already Monday at UTC+3: a new week for that team
    assert.equal(
      periodWindow(at("2026-10-11T22:00:00Z"), 180, "week").from,
      at("2026-10-11T21:00:00Z")
    );
  });

  test("the day number follows the clock too", () => {
    assert.equal(
      dayNumber(at("2026-10-07T23:30:00Z"), 120),
      dayNumber(at("2026-10-08T12:00:00Z"), 0)
    );
    assert.equal(
      dayNumber(at("2026-10-07T23:30:00Z"), 0) + 1,
      dayNumber(at("2026-10-07T23:30:00Z"), 120)
    );
  });
});

describe("how far a player is", () => {
  test("runs are counted as they come, minutes only when a whole one has been played", () => {
    const runs = { period: "day", metric: "runs", amount: 3 };
    const minutes = { period: "week", metric: "minutes", amount: 10 };
    assert.deepEqual(progressOf(runs, { runs: 2, durationMs: 400_000 }), {
      done: 2,
      target: 3,
      complete: false
    });
    assert.equal(progressOf(runs, { runs: 3 }).complete, true);
    assert.equal(progressOf(runs, { runs: 9 }).complete, true, "doing more is still done");
    assert.deepEqual(progressOf(minutes, { runs: 50, durationMs: 599_999 }), {
      done: 9,
      target: 10,
      complete: false
    });
    assert.equal(progressOf(minutes, { durationMs: 600_000 }).complete, true);
    assert.deepEqual(progressOf(runs), { done: 0, target: 3, complete: false });
  });

  test("a streak counts the days in a row, and is not broken by a day that is not over", () => {
    assert.equal(streakOf([], 100), 0);
    assert.equal(streakOf([100, 99, 98], 100), 3);
    assert.equal(streakOf([99, 98], 100), 2, "nothing yet today: yesterday still counts");
    assert.equal(streakOf([98, 97], 100), 0, "a day was missed");
    assert.equal(streakOf([100, 98, 97], 100), 1, "a gap stops the count");
    assert.equal(streakOf([100, 100, 99], 100), 2, "twice the same day is one day");
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const run = (exercise, score, durationMs = 20_000) => ({ exercise, score, durationMs });
const team = (overrides = {}) => ({
  name: "Reflex Squad",
  tag: "RFLX",
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

describe("the runs of a player", { skip }, () => {
  test("a run is kept for the signed-in player, with the record it makes", async () => {
    const ana = await app.signIn("RunAna");
    assert.equal(
      (await app.browser().post("/api/training/reflex/runs", run("aim", 400))).status,
      401
    );
    assert.equal((await app.browser().get("/api/training/reflex")).status, 401);

    const empty = (await ana.browser.get("/api/training/reflex")).body;
    assert.equal(Object.keys(empty.exercises).length, 8);
    assert.deepEqual(empty.exercises.reaction, { runs: 0, best: null, last: [] });
    assert.deepEqual(empty.doneToday, [], "nothing played yet today");
    assert.deepEqual(
      [empty.today, empty.week, empty.streak],
      [{ runs: 0, minutes: 0 }, { runs: 0, minutes: 0 }, 0]
    );

    const first = await ana.browser.post("/api/training/reflex/runs", run("reaction", 300, 60_000));
    assert.equal(first.status, 200, first.text);
    assert.deepEqual(first.body.exercise, {
      id: "reaction",
      runs: 1,
      previousBest: null,
      best: 300,
      isBest: true
    });
    const faster = await ana.browser.post("/api/training/reflex/runs", run("reaction", 250));
    assert.deepEqual(
      [faster.body.exercise.isBest, faster.body.exercise.best, faster.body.exercise.previousBest],
      [true, 250, 300],
      "a lower time is a record in a time exercise"
    );
    const slower = await ana.browser.post("/api/training/reflex/runs", run("reaction", 280));
    assert.deepEqual(
      [slower.body.exercise.isBest, slower.body.exercise.best, slower.body.exercise.runs],
      [false, 250, 3]
    );
    await ana.browser.post("/api/training/reflex/runs", run("sequence", 6, 40_000));
    const higher = await ana.browser.post("/api/training/reflex/runs", run("sequence", 9, 50_000));
    assert.deepEqual(
      [higher.body.exercise.isBest, higher.body.exercise.best],
      [true, 9],
      "a higher level is a record in a level exercise"
    );

    const summary = (await ana.browser.get("/api/training/reflex")).body;
    assert.equal(summary.exercises.reaction.best, 250);
    assert.deepEqual(summary.exercises.reaction.last, [280, 250, 300], "newest first");
    assert.equal(summary.exercises.sequence.best, 9);
    assert.deepEqual(
      summary.today,
      { runs: 5, minutes: 3 },
      "190 s of play are three whole minutes"
    );
    assert.equal(summary.streak, 1);
    assert.deepEqual(
      summary.doneToday,
      ["reaction", "sequence"],
      "the exercises played today, in the order of the list"
    );
    assert.deepEqual(summary.teams, []);
  });

  test("what is refused leaves nothing behind, and nobody else sees the runs", async () => {
    const ben = await app.signIn("RunBen");
    const other = await app.signIn("RunOther");
    for (const body of [
      run("nope", 1),
      run("aim", -3),
      run("aim", 10_001),
      run("aim", 400, 500),
      run("aim", "400"),
      {}
    ]) {
      assert.equal((await ben.browser.post("/api/training/reflex/runs", body)).status, 400);
    }
    assert.equal((await ben.browser.get("/api/training/reflex")).body.today.runs, 0);
    await ben.browser.post("/api/training/reflex/runs", run("aim", 420));
    assert.equal((await other.browser.get("/api/training/reflex")).body.exercises.aim.best, null);
    assert.equal((await ben.browser.get("/api/training/reflex")).body.exercises.aim.best, 420);
  });

  test("today follows the clock of the player", async () => {
    const eve = await app.signIn("RunEve");
    await eve.browser.post("/api/training/reflex/runs", run("aim", 420));
    // the run was just made: it is today wherever the player is, but the window moves with the offset
    for (const offset of [-600, 0, 600]) {
      const summary = (await eve.browser.get(`/api/training/reflex?offset=${offset}`)).body;
      assert.equal(summary.week.runs, 1, `week at ${offset}`);
    }
    assert.equal((await eve.browser.get("/api/training/reflex?offset=9999")).status, 400);
    // a run yesterday keeps the streak alive, one three days ago does not make a streak of its own
    const day = 86_400_000;
    await app.store.pool.execute(
      "INSERT INTO reflex_runs (id, user_id, exercise, score, duration_ms, created_at) VALUES (UUID(), ?, 'aim', 400, 20000, ?), (UUID(), ?, 'aim', 400, 20000, ?)",
      [eve.user.id, Date.now() - day, eve.user.id, Date.now() - 4 * day]
    );
    assert.equal((await eve.browser.get("/api/training/reflex")).body.streak, 2);
  });

  test("too many runs in a day are refused", async () => {
    const fan = await app.signIn("RunFan");
    const values = Array.from({ length: 600 }, () => "(UUID(), ?, 'aim', 400, 20000, ?)").join(",");
    await app.store.pool.execute(
      `INSERT INTO reflex_runs (id, user_id, exercise, score, duration_ms, created_at) VALUES ${values}`,
      Array.from({ length: 600 }, () => [fan.user.id, Date.now() - 60_000]).flat()
    );
    const refused = await fan.browser.post("/api/training/reflex/runs", run("aim", 400));
    assert.equal(refused.status, 429, refused.text);
  });
});

describe("what a team asks of its players", { skip }, () => {
  test("the staff sets it, each player sees their own progress, the staff sees everybody's", async () => {
    const owner = await app.signIn("TeamOwner");
    const coach = await app.signIn("TeamCoach");
    const captain = await app.signIn("TeamCaptain");
    const player = await app.signIn("TeamPlayer");
    const analyst = await app.signIn("TeamAnalyst");
    const stranger = await app.signIn("TeamStranger");
    const created = await owner.browser.post("/api/teams", team());
    assert.equal(created.status, 201, created.text);
    const teamId = created.body.id;
    await addMember(teamId, coach, "coach");
    await addMember(teamId, captain, "captain");
    await addMember(teamId, player, "player");
    await addMember(teamId, analyst, "analyst");
    const goals = `/api/teams/${teamId}/training/goals`;
    const training = `/api/teams/${teamId}/training`;

    // who may ask
    const daily = { period: "day", metric: "runs", amount: 2 };
    assert.equal((await app.browser().post(goals, daily)).status, 401);
    assert.equal((await stranger.browser.post(goals, daily)).status, 403, "not in the team");
    assert.equal((await player.browser.post(goals, daily)).status, 403, "a player does not set it");
    assert.equal((await captain.browser.post(goals, daily)).status, 403, "nor a captain");
    assert.equal((await analyst.browser.post(goals, daily)).status, 403, "nor an analyst");
    const made = await coach.browser.post(goals, daily);
    assert.equal(made.status, 200, made.text);
    assert.equal(
      (
        await owner.browser.post(goals, {
          period: "week",
          metric: "minutes",
          amount: 1,
          exercise: "aim"
        })
      ).status,
      200
    );
    assert.equal(
      (await coach.browser.post(goals, { period: "day", metric: "runs", amount: 0 })).status,
      400
    );
    assert.equal(
      (
        await coach.browser.post(
          "/api/teams/00000000-0000-4000-8000-000000000000/training/goals",
          daily
        )
      ).status,
      404
    );

    // before anybody has played
    let board = (await coach.browser.get(training)).body;
    assert.equal(board.canAssign, true);
    assert.equal(board.timezone, "UTC+1");
    assert.deepEqual(
      board.goals.map(goal => [goal.period, goal.metric, goal.amount, goal.exercise]),
      [
        ["day", "runs", 2, ""],
        ["week", "minutes", 1, "aim"]
      ]
    );
    assert.deepEqual(
      board.players.map(entry => [entry.name, entry.role]).sort(),
      [
        ["TeamCaptain", "captain"],
        ["TeamPlayer", "player"]
      ],
      "the players are the ones asked: not the staff, not the analyst"
    );
    assert.ok(
      board.players.every(entry => Object.values(entry.progress).every(item => item.done === 0))
    );
    assert.ok(board.goals.every(goal => goal.to - goal.from > 0));

    // the player plays: one aim run of 70 s and one reaction run
    await player.browser.post("/api/training/reflex/runs", run("aim", 400, 70_000));
    await player.browser.post("/api/training/reflex/runs", run("reaction", 250, 20_000));
    const mine = (await player.browser.get("/api/training/reflex")).body.teams;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].team.id, teamId);
    const [everyDay, aimWeek] = mine[0].goals;
    assert.deepEqual(
      everyDay.progress,
      { done: 2, target: 2, complete: true },
      "any exercise counts"
    );
    assert.deepEqual(
      aimWeek.progress,
      { done: 1, target: 1, complete: true },
      "70 s of aim is a minute"
    );

    // the answer to a run says where the goals stand now
    const another = await player.browser.post(
      "/api/training/reflex/runs",
      run("reaction", 240, 20_000)
    );
    assert.equal(another.body.teams[0].goals[0].progress.done, 3);

    // the staff sees everybody; a player sees themself only
    board = (await coach.browser.get(training)).body;
    const lines = Object.fromEntries(board.players.map(entry => [entry.name, entry.progress]));
    assert.equal(lines.TeamPlayer[everyDay.id].done, 3);
    assert.equal(lines.TeamCaptain[everyDay.id].done, 0);
    const own = (await player.browser.get(training)).body;
    assert.equal(own.canAssign, false);
    assert.deepEqual(
      own.players.map(entry => entry.name),
      ["TeamPlayer"]
    );
    assert.equal((await captain.browser.get(training)).body.players.length, 1);
    assert.equal(
      (await analyst.browser.get(training)).body.players.length,
      0,
      "not asked, sees nobody's"
    );
    assert.equal((await stranger.browser.get(training)).status, 403);
    assert.equal((await app.browser().get(training)).status, 401);

    // the staff and the captain: nothing asked of the staff
    assert.deepEqual((await coach.browser.get("/api/training/reflex")).body.teams, []);
    assert.equal(
      (await captain.browser.get("/api/training/reflex")).body.teams[0].goals[0].progress.done,
      0
    );

    // change one, remove one
    const changed = await coach.browser.put(`${goals}/${everyDay.id}`, {
      period: "day",
      metric: "runs",
      amount: 5
    });
    assert.equal(changed.status, 200, changed.text);
    assert.equal(changed.body.amount, 5);
    assert.equal((await player.browser.put(`${goals}/${everyDay.id}`, daily)).status, 403);
    assert.equal(
      (await coach.browser.put(`${goals}/00000000-0000-4000-8000-000000000000`, daily)).status,
      404
    );
    assert.equal((await player.browser.delete(`${goals}/${everyDay.id}`)).status, 403);
    assert.equal((await owner.browser.delete(`${goals}/${everyDay.id}`)).status, 200);
    assert.equal(
      (await owner.browser.delete(`${goals}/${everyDay.id}`)).status,
      404,
      "already gone"
    );
    assert.equal((await coach.browser.get(training)).body.goals.length, 1);
  });

  test("a team asks for at most ten things, a deleted team asks for nothing, and a goal is a team's own", async () => {
    const owner = await app.signIn("LimitOwner");
    const other = await app.signIn("LimitOther");
    const first = (
      await owner.browser.post("/api/teams", team({ name: "Limit Squad", tag: "LIMT" }))
    ).body.id;
    const second = (
      await other.browser.post("/api/teams", team({ name: "Other Squad", tag: "OTHS" }))
    ).body.id;
    for (let index = 1; index <= 10; index += 1) {
      const saved = await owner.browser.post(`/api/teams/${first}/training/goals`, {
        period: "day",
        metric: "runs",
        amount: index
      });
      assert.equal(saved.status, 200, `goal ${index}: ${saved.text}`);
    }
    const eleventh = await owner.browser.post(`/api/teams/${first}/training/goals`, {
      period: "week",
      metric: "runs",
      amount: 11
    });
    assert.equal(eleventh.status, 400, "the eleventh is refused");

    const foreign = (
      await other.browser.post(`/api/teams/${second}/training/goals`, {
        period: "day",
        metric: "runs",
        amount: 1
      })
    ).body;
    assert.equal(
      (
        await owner.browser.put(`/api/teams/${first}/training/goals/${foreign.id}`, {
          period: "day",
          metric: "runs",
          amount: 9
        })
      ).status,
      404,
      "the goal of another team cannot be changed through mine"
    );
    assert.equal(
      (await owner.browser.delete(`/api/teams/${first}/training/goals/${foreign.id}`)).status,
      404
    );

    assert.equal((await owner.browser.delete(`/api/teams/${first}`)).status, 200);
    const [[left]] = await app.store.pool.query(
      "SELECT COUNT(*) AS total FROM team_training_goals WHERE team_id = ?",
      [first]
    );
    assert.equal(Number(left.total), 0, "the goals go with the team");
  });
});
