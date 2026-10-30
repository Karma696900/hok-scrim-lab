// catalog store, tags: createTag, updateTag, deleteTag.
import { conflict } from "../../platform/errors.js";
import { tagConditionUsage } from "./usage.js";
import { duplicate, parse } from "./catalog-store-parts.js";

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

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { createTag, updateTag, deleteTag };
