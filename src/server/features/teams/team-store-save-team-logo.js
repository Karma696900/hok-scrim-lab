// team store, save team logo: saveTeamLogo, removeTeamLogo, getTeamLogo, deleteTeam, and 6 more.
import { conflict } from "../../platform/errors.js";
import { randomUUID } from "node:crypto";

export async function saveTeamLogo(ctx, teamId, { mime, data }) {
  const now = Date.now();
  await ctx.inTransaction(async connection => {
    await connection.execute(
      "INSERT INTO team_logos (team_id, mime, data, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data), updated_at = VALUES(updated_at)",
      [teamId, mime, data, now]
    );
    await connection.execute("UPDATE teams SET logo_version = ? WHERE id = ?", [now, teamId]);
  });
  return now;
}

export async function removeTeamLogo(ctx, teamId) {
  await ctx.inTransaction(async connection => {
    await connection.execute("DELETE FROM team_logos WHERE team_id = ?", [teamId]);
    await connection.execute("UPDATE teams SET logo_version = 0 WHERE id = ?", [teamId]);
  });
}

export async function getTeamLogo(ctx, teamId) {
  const [[row]] = await ctx.pool.query(
    "SELECT mime, data, updated_at FROM team_logos WHERE team_id = ?",
    [teamId]
  );
  return row ? { mime: row.mime, data: row.data, updatedAt: Number(row.updated_at) } : null;
}

export async function deleteTeam(ctx, id) {
  const [result] = await ctx.pool.execute("DELETE FROM teams WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

export async function findUserByTag(ctx, tag) {
  const [[row]] = await ctx.pool.query(
    "SELECT id, name, tag FROM users WHERE tag = ? AND is_guest = FALSE",
    [tag]
  );
  return row ?? null;
}

export async function invite(ctx, teamId, userId, invitedBy, { role, lane }) {
  const id = randomUUID();
  await ctx.inTransaction(async connection => {
    const [[{ max_members: maxMembers }]] = await connection.query(
      "SELECT max_members FROM teams WHERE id = ? FOR UPDATE",
      [teamId]
    );
    const [[{ n }]] = await connection.query(
      "SELECT (SELECT COUNT(*) FROM team_members WHERE team_id = ?) + (SELECT COUNT(*) FROM team_invitations WHERE team_id = ?) AS n",
      [teamId, teamId]
    );
    if (Number(n) >= maxMembers) {
      throw conflict("This team is full ({max} members and pending invitations).", "team_full", {
        max: Number(maxMembers)
      });
    }
    const [[member]] = await connection.query(
      "SELECT 1 AS yes FROM team_members WHERE team_id = ? AND user_id = ?",
      [teamId, userId]
    );
    if (member) {
      throw conflict("This player is already in the team.", "already_member");
    }
    try {
      await connection.execute(
        "INSERT INTO team_invitations (id, team_id, user_id, invited_by, role, lane, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [id, teamId, userId, invitedBy, role, lane, Date.now()]
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        throw conflict("This player already has a pending invitation.", "already_invited");
      }
      throw error;
    }
  });
  return id;
}

export async function invitationsOfTeam(ctx, teamId) {
  const [rows] = await ctx.pool.query(
    "SELECT i.id, i.role, i.lane, i.created_at, u.name, u.tag FROM team_invitations i JOIN users u ON u.id = i.user_id WHERE i.team_id = ? ORDER BY i.created_at",
    [teamId]
  );
  return rows.map(row => ({
    id: row.id,
    role: row.role,
    lane: row.lane,
    createdAt: Number(row.created_at),
    name: row.name,
    tag: row.tag
  }));
}

export async function invitationsOfUser(ctx, userId) {
  const [rows] = await ctx.pool.query(
    "SELECT i.id, i.role, i.lane, i.created_at, t.id AS team_id, t.name AS team_name, t.tag AS team_tag, u.name AS by_name, u.tag AS by_tag FROM team_invitations i JOIN teams t ON t.id = i.team_id JOIN users u ON u.id = i.invited_by WHERE i.user_id = ? ORDER BY i.created_at DESC",
    [userId]
  );
  return rows.map(row => ({
    id: row.id,
    role: row.role,
    lane: row.lane,
    createdAt: Number(row.created_at),
    team: { id: row.team_id, name: row.team_name, tag: row.team_tag },
    invitedBy: { name: row.by_name, tag: row.by_tag }
  }));
}

export async function cancelInvitation(ctx, teamId, invitationId) {
  const [result] = await ctx.pool.execute(
    "DELETE FROM team_invitations WHERE id = ? AND team_id = ?",
    [invitationId, teamId]
  );
  return result.affectedRows > 0;
}

/**
 * The invited account answers. Accepting joins the roster (one transaction); both answers
 * remove the invitation.
 */
export async function answerInvitation(ctx, invitationId, userId, accept, { maxTeams }) {
  return ctx.inTransaction(async connection => {
    const [[row]] = await connection.query(
      "SELECT * FROM team_invitations WHERE id = ? AND user_id = ? FOR UPDATE",
      [invitationId, userId]
    );
    if (!row) {
      return null;
    }
    if (accept) {
      const [[{ n }]] = await connection.query(
        "SELECT COUNT(*) AS n FROM team_members WHERE user_id = ? FOR UPDATE",
        [userId]
      );
      if (Number(n) >= maxTeams) {
        throw conflict("You can be in at most {max} teams.", "too_many_teams", {
          max: maxTeams
        });
      }
      const [[{ size, max_members: maxMembers }]] = await connection.query(
        "SELECT (SELECT COUNT(*) FROM team_members WHERE team_id = ?) AS size, max_members FROM teams WHERE id = ?",
        [row.team_id, row.team_id]
      );
      if (Number(size) >= Number(maxMembers)) {
        throw conflict("This team is full ({max} members and pending invitations).", "team_full", {
          max: Number(maxMembers)
        });
      }
      await connection.execute(
        "INSERT INTO team_members (team_id, user_id, role, lane, joined_at) VALUES (?, ?, ?, ?, ?)",
        [row.team_id, userId, row.role, row.lane, Date.now()]
      );
    }
    await connection.execute("DELETE FROM team_invitations WHERE id = ?", [invitationId]);
    return { teamId: row.team_id, accepted: accept };
  });
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  saveTeamLogo,
  removeTeamLogo,
  getTeamLogo,
  deleteTeam,
  findUserByTag,
  invite,
  invitationsOfTeam,
  invitationsOfUser,
  cancelInvitation,
  answerInvitation
};
