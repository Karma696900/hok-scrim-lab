// catalog store, arcana: createArcana, updateArcana, deleteArcana.
import { conflict } from "../../platform/errors.js";
import { dropImageIfOrphan, duplicate, setTags } from "./catalog-store-parts.js";

// ---- arcana ---------------------------------------------------------------------------------
export async function createArcana(ctx, piece) {
  try {
    const id = await ctx.inTransaction(async connection => {
      const [result] = await connection.execute(
        "INSERT INTO catalog_arcana (name, color, image_id, description, stats_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
          piece.name,
          piece.color,
          piece.imageId,
          piece.description,
          JSON.stringify(piece.stats),
          Date.now()
        ]
      );
      await setTags(connection, "arcana", result.insertId, piece.tags);
      return result.insertId;
    });
    ctx.forget();
    return id;
  } catch (error) {
    duplicate(error, () => conflict("An arcana with this name already exists.", "duplicate_name"));
  }
}

export async function updateArcana(ctx, id, piece) {
  try {
    const done = await ctx.inTransaction(async connection => {
      const [[old]] = await connection.execute(
        "SELECT image_id FROM catalog_arcana WHERE id = ? FOR UPDATE",
        [id]
      );
      if (!old) {
        return false;
      }
      await connection.execute(
        "UPDATE catalog_arcana SET name = ?, color = ?, image_id = ?, description = ?, stats_json = ?, updated_at = ? WHERE id = ?",
        [
          piece.name,
          piece.color,
          piece.imageId,
          piece.description,
          JSON.stringify(piece.stats),
          Date.now(),
          id
        ]
      );
      await setTags(connection, "arcana", id, piece.tags);
      if (old.image_id !== piece.imageId) {
        await dropImageIfOrphan(connection, old.image_id);
      }
      return true;
    });
    ctx.forget();
    return done;
  } catch (error) {
    duplicate(error, () => conflict("An arcana with this name already exists.", "duplicate_name"));
  }
}

export async function deleteArcana(ctx, id) {
  const used = await ctx.store.buildsUsing("arcana", id);
  if (used) {
    throw conflict(
      "This is used by {count} recommended builds: remove it from them first.",
      "in_use",
      { count: used }
    );
  }
  const done = await ctx.inTransaction(async connection => {
    const [[old]] = await connection.execute("SELECT image_id FROM catalog_arcana WHERE id = ?", [
      id
    ]);
    if (!old) {
      return false;
    }
    await connection.execute(
      "DELETE FROM entity_tags WHERE entity_type = 'arcana' AND entity_id = ?",
      [String(id)]
    );
    await connection.execute("DELETE FROM catalog_arcana WHERE id = ?", [id]);
    await dropImageIfOrphan(connection, old.image_id);
    return true;
  });
  ctx.forget();
  return done;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { createArcana, updateArcana, deleteArcana };
