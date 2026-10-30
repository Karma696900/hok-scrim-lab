// The ranking of a team: the best score of each player who is asked to train, shown to the staff and,
// when the staff opens it, to the players.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { parseRankingQuery, parseTrainingSettings, rankPlayers } from "../reflex/reflex-domain.js";
import { exerciseOf } from "../../../shared/reflex-model.js";
import { startTestServer } from "../../../testing/test-app.js";

const refuses = (build, code = "invalid_body") =>
  assert.throws(build, error => error.code === code);

describe("the ranking of a team (pure)", () => {
  const row = (name, best) => ({ name, best, runs: 1 });
  const places = (exercise, rows) =>
    rankPlayers(exerciseOf(exercise), rows).map(entry => `${entry.rank} ${entry.name}`);

  test("a time is ranked from the lowest, a level from the highest", () => {
    assert.deepEqual(places("reaction", [row("Ben", 260), row("Ana", 240), row("Cal", 250)]), [
      "1 Ana",
      "2 Cal",
      "3 Ben"
    ]);
    assert.deepEqual(places("sequence", [row("Ben", 5), row("Ana", 9), row("Cal", 7)]), [
      "1 Ana",
      "2 Cal",
      "3 Ben"
    ]);
  });

  test("those who share a score share the place, and the next place skips the ones they took", () => {
    assert.deepEqual(places("reaction", [row("Cal", 260), row("Ben", 240), row("Ana", 240)]), [
      "1 Ana",
      "1 Ben",
      "3 Cal"
    ]);
    assert.deepEqual(
      places("chimp", [row("Ana", 9), row("Ben", 9), row("Cal", 9), row("Dee", 3)]),
      ["1 Ana", "1 Ben", "1 Cal", "4 Dee"]
    );
    assert.deepEqual(places("aim", []), []);
  });

  test("the rows are not changed, and keep what they carry", () => {
    const rows = [
      { name: "Ben", best: 2, runs: 4, userId: "u2" },
      { name: "Ana", best: 1, runs: 1, userId: "u1" }
    ];
    const ranked = rankPlayers(exerciseOf("aim"), rows);
    assert.deepEqual(
      rows.map(entry => entry.name),
      ["Ben", "Ana"]
    );
    assert.deepEqual(ranked[0], { name: "Ana", best: 1, runs: 1, userId: "u1", rank: 1 });
  });
});

describe("what a request for the ranking asks (pure)", () => {
  test("an exercise, and this week or ever (this week by default)", () => {
    assert.deepEqual(parseRankingQuery({ exercise: "aim" }), {
      exercise: exerciseOf("aim"),
      period: "week"
    });
    assert.equal(parseRankingQuery({ exercise: "aim", period: "all" }).period, "all");
    refuses(() => parseRankingQuery({}));
    refuses(() => parseRankingQuery({ exercise: "nope" }));
    refuses(() => parseRankingQuery({ exercise: "aim", period: "month" }));
  });

  test("the staff says yes or no to showing the ranking to the players", () => {
    assert.deepEqual(parseTrainingSettings({ leaderboard: true }), { leaderboard: true });
    assert.deepEqual(parseTrainingSettings({ leaderboard: false }), { leaderboard: false });
    for (const body of [{}, { leaderboard: "yes" }, { leaderboard: 1 }, null, []]) {
      refuses(() => parseTrainingSettings(body));
    }
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const team = (overrides = {}) => ({
  name: "Extras Squad",
  tag: "EXTR",
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
const play = (who, exercise, score, durationMs = 20_000) =>
  who.browser.post("/api/training/reflex/runs", { exercise, score, durationMs });
/** A run made `days` ago, which the API would not take (its time is the server's own). */
const playEarlier = (who, exercise, score, days) =>
  app.store.pool.execute(
    "INSERT INTO reflex_runs (id, user_id, exercise, score, duration_ms, created_at) VALUES (UUID(), ?, ?, ?, 20000, ?)",
    [who.user.id, exercise, score, Date.now() - days * 86_400_000]
  );

describe("the ranking of a team over HTTP", { skip }, () => {
  test("the staff sees it; the players see it once the staff opened it; the analysts and strangers never play in it", async () => {
    const owner = await app.signIn("RankOwner");
    const coach = await app.signIn("RankCoach");
    const ana = await app.signIn("RankAna");
    const ben = await app.signIn("RankBen");
    const cal = await app.signIn("RankCal");
    const analyst = await app.signIn("RankAnalyst");
    const stranger = await app.signIn("RankStranger");
    const teamId = (await owner.browser.post("/api/teams", team())).body.id;
    await addMember(teamId, coach, "coach");
    await addMember(teamId, ana, "player");
    await addMember(teamId, ben, "player");
    await addMember(teamId, cal, "captain");
    await addMember(teamId, analyst, "analyst");
    const ranking = (who, query = "exercise=reaction") =>
      who.browser.get(`/api/teams/${teamId}/training/ranking?${query}`);
    const training = who => who.browser.get(`/api/teams/${teamId}/training`);

    await play(ana, "reaction", 260);
    await play(ana, "reaction", 240);
    await play(ben, "reaction", 250);
    await play(analyst, "reaction", 100); // not asked to train: not in the ranking
    await play(ana, "aim", 500);

    // the staff
    const first = await ranking(coach);
    assert.equal(first.status, 200, first.text);
    assert.deepEqual(
      first.body.rows.map(entry => [entry.rank, entry.name, entry.best, entry.runs]),
      [
        [1, "RankAna", 240, 2],
        [2, "RankBen", 250, 1]
      ],
      "the best of each, lowest time first; the captain has not played; the analyst is not asked"
    );
    assert.deepEqual([first.body.exercise, first.body.period], ["reaction", "week"]);
    assert.ok(first.body.rows.every(entry => entry.userId && entry.role && "picture" in entry));
    assert.deepEqual(
      (await ranking(owner, "exercise=aim")).body.rows.map(entry => [entry.name, entry.best]),
      [["RankAna", 500]],
      "an exercise at a time"
    );
    assert.deepEqual((await ranking(coach, "exercise=chimp")).body.rows, [], "nobody played it");

    // the players, before and after the staff opens it
    assert.equal((await ranking(ana)).status, 403);
    const closed = (await training(ana)).body;
    assert.deepEqual([closed.settings.leaderboard, closed.canSeeRanking], [false, false]);
    assert.equal((await training(coach)).body.canSeeRanking, true, "the staff always can");
    assert.equal(
      (await ana.browser.put(`/api/teams/${teamId}/training/settings`, { leaderboard: true }))
        .status,
      403,
      "a player does not open it"
    );
    assert.equal(
      (await cal.browser.put(`/api/teams/${teamId}/training/settings`, { leaderboard: true }))
        .status,
      403,
      "nor a captain"
    );
    const opened = await coach.browser.put(`/api/teams/${teamId}/training/settings`, {
      leaderboard: true
    });
    assert.deepEqual([opened.status, opened.body], [200, { leaderboard: true }]);
    assert.equal((await ranking(ana)).status, 200);
    assert.equal((await ranking(analyst)).status, 200, "every member may read it once it is open");
    assert.deepEqual(
      (await ranking(ben)).body.rows.map(entry => entry.name),
      ["RankAna", "RankBen"]
    );
    const open = (await training(ana)).body;
    assert.deepEqual([open.settings.leaderboard, open.canSeeRanking], [true, true]);

    // closing it again
    await owner.browser.put(`/api/teams/${teamId}/training/settings`, { leaderboard: false });
    assert.equal((await ranking(ana)).status, 403);
    assert.equal((await ranking(coach)).status, 200);

    // what is refused
    assert.equal((await ranking(stranger)).status, 403, "not in the team");
    assert.equal(
      (await app.browser().get(`/api/teams/${teamId}/training/ranking?exercise=aim`)).status,
      401
    );
    assert.equal((await ranking(coach, "exercise=nope")).status, 400);
    assert.equal((await ranking(coach, "")).status, 400);
    assert.equal((await ranking(coach, "exercise=aim&period=month")).status, 400);
    assert.equal(
      (await coach.browser.put(`/api/teams/${teamId}/training/settings`, { leaderboard: "yes" }))
        .status,
      400
    );
    assert.equal(
      (await stranger.browser.put(`/api/teams/${teamId}/training/settings`, { leaderboard: true }))
        .status,
      403
    );
    assert.equal(
      (
        await coach.browser.get(
          "/api/teams/00000000-0000-4000-8000-000000000000/training/ranking?exercise=aim"
        )
      ).status,
      404
    );
  });

  test("this week or ever, and a tie shares the place", async () => {
    const owner = await app.signIn("WeekOwner");
    const ana = await app.signIn("WeekAna");
    const ben = await app.signIn("WeekBen");
    const cal = await app.signIn("WeekCal");
    const teamId = (
      await owner.browser.post("/api/teams", team({ name: "Week Squad", tag: "WEEK" }))
    ).body.id;
    for (const [who, role] of [
      [ana, "player"],
      [ben, "player"],
      [cal, "sub"]
    ]) {
      await addMember(teamId, who, role);
    }
    await play(ana, "sequence", 6);
    await play(ben, "sequence", 6);
    await playEarlier(cal, "sequence", 12, 30); // a month ago: not this week
    await playEarlier(ben, "sequence", 10, 30);
    const week = (
      await owner.browser.get(`/api/teams/${teamId}/training/ranking?exercise=sequence`)
    ).body;
    assert.deepEqual(
      week.rows.map(entry => [entry.rank, entry.name, entry.best]),
      [
        [1, "WeekAna", 6],
        [1, "WeekBen", 6]
      ],
      "two players with the same level share the first place; the old runs are left out"
    );
    const ever = (
      await owner.browser.get(`/api/teams/${teamId}/training/ranking?exercise=sequence&period=all`)
    ).body;
    assert.deepEqual(
      ever.rows.map(entry => [entry.rank, entry.name, entry.best, entry.runs]),
      [
        [1, "WeekCal", 12, 1],
        [2, "WeekBen", 10, 2],
        [3, "WeekAna", 6, 1]
      ],
      "ever: the best of every run, the old ones included"
    );
  });

  test("the ranking and its setting go with the team", async () => {
    const owner = await app.signIn("GoneOwner");
    const teamId = (
      await owner.browser.post("/api/teams", team({ name: "Gone Squad", tag: "GONE" }))
    ).body.id;
    await owner.browser.put(`/api/teams/${teamId}/training/settings`, { leaderboard: true });
    assert.equal((await owner.browser.delete(`/api/teams/${teamId}`)).status, 200);
    const [[left]] = await app.store.pool.query(
      "SELECT COUNT(*) AS total FROM team_training_settings WHERE team_id = ?",
      [teamId]
    );
    assert.equal(Number(left.total), 0);
  });
});
