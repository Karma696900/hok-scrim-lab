import assert from "node:assert/strict";
import test from "node:test";
import { getSeriesScore, usedHeroes } from "../../../shared/draft-model.js";
import { applyDraftAction, startDraftTimer } from "./series-draft.js";
import { completeCurrentGame, createSeries, startNextGame } from "./series.js";

function completeGame(series, winner, durationSeconds = 1200) {
  const game = series.currentGame;
  game.draft.phase = "complete";
  return completeCurrentGame(series, { winner, durationSeconds });
}

test("best-of-five ends when one team reaches three wins", () => {
  const series = createSeries({
    teamA: "Redline",
    teamB: "North",
    bestOf: 5,
    gameMode: "free-for-all"
  });
  for (let game = 0; game < 3; game += 1) {
    startNextGame(series);
    completeGame(series, "Redline");
  }
  assert.deepEqual(getSeriesScore(series), { teamA: 3, teamB: 0 });
  assert.equal(series.status, "complete");
  assert.throws(() => startNextGame(series), /cannot start another game/);
});

test("best-of-two records a draw after one win per team", () => {
  const series = createSeries({
    teamA: "Redline",
    teamB: "North",
    bestOf: 2,
    gameMode: "free-for-all"
  });
  startNextGame(series);
  completeGame(series, "Redline");
  startNextGame(series);
  assert.equal(series.currentGame.blueTeam, "North");
  completeGame(series, "North");
  assert.equal(series.status, "draw");
  assert.deepEqual(getSeriesScore(series), { teamA: 1, teamB: 1 });
});

test("Global Ban & Pick locks a hero to its previous team, not its opponent", () => {
  const series = createSeries({
    teamA: "Redline",
    teamB: "North",
    bestOf: 3,
    gameMode: "global-ban-pick"
  });
  startNextGame(series);
  series.currentGame.draft.picks.blue.push("581");
  completeGame(series, "Redline");
  assert.deepEqual(usedHeroes(series, "Redline"), ["581"]);
  assert.deepEqual(usedHeroes(series, "North"), []);

  const nextDraft = startNextGame(series, "Redline").draft;
  startDraftTimer(nextDraft);
  nextDraft.stepIndex = 4;
  assert.throws(
    () =>
      applyDraftAction(nextDraft, "582", {
        teamAUsed: ["581"],
        flowbornIds: ["581", "582", "583", "584", "585"]
      }),
    /Flowborn once/
  );
  assert.doesNotThrow(() =>
    applyDraftAction(nextDraft, "582", {
      teamBUsed: [],
      flowbornIds: ["581", "582", "583", "584", "585"]
    })
  );
});

test("Free For All allows the same hero in later games", () => {
  const series = createSeries({
    teamA: "Redline",
    teamB: "North",
    bestOf: 3,
    gameMode: "free-for-all"
  });
  const draft = startNextGame(series, "Redline").draft;
  draft.stepIndex = 4;
  startDraftTimer(draft);
  assert.doesNotThrow(() => applyDraftAction(draft, "flowborn", { teamAUsed: ["flowborn"] }));
});

test("rejects invalid series formats and game durations", () => {
  assert.throws(
    () => createSeries({ teamA: "A", teamB: "B", bestOf: 0, gameMode: "free-for-all" }),
    /Best-of/
  );
  const series = createSeries({ teamA: "A", teamB: "B", bestOf: 1, gameMode: "free-for-all" });
  startNextGame(series);
  series.currentGame.draft.phase = "complete";
  assert.throws(
    () => completeCurrentGame(series, { winner: "A", durationSeconds: -1 }),
    /duration/
  );
});

test("starting the next game does not start the draft clock", () => {
  const series = createSeries({ teamA: "A", teamB: "B", bestOf: 1, gameMode: "free-for-all" });
  const game = startNextGame(series);
  assert.equal(game.draft.started, false);
  assert.equal(game.draft.deadline, null);
  assert.deepEqual(game.draft.ready, { blue: false, red: false });
});
