// catalog store, items: createItem, updateItem, buildsUsing, deleteItem, and 1 more.
import { conflict, notFound } from "../../platform/errors.js";
import { dropImageIfOrphan, duplicate, parse, setTags } from "./catalog-store-parts.js";

// ---- items ----------------------------------------------------------------------------------
export async function createItem(ctx, item) {
  try {
    const id = await ctx.inTransaction(async connection => {
      const [result] = await connection.execute(
        "INSERT INTO catalog_items (name, category, shop_category, price, image_id, description, effects_json, stats_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          item.name,
          item.category,
          item.shopCategory ?? null,
          item.price,
          item.imageId,
          item.description,
          JSON.stringify(item.effects),
          JSON.stringify(item.stats),
          Date.now()
        ]
      );
      await setTags(connection, "item", result.insertId, item.tags);
      return result.insertId;
    });
    ctx.forget();
    return id;
  } catch (error) {
    duplicate(error, () => conflict("An item with this name already exists.", "duplicate_name"));
  }
}

export async function updateItem(ctx, id, item) {
  try {
    const done = await ctx.inTransaction(async connection => {
      const [[old]] = await connection.execute(
        "SELECT image_id, category FROM catalog_items WHERE id = ? FOR UPDATE",
        [id]
      );
      if (!old) {
        return false;
      }
      if (old.category !== item.category) {
        await ctx.refuseSlotChange([id]);
      }
      // a body that does not mention the shop category (an older page) leaves it as it was
      const keepShop = item.shopCategory === undefined;
      await connection.execute(
        `UPDATE catalog_items SET name = ?, category = ?, ${keepShop ? "" : "shop_category = ?, "}price = ?, image_id = ?, description = ?, effects_json = ?, stats_json = ?, updated_at = ? WHERE id = ?`,
        [
          item.name,
          item.category,
          ...(keepShop ? [] : [item.shopCategory]),
          item.price,
          item.imageId,
          item.description,
          JSON.stringify(item.effects),
          JSON.stringify(item.stats),
          Date.now(),
          id
        ]
      );
      await setTags(connection, "item", id, item.tags);
      if (old.image_id !== item.imageId) {
        await dropImageIfOrphan(connection, old.image_id);
      }
      return true;
    });
    ctx.forget();
    return done;
  } catch (error) {
    duplicate(error, () => conflict("An item with this name already exists.", "duplicate_name"));
  }
}

/** How many recommended builds contain this item or arcana. */
export async function buildsUsing(ctx, kind, id) {
  const [rows] = await ctx.pool.query("SELECT build_json FROM hero_build_sets");
  return rows.filter(row => {
    const build = parse(row.build_json, {});
    if (kind === "spell") {
      return (build.spells ?? []).includes(id);
    }
    return kind === "item"
      ? [...(build.items ?? []), ...(build.utility ?? []), ...(build.late ?? [])].includes(id)
      : ["red", "blue", "green"].some(color =>
          (build.arcana?.[color] ?? []).some(entry => entry.id === id)
        );
  }).length;
}

export async function deleteItem(ctx, id) {
  const used = await ctx.store.buildsUsing("item", id);
  if (used) {
    throw conflict(
      "This is used by {count} recommended builds: remove it from them first.",
      "in_use",
      { count: used }
    );
  }
  const done = await ctx.inTransaction(async connection => {
    const [[old]] = await connection.execute("SELECT image_id FROM catalog_items WHERE id = ?", [
      id
    ]);
    if (!old) {
      return false;
    }
    await connection.execute(
      "DELETE FROM entity_tags WHERE entity_type = 'item' AND entity_id = ?",
      [String(id)]
    );
    await connection.execute("DELETE FROM catalog_items WHERE id = ?", [id]);
    await dropImageIfOrphan(connection, old.image_id);
    return true;
  });
  ctx.forget();
  return done;
}

/**
 * Sorts many items at once: `changes` holds the slot (category) and/or the shop category to give
 * to all of them. Nothing changes unless every item exists and, when the slot changes, no
 * recommended build uses the items that move.
 */
export async function sortItems(ctx, ids, changes) {
  const done = await ctx.inTransaction(async connection => {
    const [rows] = await connection.query(
      "SELECT id, category FROM catalog_items WHERE id IN (?) FOR UPDATE",
      [ids]
    );
    if (rows.length !== ids.length) {
      throw notFound("Item not found.");
    }
    if (changes.category !== undefined) {
      const moving = rows.filter(row => row.category !== changes.category).map(row => row.id);
      if (moving.length) {
        await ctx.refuseSlotChange(moving);
      }
    }
    const sets = [];
    const values = [];
    if (changes.category !== undefined) {
      sets.push("category = ?");
      values.push(changes.category);
    }
    if (changes.shopCategory !== undefined) {
      sets.push("shop_category = ?");
      values.push(changes.shopCategory);
    }
    await connection.query(
      `UPDATE catalog_items SET ${sets.join(", ")}, updated_at = ? WHERE id IN (?)`,
      [...values, Date.now(), ids]
    );
    return ids.length;
  });
  ctx.forget();
  return done;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { createItem, updateItem, buildsUsing, deleteItem, sortItems };
