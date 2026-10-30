// combo store, small helpers: present, comboCounts, listCombos, createCombo, and 4 more.
import { COMBOS_PER_HERO_MAX } from "./combo-domain.js";
import { badRequest } from "../../platform/errors.js";
import { randomUUID } from "node:crypto";

export const present = row => ({
  id: row.id,
  heroId: row.hero_id,
  position: row.position,
  name: row.name,
  note: row.note,
  steps: typeof row.steps_json === "string" ? JSON.parse(row.steps_json) : row.steps_json,
  updatedAt: Number(row.updated_at)
});

/** How many combos each hero has (the heroes without any are not in the answer). */
export async function comboCounts(ctx) {
  const [rows] = await ctx.pool.query(
    "SELECT hero_id, COUNT(*) AS total FROM hero_combos GROUP BY hero_id"
  );
  return Object.fromEntries(rows.map(row => [row.hero_id, Number(row.total)]));
}

/** The combos of a hero, in the order the editors chose. */
export async function listCombos(ctx, heroId) {
  const [rows] = await ctx.pool.execute(
    "SELECT * FROM hero_combos WHERE hero_id = ? ORDER BY position, created_at",
    [heroId]
  );
  return rows.map(present);
}

export async function createCombo(ctx, heroId, combo, editorId) {
  return ctx.inTransaction(async connection => {
    // the hero row is the lock of its combos: two editors adding at once get two positions
    await connection.query("SELECT id FROM heroes WHERE id = ? FOR UPDATE", [heroId]);
    const [[row]] = await connection.query(
      "SELECT COUNT(*) AS total, COALESCE(MAX(position), -1) AS last FROM hero_combos WHERE hero_id = ?",
      [heroId]
    );
    if (Number(row.total) >= COMBOS_PER_HERO_MAX) {
      throw badRequest("A hero has at most {max} combos.", "invalid_body", {
        max: COMBOS_PER_HERO_MAX
      });
    }
    const now = Date.now();
    const id = randomUUID();
    await connection.execute(
      "INSERT INTO hero_combos (id, hero_id, position, name, note, steps_json, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        heroId,
        Number(row.last) + 1,
        combo.name,
        combo.note,
        JSON.stringify(combo.steps),
        editorId,
        now,
        now
      ]
    );
    return present({
      id,
      hero_id: heroId,
      position: Number(row.last) + 1,
      name: combo.name,
      note: combo.note,
      steps_json: combo.steps,
      updated_at: now
    });
  });
}

/** The combo as saved, or null when this hero has no such combo. */
export async function updateCombo(ctx, heroId, id, combo, editorId) {
  const [result] = await ctx.pool.execute(
    "UPDATE hero_combos SET name = ?, note = ?, steps_json = ?, updated_by = ?, updated_at = ? WHERE id = ? AND hero_id = ?",
    [combo.name, combo.note, JSON.stringify(combo.steps), editorId, Date.now(), id, heroId]
  );
  if (!result.affectedRows) {
    return null;
  }
  const [[row]] = await ctx.pool.execute("SELECT * FROM hero_combos WHERE id = ?", [id]);
  return present(row);
}

export async function deleteCombo(ctx, heroId, id) {
  const [result] = await ctx.pool.execute("DELETE FROM hero_combos WHERE id = ? AND hero_id = ?", [
    id,
    heroId
  ]);
  return result.affectedRows > 0;
}

/** The ids of a hero's combos in their current order. */
export async function comboIds(ctx, heroId) {
  const [rows] = await ctx.pool.execute(
    "SELECT id FROM hero_combos WHERE hero_id = ? ORDER BY position, created_at",
    [heroId]
  );
  return rows.map(row => row.id);
}

export async function reorderCombos(ctx, heroId, ids) {
  await ctx.inTransaction(async connection => {
    for (const [position, id] of ids.entries()) {
      await connection.execute("UPDATE hero_combos SET position = ? WHERE id = ? AND hero_id = ?", [
        position,
        id,
        heroId
      ]);
    }
  });
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  comboCounts,
  listCombos,
  createCombo,
  updateCombo,
  deleteCombo,
  comboIds,
  reorderCombos
};
