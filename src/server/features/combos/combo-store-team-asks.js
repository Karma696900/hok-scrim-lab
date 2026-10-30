// combo store, team asks: listHeroGoals, createHeroGoal, deleteHeroGoal, heroGoalProgress.
import { badRequest, conflict } from "../../platform/errors.js";
import { randomUUID } from "node:crypto";

// ---- what a team asks for a hero: its combos, acquired -------------------------------------------
export async function listHeroGoals(ctx, teamId) {
  const [rows] = await ctx.pool.execute(
    "SELECT id, hero_id, form, created_at FROM team_hero_goals WHERE team_id = ? ORDER BY created_at, id",
    [teamId]
  );
  return rows.map(row => ({
    id: row.id,
    heroId: row.hero_id,
    form: row.form,
    createdAt: Number(row.created_at)
  }));
}

export async function createHeroGoal(ctx, teamId, { heroId, form }, userId, max) {
  return ctx.inTransaction(async connection => {
    // the team row is the lock of its goals: two coaches adding at once cannot pass the limit
    await connection.query("SELECT id FROM teams WHERE id = ? FOR UPDATE", [teamId]);
    const [[goals]] = await connection.query(
      "SELECT COUNT(*) AS total FROM team_hero_goals WHERE team_id = ?",
      [teamId]
    );
    if (Number(goals.total) >= max) {
      throw badRequest("A team has at most {max} goals about heroes.", "invalid_body", { max });
    }
    const [[combos]] = await connection.query(
      "SELECT COUNT(*) AS total FROM hero_combos WHERE hero_id = ?",
      [heroId]
    );
    if (!Number(combos.total)) {
      throw badRequest("This hero has no combo yet.", "invalid_body");
    }
    const id = randomUUID();
    const now = Date.now();
    try {
      await connection.execute(
        "INSERT INTO team_hero_goals (id, team_id, hero_id, form, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [id, teamId, heroId, form, userId, now]
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        throw conflict("The team already asks for this.", "duplicate");
      }
      throw error;
    }
    return { id, heroId, form, createdAt: now };
  });
}

export async function deleteHeroGoal(ctx, teamId, id) {
  const [result] = await ctx.pool.execute(
    "DELETE FROM team_hero_goals WHERE id = ? AND team_id = ?",
    [id, teamId]
  );
  return result.affectedRows > 0;
}

/**
 * How far some players are in some hero goals: Map(userId → { goalId: { done, target, complete } }).
 * The target is how many combos the hero has now (it grows when the editors write one more).
 */
export async function heroGoalProgress(ctx, goals, userIds) {
  const result = new Map(userIds.map(id => [id, {}]));
  if (!goals.length || !userIds.length) {
    return result;
  }
  const [counts] = await ctx.pool.query(
    "SELECT hero_id, COUNT(*) AS total FROM hero_combos WHERE hero_id IN (?) GROUP BY hero_id",
    [[...new Set(goals.map(goal => goal.heroId))]]
  );
  const targets = new Map(counts.map(row => [row.hero_id, Number(row.total)]));
  const met = {
    normal: "p.normal_done = 1",
    animationCancel: "p.cancel_done = 1",
    both: "p.normal_done = 1 AND p.cancel_done = 1"
  };
  for (const goal of goals) {
    const [rows] = await ctx.pool.query(
      `SELECT p.user_id, COUNT(*) AS done FROM combo_progress p JOIN hero_combos c ON c.id = p.combo_id WHERE c.hero_id = ? AND p.user_id IN (?) AND ${met[goal.form]} GROUP BY p.user_id`,
      [goal.heroId, userIds]
    );
    const done = new Map(rows.map(row => [row.user_id, Number(row.done)]));
    const target = targets.get(goal.heroId) ?? 0;
    for (const id of userIds) {
      const count = done.get(id) ?? 0;
      result.get(id)[goal.id] = {
        done: count,
        target,
        complete: target > 0 && count >= target
      };
    }
  }
  return result;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { listHeroGoals, createHeroGoal, deleteHeroGoal, heroGoalProgress };
