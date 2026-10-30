// hero store, manual hero: addHeroLane, removeHeroLane.

// ---- manual hero data (admin) ---------------------------------------------------------------
export async function addHeroLane(ctx, heroId, lane, note, adminId) {
  const [[hero]] = await ctx.pool.query("SELECT lanes_json FROM heroes WHERE id = ?", [heroId]);
  const listed = hero
    ? typeof hero.lanes_json === "string"
      ? JSON.parse(hero.lanes_json)
      : hero.lanes_json
    : [];
  // A Camp lane that was taken away comes back by deleting the removal; any other lane is a
  // manual addition.
  const [restored] = await ctx.pool.execute(
    "DELETE FROM hero_lane_removals WHERE hero_id = ? AND lane = ?",
    [heroId, lane]
  );
  let added = restored.affectedRows > 0;
  if (!listed.includes(lane)) {
    const [result] = await ctx.pool.execute(
      "INSERT IGNORE INTO hero_lane_additions (hero_id, lane, source, note, created_by, created_at) VALUES (?, ?, 'manual', ?, ?, ?)",
      [heroId, lane, note, adminId, new Date().toISOString()]
    );
    added = added || result.affectedRows > 0;
  }
  ctx.heroCache = null;
  return added;
}

/**
 * "removed", "missing" (the hero does not have that lane) or "last" (a hero keeps at least one
 * lane).
 */
export async function removeHeroLane(ctx, heroId, lane, adminId = null) {
  const outcome = await ctx.inTransaction(async connection => {
    const [[hero]] = await connection.query(
      "SELECT lanes_json FROM heroes WHERE id = ? FOR UPDATE",
      [heroId]
    );
    if (!hero) {
      return "missing";
    }
    const listed =
      typeof hero.lanes_json === "string" ? JSON.parse(hero.lanes_json) : hero.lanes_json;
    const [additions] = await connection.query(
      "SELECT lane FROM hero_lane_additions WHERE hero_id = ?",
      [heroId]
    );
    const [removals] = await connection.query(
      "SELECT lane FROM hero_lane_removals WHERE hero_id = ?",
      [heroId]
    );
    const gone = new Set(removals.map(item => item.lane));
    const effective = [
      ...listed.filter(item => !gone.has(item)),
      ...additions.map(item => item.lane).filter(item => !listed.includes(item))
    ];
    if (!effective.includes(lane)) {
      return "missing";
    }
    if (effective.length <= 1) {
      return "last";
    }
    await connection.execute("DELETE FROM hero_lane_additions WHERE hero_id = ? AND lane = ?", [
      heroId,
      lane
    ]);
    if (listed.includes(lane)) {
      await connection.execute(
        "INSERT IGNORE INTO hero_lane_removals (hero_id, lane, removed_by, created_at) VALUES (?, ?, ?, ?)",
        [heroId, lane, adminId, new Date().toISOString()]
      );
    }
    return "removed";
  });
  ctx.heroCache = null;
  return outcome;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { addHeroLane, removeHeroLane };
