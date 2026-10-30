// reflex store, staff decided: getTrainingSettings, saveTrainingSettings, rankingScores.
import { exerciseOf } from "../../../shared/reflex-model.js";

// ---- what the staff decided about the training of a team ----------------------------------------
export async function getTrainingSettings(ctx, teamId) {
  const [[row]] = await ctx.pool.execute(
    "SELECT leaderboard FROM team_training_settings WHERE team_id = ?",
    [teamId]
  );
  return { leaderboard: Boolean(row?.leaderboard) };
}

export async function saveTrainingSettings(ctx, teamId, { leaderboard }) {
  await ctx.pool.execute(
    "INSERT INTO team_training_settings (team_id, leaderboard, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE leaderboard = VALUES(leaderboard), updated_at = VALUES(updated_at)",
    [teamId, leaderboard ? 1 : 0, Date.now()]
  );
  return { leaderboard };
}

/** The best score and the number of runs of some players in an exercise, between two moments. */
export async function rankingScores(ctx, userIds, exerciseId, { from, to }) {
  if (!userIds.length) {
    return [];
  }
  const [rows] = await ctx.pool.query(
    "SELECT user_id, MIN(score) AS low, MAX(score) AS high, COUNT(*) AS runs FROM reflex_runs WHERE user_id IN (?) AND exercise = ? AND created_at >= ? AND created_at < ? GROUP BY user_id",
    [userIds, exerciseId, from, to]
  );
  const lower = exerciseOf(exerciseId).better === "lower";
  return rows.map(row => ({
    userId: row.user_id,
    best: Number(lower ? row.low : row.high),
    runs: Number(row.runs)
  }));
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { getTrainingSettings, saveTrainingSettings, rankingScores };
