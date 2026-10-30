// hero store, metadata roster: readMetadata, writeMetadata, readHeroes, saveHeroes.

// ---- metadata and roster --------------------------------------------------------------------
export async function readMetadata(ctx, key) {
  const [rows] = await ctx.pool.execute("SELECT value FROM metadata WHERE meta_key = ?", [key]);
  return rows[0]?.value ?? null;
}

export async function writeMetadata(ctx, key, value) {
  await ctx.pool.execute(
    "INSERT INTO metadata (meta_key, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
    [key, String(value)]
  );
}

export async function readHeroes(ctx) {
  if (ctx.heroCache && ctx.heroCache.expires > Date.now()) {
    return ctx.heroCache.heroes;
  }
  const [rows] = await ctx.pool.query("SELECT * FROM heroes ORDER BY name");
  const [additions] = await ctx.pool.query(
    "SELECT hero_id, lane FROM hero_lane_additions ORDER BY created_at, lane"
  );
  const [removals] = await ctx.pool.query("SELECT hero_id, lane FROM hero_lane_removals");
  const parse = value => (typeof value === "string" ? JSON.parse(value) : value);
  const heroes = rows.map(hero => {
    const listed = parse(hero.lanes_json);
    const removed = removals.filter(item => item.hero_id === hero.id).map(item => item.lane);
    // A lane an administrator took away is hidden, but a hero never ends up with none (Camp may
    // have changed its lane since).
    const kept = listed.filter(lane => !removed.includes(lane));
    const manualLanes = additions
      .filter(item => item.hero_id === hero.id && !listed.includes(item.lane))
      .map(item => item.lane);
    const campLanes = kept.length || manualLanes.length ? kept : listed;
    return {
      id: hero.id,
      name: hero.name,
      image: hero.image,
      roles: parse(hero.roles_json),
      // Camp lists one lane per hero; lanes added by an admin are appended and tagged "manual";
      // lanes taken away are gone everywhere.
      lanes: [...campLanes, ...manualLanes],
      laneSources: Object.fromEntries([
        ...campLanes.map(lane => [lane, "camp"]),
        ...manualLanes.map(lane => [lane, "manual"])
      ]),
      sourceIds: parse(hero.source_ids_json),
      availableGlobal: Boolean(hero.available_global),
      sourceUpdated: hero.source_updated
    };
  });
  ctx.heroCache = { heroes, expires: Date.now() + 15_000 };
  return heroes;
}

export async function saveHeroes(ctx, heroes, sourceUpdated) {
  const timestamp = new Date().toISOString();
  await ctx.inTransaction(async connection => {
    for (const hero of heroes) {
      await connection.execute(
        `INSERT INTO heroes (id, name, image, roles_json, lanes_json, source_ids_json, available_global, source_updated, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), image=VALUES(image), roles_json=VALUES(roles_json), lanes_json=VALUES(lanes_json), source_ids_json=VALUES(source_ids_json), available_global=TRUE, source_updated=VALUES(source_updated), updated_at=VALUES(updated_at)`,
        [
          hero.id,
          hero.name,
          hero.image,
          JSON.stringify(hero.roles),
          JSON.stringify(hero.lanes),
          JSON.stringify(hero.sourceIds),
          sourceUpdated,
          timestamp
        ]
      );
    }
    const ids = heroes.map(hero => hero.id);
    if (ids.length) {
      await connection.query(
        `UPDATE heroes SET available_global = FALSE, updated_at = ? WHERE id NOT IN (${ids.map(() => "?").join(",")})`,
        [timestamp, ...ids]
      );
    }
    await connection.execute(
      "INSERT INTO metadata (meta_key, value) VALUES ('rosterUpdatedAt', ?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
      [timestamp]
    );
    await connection.execute(
      "INSERT INTO metadata (meta_key, value) VALUES ('rosterSourceUpdated', ?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
      [sourceUpdated]
    );
  });
  ctx.heroCache = null;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { readMetadata, writeMetadata, readHeroes, saveHeroes };
