// catalog store, hero profiles: getHeroProfile, saveHeroProfile, heroTags.
import { parse, setTags, tagsOf } from "./catalog-store-parts.js";

// ---- hero profiles --------------------------------------------------------------------------
export async function getHeroProfile(ctx, heroId) {
  const [[row]] = await ctx.pool.execute("SELECT * FROM hero_profiles WHERE hero_id = ?", [heroId]);
  const [tagRows] = await ctx.pool.execute(
    "SELECT tag_id FROM entity_tags WHERE entity_type = 'hero' AND entity_id = ? ORDER BY tag_id",
    [heroId]
  );
  return {
    baseStats: row ? parse(row.base_stats_json, []) : [],
    skills: row ? parse(row.skills_json, []) : [],
    tags: tagRows.map(entry => entry.tag_id),
    updatedAt: row ? Number(row.updated_at) : null
  };
}

export async function saveHeroProfile(ctx, heroId, profile) {
  await ctx.inTransaction(async connection => {
    await connection.execute(
      "INSERT INTO hero_profiles (hero_id, base_stats_json, skills_json, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE base_stats_json = VALUES(base_stats_json), skills_json = VALUES(skills_json), updated_at = VALUES(updated_at)",
      [heroId, JSON.stringify(profile.baseStats), JSON.stringify(profile.skills), Date.now()]
    );
    await setTags(connection, "hero", heroId, profile.tags);
  });
}

/** Hero id -> tag ids, for every hero that has tags (the build lab compares a build with them). */
export async function heroTags(ctx) {
  return tagsOf(ctx.pool, "hero");
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { getHeroProfile, saveHeroProfile, heroTags };
