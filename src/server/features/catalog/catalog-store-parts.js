// catalog store, small helpers: parse, forget, tagsOf, setTags, and 11 more.
import { ARCANA_COLORS } from "../../../shared/build-model.js";
import { conflict } from "../../platform/errors.js";
import { TAG_COLORS } from "./catalog-domain-stats.js";
import { randomUUID } from "node:crypto";

import { jsonColumn as parse } from "../../platform/database/json-column.js";

export { parse };

export const forget = ctx => {
  ctx.generation += 1;
  ctx.cache = null;
};

export const tagsOf = async (executor, type) => {
  const [rows] = await executor.query(
    "SELECT entity_id, tag_id FROM entity_tags WHERE entity_type = ? ORDER BY tag_id",
    [type]
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.entity_id)) {
      map.set(row.entity_id, []);
    }
    map.get(row.entity_id).push(row.tag_id);
  }
  return map;
};

export const setTags = async (connection, type, entityId, tagIds) => {
  await connection.execute("DELETE FROM entity_tags WHERE entity_type = ? AND entity_id = ?", [
    type,
    String(entityId)
  ]);
  if (tagIds.length) {
    await connection.query("INSERT INTO entity_tags (entity_type, entity_id, tag_id) VALUES ?", [
      tagIds.map(id => [type, String(entityId), id])
    ]);
  }
};

export const duplicate = (error, make) => {
  if (error.code === "ER_DUP_ENTRY") {
    throw make();
  }
  throw error;
};

export const presentItem = (row, tags) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  shopCategory: row.shop_category ?? null,
  price: row.price,
  imageId: row.image_id,
  description: row.description,
  effects: parse(row.effects_json, []),
  stats: parse(row.stats_json, []),
  tags: tags.get(String(row.id)) ?? []
});

export const presentArcana = (row, tags) => ({
  id: row.id,
  name: row.name,
  color: row.color,
  imageId: row.image_id,
  description: row.description,
  stats: parse(row.stats_json, []),
  tags: tags.get(String(row.id)) ?? []
});

export const presentSpell = row => ({
  id: row.id,
  name: row.name,
  imageId: row.image_id,
  description: row.description,
  cooldownSeconds: row.cooldown_seconds ?? null,
  unlockLevel: row.unlock_level ?? null
});

export async function dropImageIfOrphan(connection, imageId) {
  if (!imageId) {
    return;
  }
  const [[used]] = await connection.query(
    "SELECT (SELECT COUNT(*) FROM catalog_items WHERE image_id = ?) + (SELECT COUNT(*) FROM catalog_arcana WHERE image_id = ?) + (SELECT COUNT(*) FROM catalog_spells WHERE image_id = ?) AS n",
    [imageId, imageId, imageId]
  );
  if (!Number(used.n)) {
    await connection.execute("DELETE FROM catalog_images WHERE id = ?", [imageId]);
  }
}

/** How many recommended builds contain one of these items (a build keeps each item in the slot group it was written for). */
export async function buildsUsingAny(ctx, ids) {
  const wanted = new Set(ids);
  const [rows] = await ctx.pool.query("SELECT build_json FROM hero_build_sets");
  return rows.filter(row => {
    const build = parse(row.build_json, {});
    return [...(build.items ?? []), ...(build.utility ?? []), ...(build.late ?? [])].some(id =>
      wanted.has(id)
    );
  }).length;
}

/** The slot of an item cannot change while a recommended build has it where it is: the build would break. */
export async function refuseSlotChange(ctx, ids) {
  const used = await ctx.buildsUsingAny(ids);
  if (used) {
    throw conflict(
      "This is used by {count} recommended builds: remove it from them first.",
      "in_use",
      { count: used }
    );
  }
}

/** Everything the pages need, in one object. Cached for 30 s and dropped on any write. */
export async function readCatalog(ctx) {
  if (ctx.cache && ctx.cache.expires > Date.now()) {
    return ctx.cache.value;
  }
  const readAt = ctx.generation;
  const [[stats], [tags], [groups], [items], [arcana], [spells], itemTags, arcanaTags] =
    await Promise.all([
      ctx.pool.query("SELECT * FROM game_stats ORDER BY sort_order, id"),
      ctx.pool.query("SELECT * FROM tags ORDER BY name"),
      ctx.pool.query("SELECT color, name FROM tag_groups"),
      ctx.pool.query("SELECT * FROM catalog_items ORDER BY name"),
      // by colour in the order of ARCANA_COLORS (red, blue, green: shared/build-model.js compareArcana says the same), then by name
      ctx.pool.query(
        `SELECT * FROM catalog_arcana ORDER BY FIELD(color, ${ARCANA_COLORS.map(() => "?").join(", ")}), name`,
        ARCANA_COLORS
      ),
      ctx.pool.query("SELECT * FROM catalog_spells ORDER BY name"),
      tagsOf(ctx.pool, "item"),
      tagsOf(ctx.pool, "arcana")
    ]);
  const value = {
    stats: stats.map(row => ({
      id: row.id,
      name: row.name,
      unit: row.unit,
      sortOrder: row.sort_order,
      options: parse(row.options_json, [])
    })),
    tags: tags.map(row => ({
      id: row.id,
      name: row.name,
      color: row.color,
      description: row.description,
      conflicts: parse(row.conflicts_json, [])
    })),
    // the name of the group of each colour of tag, "" while nobody named it
    tagGroups: Object.fromEntries(
      TAG_COLORS.map(color => [color, groups.find(row => row.color === color)?.name ?? ""])
    ),
    items: items.map(row => presentItem(row, itemTags)),
    arcana: arcana.map(row => presentArcana(row, arcanaTags)),
    spells: spells.map(presentSpell)
  };
  if (readAt === ctx.generation) {
    ctx.cache = { value, expires: Date.now() + 30_000 };
  }
  return value;
}

// ---- pictures -------------------------------------------------------------------------------
export async function saveImage(ctx, bytes) {
  const id = randomUUID();
  await ctx.pool.execute(
    "INSERT INTO catalog_images (id, mime, data, created_at) VALUES (?, 'image/webp', ?, ?)",
    [id, bytes, Date.now()]
  );
  return id;
}

export async function getImage(ctx, id) {
  const [[row]] = await ctx.pool.execute("SELECT mime, data FROM catalog_images WHERE id = ?", [
    id
  ]);
  return row ? { mime: row.mime, data: row.data } : null;
}

export async function imageIds(ctx) {
  const [rows] = await ctx.pool.query("SELECT id FROM catalog_images");
  return new Set(rows.map(row => row.id));
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  forget,
  buildsUsingAny,
  refuseSlotChange,
  readCatalog,
  saveImage,
  getImage,
  imageIds
};
