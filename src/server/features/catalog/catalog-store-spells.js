// catalog store, spells: createSpell, updateSpell, deleteSpell.
import { conflict } from "../../platform/errors.js";
import { dropImageIfOrphan, duplicate } from "./catalog-store-parts.js";

// ---- spells -----------------------------------------------------------------------------------
export async function createSpell(ctx, spell) {
  try {
    const [result] = await ctx.pool.execute(
      "INSERT INTO catalog_spells (name, image_id, description, cooldown_seconds, unlock_level, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        spell.name,
        spell.imageId,
        spell.description,
        spell.cooldownSeconds,
        spell.unlockLevel,
        Date.now()
      ]
    );
    ctx.forget();
    return result.insertId;
  } catch (error) {
    duplicate(error, () => conflict("A spell with this name already exists.", "duplicate_name"));
  }
}

export async function updateSpell(ctx, id, spell) {
  try {
    const done = await ctx.inTransaction(async connection => {
      const [[old]] = await connection.execute(
        "SELECT image_id FROM catalog_spells WHERE id = ? FOR UPDATE",
        [id]
      );
      if (!old) {
        return false;
      }
      await connection.execute(
        "UPDATE catalog_spells SET name = ?, image_id = ?, description = ?, cooldown_seconds = ?, unlock_level = ?, updated_at = ? WHERE id = ?",
        [
          spell.name,
          spell.imageId,
          spell.description,
          spell.cooldownSeconds,
          spell.unlockLevel,
          Date.now(),
          id
        ]
      );
      if (old.image_id !== spell.imageId) {
        await dropImageIfOrphan(connection, old.image_id);
      }
      return true;
    });
    ctx.forget();
    return done;
  } catch (error) {
    duplicate(error, () => conflict("A spell with this name already exists.", "duplicate_name"));
  }
}

export async function deleteSpell(ctx, id) {
  const used = await ctx.store.buildsUsing("spell", id);
  if (used) {
    throw conflict(
      "This is used by {count} recommended builds: remove it from them first.",
      "in_use",
      { count: used }
    );
  }
  const done = await ctx.inTransaction(async connection => {
    const [[old]] = await connection.execute("SELECT image_id FROM catalog_spells WHERE id = ?", [
      id
    ]);
    if (!old) {
      return false;
    }
    await connection.execute("DELETE FROM catalog_spells WHERE id = ?", [id]);
    await dropImageIfOrphan(connection, old.image_id);
    return true;
  });
  ctx.forget();
  return done;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { createSpell, updateSpell, deleteSpell };
