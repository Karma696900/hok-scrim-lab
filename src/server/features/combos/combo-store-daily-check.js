// combo store, daily check: dueReviews, combosToLearn, answerReview, comboExists.
import { nextReview } from "./combo-domain.js";

// ---- the daily check of the combos a player has acquired --------------------------------------
/**
 * The combos that are to be checked now (their day has come and they are still acquired in some
 * form), the oldest due first, and how many there are in all.
 */
export async function dueReviews(ctx, userId, now, limit) {
  const [rows] = await ctx.pool.query(
    "SELECT c.id, c.hero_id, c.name, c.steps_json, p.normal_done, p.cancel_done, r.box, r.due_at FROM combo_reviews r JOIN hero_combos c ON c.id = r.combo_id JOIN combo_progress p ON p.combo_id = r.combo_id AND p.user_id = r.user_id WHERE r.user_id = ? AND r.due_at <= ? AND (p.normal_done = 1 OR p.cancel_done = 1) ORDER BY r.due_at, c.hero_id, c.position LIMIT ?",
    [userId, now, limit]
  );
  const [[count]] = await ctx.pool.query(
    "SELECT COUNT(*) AS total FROM combo_reviews r JOIN combo_progress p ON p.combo_id = r.combo_id AND p.user_id = r.user_id WHERE r.user_id = ? AND r.due_at <= ? AND (p.normal_done = 1 OR p.cancel_done = 1)",
    [userId, now]
  );
  return {
    total: Number(count.total),
    combos: rows.map(row => ({
      id: row.id,
      heroId: row.hero_id,
      name: row.name,
      steps: typeof row.steps_json === "string" ? JSON.parse(row.steps_json) : row.steps_json,
      normal: Boolean(row.normal_done),
      animationCancel: Boolean(row.cancel_done),
      box: Number(row.box),
      dueAt: Number(row.due_at)
    }))
  };
}

/**
 * The combos of some heroes that the player has not acquired in any form, the heroes in the order
 * given and each hero's combos in the editors' order; and how many there are in all.
 */
export async function combosToLearn(ctx, userId, heroIds, limit) {
  if (!heroIds.length) {
    return { total: 0, combos: [] };
  }
  const unlearned =
    "FROM hero_combos c LEFT JOIN combo_progress p ON p.combo_id = c.id AND p.user_id = ? WHERE c.hero_id IN (?) AND COALESCE(p.normal_done, 0) = 0 AND COALESCE(p.cancel_done, 0) = 0";
  const [[count]] = await ctx.pool.query(`SELECT COUNT(*) AS total ${unlearned}`, [
    userId,
    heroIds
  ]);
  const [rows] = await ctx.pool.query(
    `SELECT c.id, c.hero_id, c.name, c.steps_json ${unlearned} ORDER BY FIELD(c.hero_id, ?), c.position LIMIT ?`,
    [userId, heroIds, heroIds, limit]
  );
  return {
    total: Number(count.total),
    combos: rows.map(row => ({
      id: row.id,
      heroId: row.hero_id,
      name: row.name,
      steps: typeof row.steps_json === "string" ? JSON.parse(row.steps_json) : row.steps_json
    }))
  };
}

/**
 * The player says whether they still master a combo of their schedule. The new box and the day
 * it comes back, or null when the combo is not in their schedule.
 */
export async function answerReview(ctx, userId, comboId, sharp, now) {
  return ctx.inTransaction(async connection => {
    const [rows] = await connection.query(
      "SELECT box FROM combo_reviews WHERE user_id = ? AND combo_id = ? FOR UPDATE",
      [userId, comboId]
    );
    if (!rows.length) {
      return null;
    }
    const next = nextReview(Number(rows[0].box), sharp, now);
    await connection.execute(
      "UPDATE combo_reviews SET box = ?, reviewed_at = ?, due_at = ? WHERE user_id = ? AND combo_id = ?",
      [next.box, now, next.dueAt, userId, comboId]
    );
    return next;
  });
}

export async function comboExists(ctx, comboId) {
  const [rows] = await ctx.pool.execute("SELECT id FROM hero_combos WHERE id = ?", [comboId]);
  return rows.length > 0;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { dueReviews, combosToLearn, answerReview, comboExists };
