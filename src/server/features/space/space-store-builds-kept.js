// space store, builds kept: listSpaceBuilds, addSpaceBuild, deleteSpaceBuild.
import { BUILDS_IN_ALL_MAX, BUILDS_PER_HERO_MAX } from "./space-domain.js";
import { badRequest } from "../../platform/errors.js";
import { randomUUID } from "node:crypto";
import { presentBuild } from "./space-store-parts.js";

// ---- the builds kept on the account ---------------------------------------------------------
export async function listSpaceBuilds(ctx, userId) {
  const [rows] = await ctx.pool.execute(
    "SELECT * FROM space_builds WHERE user_id = ? ORDER BY updated_at DESC, id",
    [userId]
  );
  return rows.map(presentBuild);
}

export async function addSpaceBuild(ctx, userId, entry) {
  return ctx.inTransaction(async connection => {
    // the account row is the lock of its builds: two requests at once cannot pass a limit
    await connection.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
    const [[row]] = await connection.query(
      "SELECT COUNT(*) AS total, COALESCE(SUM(hero_id = ?), 0) AS ofHero FROM space_builds WHERE user_id = ?",
      [entry.heroId, userId]
    );
    if (Number(row.total) >= BUILDS_IN_ALL_MAX) {
      throw badRequest("You can keep at most {max} builds in your space.", "quota_exceeded", {
        max: BUILDS_IN_ALL_MAX
      });
    }
    if (Number(row.ofHero) >= BUILDS_PER_HERO_MAX) {
      throw badRequest("You can keep at most {max} builds for one hero.", "quota_exceeded", {
        max: BUILDS_PER_HERO_MAX
      });
    }
    const now = Date.now();
    const id = randomUUID();
    await connection.execute(
      "INSERT INTO space_builds (id, user_id, hero_id, name, level, build_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, userId, entry.heroId, entry.name, entry.level, JSON.stringify(entry.build), now, now]
    );
    return presentBuild({
      id,
      hero_id: entry.heroId,
      name: entry.name,
      level: entry.level,
      build_json: entry.build,
      updated_at: now
    });
  });
}

export async function deleteSpaceBuild(ctx, userId, id) {
  const [result] = await ctx.pool.execute("DELETE FROM space_builds WHERE id = ? AND user_id = ?", [
    id,
    userId
  ]);
  return result.affectedRows > 0;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { listSpaceBuilds, addSpaceBuild, deleteSpaceBuild };
