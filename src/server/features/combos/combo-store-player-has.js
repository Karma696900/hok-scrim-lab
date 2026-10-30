// combo store, player has: comboProgress, setComboProgress.
import { firstReview } from "./combo-domain.js";

// ---- what a player has acquired ----------------------------------------------------------
/** Map comboId → { normal, animationCancel } for a player (the combos of one hero, or all). */
export async function comboProgress(ctx, userId, heroId = null) {
  const [rows] = await ctx.pool.query(
    `SELECT p.combo_id, p.normal_done, p.cancel_done FROM combo_progress p ${heroId ? "JOIN hero_combos c ON c.id = p.combo_id AND c.hero_id = ?" : ""} WHERE p.user_id = ?`,
    heroId ? [heroId, userId] : [userId]
  );
  return new Map(
    rows.map(row => [
      row.combo_id,
      { normal: Boolean(row.normal_done), animationCancel: Boolean(row.cancel_done) }
    ])
  );
}

/** Says that a form of a combo is acquired (or not any more); the other form is left as it was. */
export async function setComboProgress(ctx, userId, comboId, { normal, animationCancel }) {
  return ctx.inTransaction(async connection => {
    const [rows] = await connection.query(
      "SELECT normal_done, cancel_done FROM combo_progress WHERE user_id = ? AND combo_id = ? FOR UPDATE",
      [userId, comboId]
    );
    const next = {
      normal: normal ?? Boolean(rows[0]?.normal_done),
      animationCancel: animationCancel ?? Boolean(rows[0]?.cancel_done)
    };
    const now = Date.now();
    await connection.execute(
      "INSERT INTO combo_progress (user_id, combo_id, normal_done, cancel_done, updated_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE normal_done = VALUES(normal_done), cancel_done = VALUES(cancel_done), updated_at = VALUES(updated_at)",
      [userId, comboId, next.normal ? 1 : 0, next.animationCancel ? 1 : 0, now]
    );
    // a combo that is acquired in some form comes back to be checked (the first time, after a day;
    // one that is already in the schedule keeps its place); one that is acquired in none does not
    if (next.normal || next.animationCancel) {
      const { box, dueAt } = firstReview(now);
      await connection.execute(
        "INSERT INTO combo_reviews (user_id, combo_id, box, reviewed_at, due_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE user_id = user_id",
        [userId, comboId, box, now, dueAt]
      );
    } else {
      await connection.execute("DELETE FROM combo_reviews WHERE user_id = ? AND combo_id = ?", [
        userId,
        comboId
      ]);
    }
    return next;
  });
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { comboProgress, setComboProgress };
