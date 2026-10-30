// account store, create local user: createLocalUser, getProfile, completeProfile, updateName, and 12 more.
import { conflict } from "../../platform/errors.js";
import { newTag } from "../../platform/database/migrations/009-profiles.js";
import { randomUUID } from "node:crypto";

export async function createLocalUser(
  ctx,
  { email, loginEmail, name, passwordHash, verified = false }
) {
  const id = randomUUID();
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const tag = newTag();
    try {
      await ctx.pool.execute(
        "INSERT INTO users (id, google_subject, email, login_email, name, picture, is_guest, email_verified, password_hash, password_changed_at, tag, avatar_kind, profile_complete, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, '', FALSE, ?, ?, ?, ?, 'none', TRUE, ?, ?)",
        [id, email, loginEmail, name, verified, passwordHash, now, tag, now, now]
      );
      return {
        id,
        email,
        name,
        tag,
        picture: "",
        isGuest: false,
        emailVerified: verified,
        mfaEnabled: false,
        viaGoogle: false
      };
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY") {
        throw error;
      }
      if (/uq_users_tag/.test(error.message)) {
        continue;
      } // that tag is taken: draw another
      throw conflict("An account with this email already exists.", "email_taken");
    }
  }
  throw new Error("Could not draw a free tag.");
}

/** The profile of an account: pseudo, tag, avatar choice and the Google photo it could use. */
export async function getProfile(ctx, userId) {
  const [rows] = await ctx.pool.execute(
    "SELECT id, tag, name, picture, google_picture, avatar_kind, profile_complete, google_subject IS NOT NULL AS via_google FROM users WHERE id = ? AND is_guest = FALSE",
    [userId]
  );
  return rows[0] ?? null;
}

/**
 * Google account: pseudo + password chosen by the player (their Google name is never used).
 * Only once: a password already set is never overwritten here.
 */
export async function completeProfile(ctx, userId, { name, passwordHash, loginEmail }) {
  const now = new Date().toISOString();
  try {
    const [result] = await ctx.pool.execute(
      "UPDATE users SET name = ?, password_hash = ?, login_email = ?, password_changed_at = ?, profile_complete = TRUE, updated_at = ? WHERE id = ? AND profile_complete = FALSE AND password_hash IS NULL",
      [name, passwordHash, loginEmail, now, now, userId]
    );
    return result.affectedRows === 1;
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw conflict("An account with this email already exists.", "email_taken");
    }
    throw error;
  }
}

export async function updateName(ctx, userId, name) {
  await ctx.pool.execute(
    "UPDATE users SET name = ?, updated_at = ? WHERE id = ? AND is_guest = FALSE",
    [name, new Date().toISOString(), userId]
  );
}

/**
 * kind: 'none' | 'google' | 'custom'. picture is the address shown everywhere (the Google URL,
 * or /avatars/<tag>?v=...).
 */
export async function setAvatar(ctx, userId, { kind, picture, bytes = null, mime = "image/webp" }) {
  await ctx.inTransaction(async connection => {
    if (kind === "custom") {
      await connection.execute(
        "INSERT INTO user_avatars (user_id, mime, data, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data), updated_at = VALUES(updated_at)",
        [userId, mime, bytes, Date.now()]
      );
    } else {
      await connection.execute("DELETE FROM user_avatars WHERE user_id = ?", [userId]);
    }
    await connection.execute(
      "UPDATE users SET avatar_kind = ?, picture = ?, updated_at = ? WHERE id = ?",
      [kind, picture, new Date().toISOString(), userId]
    );
  });
}

export async function getAvatar(ctx, tag) {
  const [rows] = await ctx.pool.execute(
    "SELECT a.mime, a.data, a.updated_at FROM user_avatars a JOIN users u ON u.id = a.user_id WHERE u.tag = ? AND u.avatar_kind = 'custom'",
    [tag]
  );
  return rows[0]
    ? { mime: rows[0].mime, data: rows[0].data, updatedAt: Number(rows[0].updated_at) }
    : null;
}

export async function getLoginUser(ctx, loginEmail) {
  const [rows] = await ctx.pool.execute(
    "SELECT id, email, name, picture, tag, profile_complete, password_hash, email_verified, mfa_enabled, mfa_secret_enc, mfa_last_step, failed_logins, locked_until FROM users WHERE login_email = ? AND is_guest = FALSE",
    [loginEmail]
  );
  return rows[0] ?? null;
}

export async function getAuthUser(ctx, id) {
  const [rows] = await ctx.pool.execute(
    "SELECT id, email, name, picture, tag, profile_complete, password_hash, email_verified, mfa_enabled, mfa_secret_enc, mfa_last_step, failed_logins, locked_until, google_subject IS NOT NULL AS via_google FROM users WHERE id = ? AND is_guest = FALSE",
    [id]
  );
  return rows[0] ?? null;
}

/**
 * Counts a failed attempt and locks the account progressively: 15 min after 5, doubling every 5
 * more, 24 h at most.
 */
export async function recordLoginFailure(ctx, userId, { now = Date.now() } = {}) {
  return ctx.inTransaction(async connection => {
    const [rows] = await connection.execute(
      "SELECT failed_logins FROM users WHERE id = ? FOR UPDATE",
      [userId]
    );
    const failed = (rows[0]?.failed_logins ?? 0) + 1;
    const lockMs =
      failed >= 5 ? Math.min(15 * 60_000 * 2 ** Math.floor((failed - 5) / 5), 24 * 3_600_000) : 0;
    await connection.execute("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?", [
      failed,
      lockMs ? now + lockMs : 0,
      userId
    ]);
    return { failed, lockedUntil: lockMs ? now + lockMs : 0 };
  });
}

export async function clearLoginFailures(ctx, userId) {
  await ctx.pool.execute("UPDATE users SET failed_logins = 0, locked_until = 0 WHERE id = ?", [
    userId
  ]);
}

export async function setPassword(ctx, userId, passwordHash) {
  const now = new Date().toISOString();
  await ctx.pool.execute(
    "UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?",
    [passwordHash, now, now, userId]
  );
}

export async function enableMfa(ctx, userId, encryptedSecret, step, recoveryHashes) {
  await ctx.inTransaction(async connection => {
    await connection.execute(
      "UPDATE users SET mfa_enabled = TRUE, mfa_secret_enc = ?, mfa_last_step = ? WHERE id = ?",
      [encryptedSecret, step, userId]
    );
    await connection.execute("DELETE FROM mfa_recovery_codes WHERE user_id = ?", [userId]);
    if (recoveryHashes.length) {
      await connection.query("INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES ?", [
        recoveryHashes.map(hash => [userId, hash])
      ]);
    }
  });
}

/**
 * Compare-and-set: a TOTP time step is accepted once (replay protection, also against parallel
 * requests).
 */
export async function acceptMfaStep(ctx, userId, step) {
  const [result] = await ctx.pool.execute(
    "UPDATE users SET mfa_last_step = ? WHERE id = ? AND (mfa_last_step IS NULL OR mfa_last_step < ?)",
    [step, userId, step]
  );
  return result.affectedRows === 1;
}

export async function replaceRecoveryCodes(ctx, userId, hashes) {
  await ctx.inTransaction(async connection => {
    await connection.execute("DELETE FROM mfa_recovery_codes WHERE user_id = ?", [userId]);
    await connection.query("INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES ?", [
      hashes.map(hash => [userId, hash])
    ]);
  });
}

export async function consumeRecoveryCode(ctx, userId, hash) {
  const [result] = await ctx.pool.execute(
    "UPDATE mfa_recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL",
    [Date.now(), userId, hash]
  );
  return result.affectedRows === 1;
}

export async function countRecoveryCodes(ctx, userId) {
  const [[row]] = await ctx.pool.execute(
    "SELECT COUNT(*) AS remaining FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL",
    [userId]
  );
  return Number(row.remaining);
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  createLocalUser,
  getProfile,
  completeProfile,
  updateName,
  setAvatar,
  getAvatar,
  getLoginUser,
  getAuthUser,
  recordLoginFailure,
  clearLoginFailures,
  setPassword,
  enableMfa,
  acceptMfaStep,
  replaceRecoveryCodes,
  consumeRecoveryCode,
  countRecoveryCodes
};
