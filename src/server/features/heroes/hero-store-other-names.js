// hero store, other names: listHeroAliases, addHeroAlias, removeHeroAlias.

// ---- the other names of a hero (admin; read by the automatic import) --------------------------
/** Every other name, per hero: [{ heroId, alias, key }] in the order they were added. */
export async function listHeroAliases(ctx, heroId = null) {
  const [rows] = heroId
    ? await ctx.pool.execute(
        "SELECT hero_id, alias, alias_key FROM hero_aliases WHERE hero_id = ? ORDER BY created_at, alias_key",
        [heroId]
      )
    : await ctx.pool.query(
        "SELECT hero_id, alias, alias_key FROM hero_aliases ORDER BY created_at, alias_key"
      );
  return rows.map(row => ({ heroId: row.hero_id, alias: row.alias, key: row.alias_key }));
}

/**
 * "added", or "taken" with the id of the hero that already has that key (one key names one hero only).
 */
export async function addHeroAlias(ctx, heroId, alias, key, adminId) {
  const [[taken]] = await ctx.pool.execute("SELECT hero_id FROM hero_aliases WHERE alias_key = ?", [
    key
  ]);
  if (taken) {
    return { outcome: "taken", heroId: taken.hero_id };
  }
  await ctx.pool.execute(
    "INSERT INTO hero_aliases (hero_id, alias, alias_key, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
    [heroId, alias, key, adminId, Date.now()]
  );
  return { outcome: "added" };
}

export async function removeHeroAlias(ctx, heroId, key) {
  const [result] = await ctx.pool.execute(
    "DELETE FROM hero_aliases WHERE hero_id = ? AND alias_key = ?",
    [heroId, key]
  );
  return result.affectedRows > 0;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { listHeroAliases, addHeroAlias, removeHeroAlias };
