// training store, maps administrators: saveTrainingMap, listTrainingMaps, getTrainingMapImage, deleteTrainingMap.
import { conflict } from "../../platform/errors.js";
import { randomUUID } from "node:crypto";
import { presentMap } from "./training-store-parts.js";

// ---- maps (administrators) ------------------------------------------------------------------
export async function saveTrainingMap(ctx, { name, mime, data, width, height, createdBy }) {
  const id = randomUUID();
  await ctx.pool.execute(
    "INSERT INTO training_maps (id, name, mime, data, width, height, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, name, mime, data, width, height, createdBy, Date.now()]
  );
  return presentMap(
    (
      await ctx.pool.query(
        "SELECT id, name, width, height, created_at FROM training_maps WHERE id = ?",
        [id]
      )
    )[0][0]
  );
}

export async function listTrainingMaps(ctx) {
  const [rows] = await ctx.pool.query(
    "SELECT id, name, width, height, created_at FROM training_maps ORDER BY created_at DESC"
  );
  return rows.map(presentMap);
}

export async function getTrainingMapImage(ctx, id) {
  const [[row]] = await ctx.pool.query("SELECT mime, data FROM training_maps WHERE id = ?", [id]);
  return row ? { mime: row.mime, data: row.data } : null;
}

/** Refused while a situation still uses the map. */
export async function deleteTrainingMap(ctx, id) {
  const [[{ n }]] = await ctx.pool.query(
    "SELECT COUNT(*) AS n FROM training_scenarios WHERE map_id = ?",
    [id]
  );
  if (Number(n) > 0) {
    throw conflict(
      "This map is used by {count} situation(s). Delete or move them first.",
      "map_in_use",
      { count: Number(n) }
    );
  }
  const [result] = await ctx.pool.execute("DELETE FROM training_maps WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { saveTrainingMap, listTrainingMaps, getTrainingMapImage, deleteTrainingMap };
