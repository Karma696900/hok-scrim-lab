// catalog store, tags: createTag, updateTag, deleteTag, mergeTag, saveTagGroups.
import { conflict } from "../../platform/errors.js";
import { tagConditionUsage } from "./usage.js";
import { duplicate, parse } from "./catalog-store-parts.js";
import { mergedClashes, retag } from "./tag-merge.js";

// ---- tags -----------------------------------------------------------------------------------
export async function createTag(ctx, tag) {
  try {
    const [result] = await ctx.pool.execute(
      "INSERT INTO tags (name, color, description, conflicts_json) VALUES (?, ?, ?, ?)",
      [tag.name, tag.color, tag.description, JSON.stringify(tag.conflicts)]
    );
    ctx.forget();
    return result.insertId;
  } catch (error) {
    duplicate(error, () => conflict("A tag with this name already exists.", "duplicate_name"));
  }
}

export async function updateTag(ctx, id, tag) {
  try {
    const [result] = await ctx.pool.execute(
      "UPDATE tags SET name = ?, color = ?, description = ?, conflicts_json = ? WHERE id = ?",
      [tag.name, tag.color, tag.description, JSON.stringify(tag.conflicts), id]
    );
    ctx.forget();
    return result.affectedRows > 0;
  } catch (error) {
    duplicate(error, () => conflict("A tag with this name already exists.", "duplicate_name"));
  }
}

/**
 * Removes the tag from everything (the link rows go with it) and from the clash lists of the
 * other tags.
 */
export async function deleteTag(ctx, id) {
  const used = tagConditionUsage(await ctx.store.usageData(), id);
  if (used) {
    throw conflict(
      "This tag is named in the conditions of {count} items or arcana: remove it from them first.",
      "in_use",
      { count: used }
    );
  }
  const done = await ctx.inTransaction(async connection => {
    const [result] = await connection.execute("DELETE FROM tags WHERE id = ?", [id]);
    if (!result.affectedRows) {
      return false;
    }
    const [others] = await connection.query("SELECT id, conflicts_json FROM tags");
    for (const row of others) {
      const list = parse(row.conflicts_json, []);
      if (list.includes(id)) {
        await connection.execute("UPDATE tags SET conflicts_json = ? WHERE id = ?", [
          JSON.stringify(list.filter(entry => entry !== id)),
          row.id
        ]);
      }
    }
    return true;
  });
  ctx.forget();
  return done;
}

/** The columns of the catalogue that hold conditions, by table. */
const WITH_CONDITIONS = {
  catalog_items: ["stats_json", "effects_json"],
  catalog_arcana: ["stats_json"]
};

/**
 * Merges the tag `from` into the tag `into`: the items, arcana and heroes that carry `from` carry
 * `into` (once), the conditions on `from` are on `into`, the clashes of both are kept, and `from` is
 * deleted. All in one transaction. False when one of the two does not exist.
 */
export async function mergeTag(ctx, from, into) {
  const done = await ctx.inTransaction(async connection => {
    const [tags] = await connection.query(
      "SELECT id, conflicts_json FROM tags WHERE id IN (?, ?) FOR UPDATE",
      [from, into]
    );
    if (tags.length !== 2) {
      return false;
    }
    await connection.execute(
      `INSERT IGNORE INTO entity_tags (entity_type, entity_id, tag_id)
       SELECT entity_type, entity_id, ? FROM entity_tags WHERE tag_id = ?`,
      [into, from]
    );
    for (const [table, columns] of Object.entries(WITH_CONDITIONS)) {
      const [rows] = await connection.query(`SELECT id, ${columns.join(", ")} FROM ${table}`);
      for (const row of rows) {
        const changed = columns.filter(column => row[column].includes('"tag"'));
        const values = changed.map(column =>
          JSON.stringify(retag(parse(row[column], []), from, into))
        );
        if (values.some((value, index) => value !== row[changed[index]])) {
          await connection.execute(
            `UPDATE ${table} SET ${changed.map(column => `${column} = ?`).join(", ")} WHERE id = ?`,
            [...values, row.id]
          );
        }
      }
    }
    const fromList = parse(tags.find(row => row.id === from).conflicts_json, []);
    const [all] = await connection.query("SELECT id, conflicts_json FROM tags WHERE id <> ?", [
      from
    ]);
    for (const row of all) {
      const list = parse(row.conflicts_json, []);
      const next = mergedClashes(row.id, list, from, into, fromList);
      if (JSON.stringify(next) !== JSON.stringify(list)) {
        await connection.execute("UPDATE tags SET conflicts_json = ? WHERE id = ?", [
          JSON.stringify(next),
          row.id
        ]);
      }
    }
    await connection.execute("DELETE FROM tags WHERE id = ?", [from]);
    return true;
  });
  ctx.forget();
  return done;
}

/** The names of the colour groups, as { color: name }: an empty name takes the row away. */
export async function saveTagGroups(ctx, groups) {
  await ctx.inTransaction(async connection => {
    for (const [color, name] of Object.entries(groups)) {
      await (name
        ? connection.execute(
            "INSERT INTO tag_groups (color, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)",
            [color, name]
          )
        : connection.execute("DELETE FROM tag_groups WHERE color = ?", [color]));
    }
  });
  ctx.forget();
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { createTag, updateTag, deleteTag, mergeTag, saveTagGroups };
