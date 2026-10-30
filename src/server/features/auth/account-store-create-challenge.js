// account store, create challenge: createChallenge, getChallenge, bumpChallengeAttempts, setChallengeSecret, and 5 more.

export async function createChallenge(ctx, { tokenHash, userId, kind, method, ttlMs }) {
  const now = Date.now();
  await ctx.pool.execute("DELETE FROM auth_challenges WHERE user_id = ?", [userId]); // one open challenge per account
  await ctx.pool.execute(
    "INSERT INTO auth_challenges (token_hash, user_id, kind, method, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    [tokenHash, userId, kind, method, now, now + ttlMs]
  );
}

export async function getChallenge(ctx, tokenHash) {
  const [rows] = await ctx.pool.execute(
    "SELECT * FROM auth_challenges WHERE token_hash = ? AND expires_at > ?",
    [tokenHash, Date.now()]
  );
  return rows[0] ?? null;
}

export async function bumpChallengeAttempts(ctx, tokenHash) {
  await ctx.pool.execute(
    "UPDATE auth_challenges SET attempts = attempts + 1 WHERE token_hash = ?",
    [tokenHash]
  );
  const [[row]] = await ctx.pool.execute(
    "SELECT attempts FROM auth_challenges WHERE token_hash = ?",
    [tokenHash]
  );
  return row?.attempts ?? 99;
}

export async function setChallengeSecret(ctx, tokenHash, encrypted) {
  await ctx.pool.execute("UPDATE auth_challenges SET pending_secret_enc = ? WHERE token_hash = ?", [
    encrypted,
    tokenHash
  ]);
}

export async function deleteChallenge(ctx, tokenHash) {
  await ctx.pool.execute("DELETE FROM auth_challenges WHERE token_hash = ?", [tokenHash]);
}

export async function deleteSessionsForUser(ctx, userId, exceptTokenHash = null) {
  const [result] = await ctx.pool.execute(
    "DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?",
    [userId, exceptTokenHash ?? ""]
  );
  return result.affectedRows;
}

export async function logAuthEvent(ctx, userId, event, detail = "", ip = "") {
  await ctx.pool
    .execute(
      "INSERT INTO auth_events (user_id, event, detail, ip, created_at) VALUES (?, ?, ?, ?, ?)",
      [userId, event, String(detail).slice(0, 200), String(ip).slice(0, 45), Date.now()]
    )
    .catch(() => {});
}

export async function recentAuthEvents(ctx, userId, limit = 15) {
  const [rows] = await ctx.pool.query(
    "SELECT event, detail, ip, created_at FROM auth_events WHERE user_id = ? ORDER BY id DESC LIMIT ?",
    [userId, limit]
  );
  return rows.map(row => ({
    event: row.event,
    detail: row.detail,
    ip: row.ip,
    at: Number(row.created_at)
  }));
}

export async function purgeAuth(ctx, now = Date.now()) {
  await ctx.pool.execute("DELETE FROM auth_challenges WHERE expires_at <= ?", [now]);
  await ctx.pool.execute("DELETE FROM auth_events WHERE created_at < ?", [now - 180 * 86_400_000]);
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  createChallenge,
  getChallenge,
  bumpChallengeAttempts,
  setChallengeSecret,
  deleteChallenge,
  deleteSessionsForUser,
  logAuthEvent,
  recentAuthEvents,
  purgeAuth
};
