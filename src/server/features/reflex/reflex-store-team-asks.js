// reflex store, team asks: listTrainingGoals, createTrainingGoal, updateTrainingGoal, deleteTrainingGoal, and 1 more.
import { badRequest } from "../../platform/errors.js";
import { periodWindow, progressOf } from "./reflex-domain.js";
import { randomUUID } from "node:crypto";
import { present } from "./reflex-store-parts.js";

// ---- what a team asks of its players -------------------------------------------------------
export async function listTrainingGoals(ctx, teamId) {
  const [rows] = await ctx.pool.execute(
    "SELECT * FROM team_training_goals WHERE team_id = ? ORDER BY created_at, id",
    [teamId]
  );
  return rows.map(present);
}

export async function createTrainingGoal(ctx, teamId, goal, userId, max) {
  return ctx.inTransaction(async connection => {
    // the team row is the lock of its goals: two coaches adding at once cannot pass the limit
    await connection.query("SELECT id FROM teams WHERE id = ? FOR UPDATE", [teamId]);
    const [[row]] = await connection.query(
      "SELECT COUNT(*) AS total FROM team_training_goals WHERE team_id = ?",
      [teamId]
    );
    if (Number(row.total) >= max) {
      throw badRequest("A team has at most {max} training goals.", "invalid_body", { max });
    }
    const id = randomUUID();
    const now = Date.now();
    await connection.execute(
      "INSERT INTO team_training_goals (id, team_id, period, metric, amount, exercise, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, teamId, goal.period, goal.metric, goal.amount, goal.exercise, userId, now, now]
    );
    return { id, ...goal, createdAt: now };
  });
}

/** The goal as saved, or null when this team has no such goal. */
export async function updateTrainingGoal(ctx, teamId, id, goal) {
  const [result] = await ctx.pool.execute(
    "UPDATE team_training_goals SET period = ?, metric = ?, amount = ?, exercise = ?, updated_at = ? WHERE id = ? AND team_id = ?",
    [goal.period, goal.metric, goal.amount, goal.exercise, Date.now(), id, teamId]
  );
  if (!result.affectedRows) {
    return null;
  }
  const [[row]] = await ctx.pool.execute("SELECT * FROM team_training_goals WHERE id = ?", [id]);
  return present(row);
}

export async function deleteTrainingGoal(ctx, teamId, id) {
  const [result] = await ctx.pool.execute(
    "DELETE FROM team_training_goals WHERE id = ? AND team_id = ?",
    [id, teamId]
  );
  return result.affectedRows > 0;
}

/**
 * How far each of some players is in each goal, in the period that is running on the clock of
 * the team (`offset` minutes east of UTC): Map(userId → { goalId: { done, target, complete } }).
 */
export async function trainingProgress(ctx, goals, userIds, offset, now) {
  const result = new Map(userIds.map(id => [id, {}]));
  if (!userIds.length) {
    return result;
  }
  for (const goal of goals) {
    const { from, to } = periodWindow(now, offset, goal.period);
    const [rows] = await ctx.pool.query(
      `SELECT user_id, COUNT(*) AS runs, COALESCE(SUM(duration_ms), 0) AS duration FROM reflex_runs WHERE user_id IN (?) AND created_at >= ? AND created_at < ?${goal.exercise ? " AND exercise = ?" : ""} GROUP BY user_id`,
      goal.exercise ? [userIds, from, to, goal.exercise] : [userIds, from, to]
    );
    const played = new Map(rows.map(row => [row.user_id, row]));
    for (const id of userIds) {
      const row = played.get(id);
      result.get(id)[goal.id] = progressOf(goal, {
        runs: row ? Number(row.runs) : 0,
        durationMs: row ? Number(row.duration) : 0
      });
    }
  }
  return result;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  listTrainingGoals,
  createTrainingGoal,
  updateTrainingGoal,
  deleteTrainingGoal,
  trainingProgress
};
