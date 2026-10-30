// session store, small helpers: upsertGoogleUser, createGuestUser, getUserByEmail, getSession, and 7 more.
import { EDITOR_LABEL } from "../../../shared/access-rules.js";
import { SHARE_KINDS } from "../sharing/sharing-domain.js";
import { newTag } from "../../platform/database/migrations/009-profiles.js";
import { randomUUID } from "node:crypto";

/**
 * The account of a Google identity. Google's NAME is never used (the player chooses a pseudo);
 * its photo is kept as the default avatar until the player picks another. A new account starts
 * with an incomplete profile: pseudo and password come next.
 */
export async function upsertGoogleUser(ctx, { googleSubject, email, picture }) {
  const now = new Date().toISOString();
  const columns =
    "id, email, name, picture, google_picture, avatar_kind, tag, profile_complete, mfa_enabled";
  const [existing] = await ctx.pool.execute(
    `SELECT ${columns} FROM users WHERE google_subject = ?`,
    [googleSubject]
  );
  if (existing[0]) {
    await ctx.pool.execute(
      "UPDATE users SET email = ?, google_picture = ?, picture = IF(avatar_kind = 'google', ?, picture), email_verified = TRUE, updated_at = ? WHERE id = ?",
      [email, picture || "", picture || "", now, existing[0].id]
    );
  } else {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await ctx.pool.execute(
          "INSERT INTO users (id, google_subject, email, name, picture, google_picture, avatar_kind, tag, is_guest, email_verified, profile_complete, created_at, updated_at) VALUES (?, ?, ?, 'Player', ?, ?, ?, ?, FALSE, TRUE, FALSE, ?, ?)",
          [
            randomUUID(),
            googleSubject,
            email,
            picture || "",
            picture || "",
            picture ? "google" : "none",
            newTag(),
            now,
            now
          ]
        );
        break;
      } catch (error) {
        if (error.code !== "ER_DUP_ENTRY" || !/uq_users_tag/.test(error.message)) {
          throw error;
        }
      }
    }
  }
  const [rows] = await ctx.pool.execute(`SELECT ${columns} FROM users WHERE google_subject = ?`, [
    googleSubject
  ]);
  return rows[0] ?? null;
}

export async function createGuestUser(ctx) {
  const now = new Date().toISOString();
  const id = randomUUID();
  await ctx.pool.execute(
    "INSERT INTO users (id, google_subject, email, name, picture, is_guest, created_at, updated_at) VALUES (?, NULL, '', 'Guest', '', TRUE, ?, ?)",
    [id, now, now]
  );
  return { id, email: "", name: "Guest", picture: "", isGuest: true };
}

export async function getUserByEmail(ctx, email) {
  const [rows] = await ctx.pool.execute(
    "SELECT id, email, name FROM users WHERE LOWER(email) = LOWER(?) AND is_guest = FALSE",
    [email]
  );
  return rows;
}

export async function getSession(ctx, tokenHash) {
  const [rows] = await ctx.pool.execute(
    `SELECT ${USER_COLUMNS}, sessions.created_at, sessions.last_seen_at, sessions.expires_at
          FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    [EDITOR_LABEL, tokenHash, Date.now()]
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    user: userFromRow(row),
    createdAt: Number(row.created_at),
    lastSeenAt: Number(row.last_seen_at),
    expiresAt: Number(row.expires_at)
  };
}

export async function createSession(ctx, tokenHash, userId, expiresAt, now = Date.now()) {
  await ctx.pool.execute(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
    [tokenHash, userId, expiresAt, now, now]
  );
}

export async function refreshSession(ctx, tokenHash, expiresAt, now = Date.now()) {
  await ctx.pool.execute(
    "UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE token_hash = ?",
    [expiresAt, now, tokenHash]
  );
}

export async function deleteSession(ctx, tokenHash) {
  await ctx.pool.execute("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
}

export async function purgeExpired(ctx, now = Date.now()) {
  const [sessions] = await ctx.pool.execute("DELETE FROM sessions WHERE expires_at <= ?", [now]);
  await ctx.accounts.purgeAuth(now);
  const [guests] = await ctx.pool
    .query(`DELETE u FROM users u LEFT JOIN sessions s ON s.user_id = u.id
          WHERE u.is_guest = TRUE AND s.token_hash IS NULL
            AND NOT EXISTS (SELECT 1 FROM series WHERE owner_user_id = u.id)
            AND NOT EXISTS (SELECT 1 FROM tier_lists WHERE owner_user_id = u.id)
            AND NOT EXISTS (SELECT 1 FROM series_members WHERE user_id = u.id)
            AND NOT EXISTS (SELECT 1 FROM tier_list_members WHERE user_id = u.id)`);
  return { sessions: sessions.affectedRows, guests: guests.affectedRows };
}

/** Moves everything a guest owns or was shared onto a Google account, then removes the guest. */
export async function mergeGuestInto(ctx, guestId, userId) {
  if (guestId === userId) {
    return;
  }
  await ctx.inTransaction(async connection => {
    await connection.execute("UPDATE series SET owner_user_id = ? WHERE owner_user_id = ?", [
      userId,
      guestId
    ]);
    await connection.execute("UPDATE tier_lists SET owner_user_id = ? WHERE owner_user_id = ?", [
      userId,
      guestId
    ]);
    for (const { table, members, fk } of Object.values(SHARE_KINDS)) {
      await connection.execute(`UPDATE IGNORE ${members} SET user_id = ? WHERE user_id = ?`, [
        userId,
        guestId
      ]);
      await connection.execute(`DELETE FROM ${members} WHERE user_id = ?`, [guestId]);
      // The account must not also be a member of a resource it owns.
      await connection.query(
        `DELETE m FROM ${members} m JOIN ${table} r ON r.id = m.${fk} WHERE m.user_id = ? AND r.owner_user_id = ?`,
        [userId, userId]
      );
    }
    await connection.execute("DELETE FROM users WHERE id = ? AND is_guest = TRUE", [guestId]);
  });
}

/** The columns of the account that a session (or an API key) loads; the first placeholder is the editor label. */
export const USER_COLUMNS = `users.id, users.email, users.name, users.picture, users.tag, users.avatar_kind, users.profile_complete, COALESCE(users.google_picture, '') <> '' AS has_google_photo, users.is_guest, users.email_verified, users.mfa_enabled, users.google_subject IS NOT NULL AS via_google,
  EXISTS (SELECT 1 FROM user_labels WHERE user_labels.user_id = users.id AND user_labels.label = ?) AS is_contributor`;

/** The account as the rest of the server sees it, from a row selected with USER_COLUMNS. */
export const userFromRow = row => ({
  id: row.id,
  email: row.email,
  name: row.name,
  picture: row.picture,
  tag: row.tag,
  avatarKind: row.avatar_kind,
  hasGooglePhoto: Boolean(row.has_google_photo),
  profileComplete: Boolean(row.profile_complete),
  isGuest: Boolean(row.is_guest),
  emailVerified: Boolean(row.email_verified),
  mfaEnabled: Boolean(row.mfa_enabled),
  viaGoogle: Boolean(row.via_google),
  isContributor: Boolean(row.is_contributor)
});

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  upsertGoogleUser,
  createGuestUser,
  getUserByEmail,
  getSession,
  createSession,
  refreshSession,
  deleteSession,
  purgeExpired,
  mergeGuestInto
};
