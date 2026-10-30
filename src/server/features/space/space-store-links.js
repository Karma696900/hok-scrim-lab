// space store, links: listSpaceLinks, createSpaceLink, deleteSpaceLink, openSpaceLink.
import { LINKS_MAX, TOKEN_PREFIX } from "./space-domain.js";
import { conflict } from "../../platform/errors.js";
import { hashToken } from "../sharing/sharing-domain.js";
import { randomBytes, randomUUID } from "node:crypto";
import { presentLink } from "./space-store-parts.js";

// ---- the links ------------------------------------------------------------------------------
export async function listSpaceLinks(ctx, userId) {
  const [rows] = await ctx.pool.execute(
    "SELECT * FROM space_links WHERE user_id = ? ORDER BY created_at DESC, id",
    [userId]
  );
  return rows.map(presentLink);
}

/** Gives a link. Its token is returned now and nowhere else: only its hash is kept. */
export async function createSpaceLink(ctx, userId, { label, sections, expiresAt }) {
  return ctx.inTransaction(async connection => {
    await connection.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
    const [[row]] = await connection.query(
      "SELECT COUNT(*) AS total FROM space_links WHERE user_id = ?",
      [userId]
    );
    if (Number(row.total) >= LINKS_MAX) {
      throw conflict("You can give at most {max} links. Remove one first.", "quota_exceeded", {
        max: LINKS_MAX
      });
    }
    const id = randomUUID();
    const token = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
    const now = Date.now();
    await connection.execute(
      "INSERT INTO space_links (id, user_id, token_hash, label, sections, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, userId, hashToken(token), label, sections.join(","), now, expiresAt]
    );
    return {
      token,
      link: presentLink({
        id,
        label,
        sections: sections.join(","),
        created_at: now,
        expires_at: expiresAt,
        opened_at: null,
        opened_count: 0
      })
    };
  });
}

export async function deleteSpaceLink(ctx, userId, id) {
  const [result] = await ctx.pool.execute("DELETE FROM space_links WHERE id = ? AND user_id = ?", [
    id,
    userId
  ]);
  return result.affectedRows > 0;
}

/**
 * Opens a link: who it is from and what it shares, or null when it is unknown, removed or over.
 * Counts the opening.
 */
export async function openSpaceLink(ctx, token, now) {
  const [rows] = await ctx.pool.execute(
    "SELECT l.id, l.user_id, l.sections, l.expires_at, u.name, u.tag, u.picture FROM space_links l JOIN users u ON u.id = l.user_id WHERE l.token_hash = ?",
    [hashToken(token)]
  );
  const row = rows[0];
  if (!row || (row.expires_at !== null && Number(row.expires_at) <= now)) {
    return null;
  }
  await ctx.pool.execute(
    "UPDATE space_links SET opened_at = ?, opened_count = opened_count + 1 WHERE id = ?",
    [now, row.id]
  );
  return {
    userId: row.user_id,
    sections: String(row.sections).split(",").filter(Boolean),
    owner: { name: row.name, tag: row.tag, picture: row.picture || null }
  };
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { listSpaceLinks, createSpaceLink, deleteSpaceLink, openSpaceLink };
