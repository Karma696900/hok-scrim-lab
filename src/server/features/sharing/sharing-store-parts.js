// sharing store, small helpers: countOwned, assertQuota, createInvite, acceptInvite, and 5 more.
import { HttpError, badRequest, conflict, notFound } from "../../platform/errors.js";
import { SHARE_KINDS, hashToken } from "./sharing-domain.js";
import { randomBytes } from "node:crypto";

export async function countOwned(ctx, kind, ownerId) {
  const [[row]] = await ctx.pool.execute(
    `SELECT COUNT(*) AS total FROM ${SHARE_KINDS[kind].table} WHERE owner_user_id = ?`,
    [ownerId]
  );
  return Number(row.total);
}

export async function assertQuota(ctx, kind, user) {
  const limit =
    kind === "series"
      ? user.isGuest
        ? ctx.limits.guestSeries
        : ctx.limits.userSeries
      : user.isGuest
        ? ctx.limits.guestTierLists
        : ctx.limits.userTierLists;
  if ((await ctx.store.countOwned(kind, user.id)) >= limit) {
    throw new HttpError(
      403,
      "quota_exceeded",
      kind === "series"
        ? "You reached the limit of {limit} series. Delete some first."
        : "You reached the limit of {limit} tier lists. Delete some first.",
      {},
      { limit }
    );
  }
}

export async function createInvite(ctx, kind, resourceId, ownerId, { role, ttlMs, maxUses }) {
  const spec = SHARE_KINDS[kind];
  const [owned] = await ctx.pool.execute(
    `SELECT 1 FROM ${spec.table} WHERE id = ? AND owner_user_id = ?`,
    [resourceId, ownerId]
  );
  if (!owned.length) {
    throw notFound("Not found.");
  }
  if (kind === "series") {
    const [online] = await ctx.pool.execute("SELECT 1 FROM online_series WHERE series_id = ?", [
      resourceId
    ]);
    if (online.length && role !== "viewer") {
      throw badRequest("Online series can only be shared as read-only.");
    }
  }
  const token = `${spec.prefix}_${randomBytes(24).toString("base64url")}`;
  const expiresAt = Date.now() + ttlMs;
  await ctx.pool.execute(
    `INSERT INTO ${spec.invites} (token_hash, ${spec.fk}, role, created_by, created_at, expires_at, max_uses) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [hashToken(token), resourceId, role, ownerId, new Date().toISOString(), expiresAt, maxUses]
  );
  return { token, role, expiresAt, maxUses };
}

export async function acceptInvite(ctx, token, userId) {
  const spec = Object.values(SHARE_KINDS).find(item => token.startsWith(`${item.prefix}_`));
  if (!spec || token.length > 80) {
    throw notFound("This invitation is not valid.");
  }
  const kind = spec.prefix === "s" ? "series" : "tierList";
  return ctx.inTransaction(async connection => {
    const [invites] = await connection.execute(
      `SELECT * FROM ${spec.invites} WHERE token_hash = ? FOR UPDATE`,
      [hashToken(token)]
    );
    const invite = invites[0];
    if (!invite || invite.revoked || Number(invite.expires_at) <= Date.now()) {
      throw notFound("This invitation is not valid or has expired.");
    }
    const resourceId = invite[spec.fk];
    const [resources] = await connection.execute(
      `SELECT owner_user_id FROM ${spec.table} WHERE id = ?`,
      [resourceId]
    );
    if (!resources.length) {
      throw notFound("This invitation is not valid.");
    }
    if (resources[0].owner_user_id === userId) {
      return { kind, id: resourceId, role: "owner" };
    }
    const [existing] = await connection.execute(
      `SELECT role FROM ${spec.members} WHERE ${spec.fk} = ? AND user_id = ?`,
      [resourceId, userId]
    );
    if (existing.length) {
      return { kind, id: resourceId, role: existing[0].role };
    }
    if (invite.uses >= invite.max_uses) {
      throw conflict("This invitation has already been used.", "invite_used");
    }
    await connection.execute(
      `INSERT INTO ${spec.members} (${spec.fk}, user_id, role, created_at) VALUES (?, ?, ?, ?)`,
      [resourceId, userId, invite.role, new Date().toISOString()]
    );
    await connection.execute(`UPDATE ${spec.invites} SET uses = uses + 1 WHERE token_hash = ?`, [
      invite.token_hash
    ]);
    return { kind, id: resourceId, role: invite.role };
  });
}

export async function listSharing(ctx, kind, resourceId, ownerId) {
  const spec = SHARE_KINDS[kind];
  const [owned] = await ctx.pool.execute(
    `SELECT 1 FROM ${spec.table} WHERE id = ? AND owner_user_id = ?`,
    [resourceId, ownerId]
  );
  if (!owned.length) {
    throw notFound("Not found.");
  }
  const [members] = await ctx.pool.execute(
    `SELECT m.user_id, m.role, u.name, u.picture FROM ${spec.members} m JOIN users u ON u.id = m.user_id WHERE m.${spec.fk} = ? ORDER BY m.created_at`,
    [resourceId]
  );
  const [invites] = await ctx.pool.execute(
    `SELECT token_hash, role, expires_at, uses, max_uses FROM ${spec.invites} WHERE ${spec.fk} = ? AND revoked = FALSE AND expires_at > ? ORDER BY created_at DESC`,
    [resourceId, Date.now()]
  );
  return {
    members: members.map(row => ({
      userId: row.user_id,
      role: row.role,
      name: row.name,
      picture: row.picture
    })),
    invites: invites.map(row => ({
      id: row.token_hash.slice(0, 12),
      role: row.role,
      expiresAt: Number(row.expires_at),
      uses: row.uses,
      maxUses: row.max_uses
    }))
  };
}

export async function revokeInvite(ctx, kind, resourceId, ownerId, invitePrefix) {
  const spec = SHARE_KINDS[kind];
  const [result] = await ctx.pool.execute(
    `UPDATE ${spec.invites} i JOIN ${spec.table} r ON r.id = i.${spec.fk}
          SET i.revoked = TRUE WHERE i.${spec.fk} = ? AND r.owner_user_id = ? AND i.token_hash LIKE ?`,
    [resourceId, ownerId, `${invitePrefix}%`]
  );
  return result.affectedRows > 0;
}

/** Owner removes anyone; a member may remove themselves (leave). */
export async function removeMember(ctx, kind, resourceId, requesterId, targetUserId) {
  const spec = SHARE_KINDS[kind];
  const [owned] = await ctx.pool.execute(
    `SELECT 1 FROM ${spec.table} WHERE id = ? AND owner_user_id = ?`,
    [resourceId, requesterId]
  );
  if (!owned.length && requesterId !== targetUserId) {
    throw notFound("Not found.");
  }
  const [result] = await ctx.pool.execute(
    `DELETE FROM ${spec.members} WHERE ${spec.fk} = ? AND user_id = ?`,
    [resourceId, targetUserId]
  );
  return result.affectedRows > 0;
}

export async function countOrphans(ctx) {
  const [[series]] = await ctx.pool.query(
    "SELECT COUNT(*) AS total FROM series WHERE owner_user_id IS NULL"
  );
  const [[tierLists]] = await ctx.pool.query(
    "SELECT COUNT(*) AS total FROM tier_lists WHERE owner_user_id IS NULL"
  );
  return { series: Number(series.total), tierLists: Number(tierLists.total) };
}

export async function claimOrphans(ctx, userId) {
  return ctx.inTransaction(async connection => {
    const [series] = await connection.execute(
      "UPDATE series SET owner_user_id = ?, version = version + 1 WHERE owner_user_id IS NULL",
      [userId]
    );
    const [tierLists] = await connection.execute(
      "UPDATE tier_lists SET owner_user_id = ?, version = version + 1 WHERE owner_user_id IS NULL",
      [userId]
    );
    return { series: series.affectedRows, tierLists: tierLists.affectedRows };
  });
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  countOwned,
  assertQuota,
  createInvite,
  acceptInvite,
  listSharing,
  revokeInvite,
  removeMember,
  countOrphans,
  claimOrphans
};
