// catalog store, recommended builds: listBuildSets, listBuildSummaries, saveBuildSet, deleteBuildSet.
import { parse } from "./catalog-store-parts.js";

// ---- recommended builds ---------------------------------------------------------------------
export async function listBuildSets(ctx, heroId) {
  const [rows] = await ctx.pool.execute(
    "SELECT * FROM hero_build_sets WHERE hero_id = ? ORDER BY variant",
    [heroId]
  );
  return rows.map(row => ({
    variant: row.variant,
    name: row.name,
    build: parse(row.build_json, {}),
    note: row.note,
    sourceUrl: row.source_url,
    updatedAt: Number(row.updated_at)
  }));
}

/** Every recommended build, without its content: which hero has which, and when it changed. */
export async function listBuildSummaries(ctx) {
  const [rows] = await ctx.pool.execute(
    "SELECT hero_id, variant, name, updated_at FROM hero_build_sets ORDER BY hero_id, variant"
  );
  return rows.map(row => ({
    heroId: row.hero_id,
    variant: row.variant,
    name: row.name,
    updatedAt: Number(row.updated_at)
  }));
}

export async function saveBuildSet(ctx, heroId, set, editorId) {
  await ctx.pool.execute(
    "INSERT INTO hero_build_sets (hero_id, variant, name, build_json, note, source_url, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), build_json = VALUES(build_json), note = VALUES(note), source_url = VALUES(source_url), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)",
    [
      heroId,
      set.variant,
      set.name,
      JSON.stringify(set.build),
      set.note,
      set.sourceUrl,
      editorId,
      Date.now()
    ]
  );
}

export async function deleteBuildSet(ctx, heroId, variant) {
  const [result] = await ctx.pool.execute(
    "DELETE FROM hero_build_sets WHERE hero_id = ? AND variant = ?",
    [heroId, variant]
  );
  return result.affectedRows > 0;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { listBuildSets, listBuildSummaries, saveBuildSet, deleteBuildSet };
