// team store, parse: parse, present, person, escapeLike, and 7 more.
import { conflict } from "../../platform/errors.js";
import { randomUUID } from "node:crypto";

import { jsonColumn as parse } from "../../platform/database/json-column.js";

export { parse };

export const present = row => ({
  id: row.id,
  name: row.name,
  tag: row.tag,
  description: row.description,
  region: row.region,
  timezone: row.timezone,
  languages: parse(row.languages_json, []),
  level: row.level,
  maxMembers: Number(row.max_members),
  logoVersion: Number(row.logo_version),
  createdAt: Number(row.created_at),
  memberCount: row.member_count === undefined ? undefined : Number(row.member_count),
  lanes:
    row.roster_lanes === undefined
      ? undefined
      : String(row.roster_lanes ?? "")
          .split(",")
          .filter(Boolean)
});

export const person = row => ({
  userId: row.user_id,
  name: row.name,
  tag: row.tag,
  picture: row.picture || null,
  role: row.role,
  lane: row.lane,
  joinedAt: Number(row.joined_at),
  labels: row.labels ? String(row.labels).split(",") : []
});

export const escapeLike = value => value.replace(/[%_\\]/g, "\\$&");

export const taken = error =>
  conflict(
    /uq_teams_tag/.test(error.message)
      ? "This team tag is already taken."
      : "This team name is already taken.",
    "team_taken"
  );

export async function listTeams(
  ctx,
  { query = "", level = "", region = "", page = 1, pageSize = 20 }
) {
  const where = ["1 = 1"],
    values = [];
  if (query) {
    where.push("(t.name LIKE ? OR t.tag LIKE ?)");
    values.push(`%${escapeLike(query)}%`, `${escapeLike(query)}%`);
  }
  if (level) {
    where.push("t.level = ?");
    values.push(level);
  }
  if (region) {
    where.push("t.region = ?");
    values.push(region);
  }
  const [[{ total }]] = await ctx.pool.query(
    `SELECT COUNT(*) AS total FROM teams t WHERE ${where.join(" AND ")}`,
    values
  );
  const [rows] = await ctx.pool.query(
    `SELECT t.*, (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS member_count, ${ctx.rosterLanes} FROM teams t WHERE ${where.join(" AND ")} ORDER BY t.name ASC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize]
  );
  return { items: rows.map(present), total: Number(total), page, pageSize };
}

export async function getTeam(ctx, id) {
  const [[row]] = await ctx.pool.query("SELECT * FROM teams WHERE id = ?", [id]);
  if (!row) {
    return null;
  }
  const [members] = await ctx.pool.query(
    `${ctx.memberSql} WHERE m.team_id = ? ORDER BY ${ctx.roleOrder}, m.joined_at`,
    [id]
  );
  return { ...present(row), members: members.map(person) };
}

export async function teamsOfUser(ctx, userId) {
  const [rows] = await ctx.pool.query(
    `SELECT t.*, m.role AS my_role, (SELECT COUNT(*) FROM team_members x WHERE x.team_id = t.id) AS member_count, ${ctx.rosterLanes} FROM teams t JOIN team_members m ON m.team_id = t.id WHERE m.user_id = ? ORDER BY t.name`,
    [userId]
  );
  return rows.map(row => ({ ...present(row), myRole: row.my_role }));
}

export async function roleOf(ctx, teamId, userId) {
  const [[row]] = await ctx.pool.query(
    "SELECT role FROM team_members WHERE team_id = ? AND user_id = ?",
    [teamId, userId]
  );
  return row?.role ?? null;
}

export async function createTeam(ctx, userId, input, maxTeams) {
  const id = randomUUID(),
    now = Date.now();
  await ctx.inTransaction(async connection => {
    const [[{ n }]] = await connection.query(
      "SELECT COUNT(*) AS n FROM team_members WHERE user_id = ? FOR UPDATE",
      [userId]
    );
    if (Number(n) >= maxTeams) {
      throw conflict("You can be in at most {max} teams.", "too_many_teams", { max: maxTeams });
    }
    try {
      await connection.execute(
        "INSERT INTO teams (id, name, name_key, tag, description, region, timezone, languages_json, level, max_members, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          id,
          input.name,
          input.nameKey,
          input.tag,
          input.description,
          input.region,
          input.timezone,
          JSON.stringify(input.languages),
          input.level,
          input.maxMembers,
          userId,
          now,
          now
        ]
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        throw taken(error);
      }
      throw error;
    }
    await connection.execute(
      "INSERT INTO team_members (team_id, user_id, role, lane, joined_at) VALUES (?, ?, 'owner', '', ?)",
      [id, userId, now]
    );
  });
  return id;
}

export async function updateTeam(ctx, id, input) {
  return ctx.inTransaction(async connection => {
    const [[team]] = await connection.query("SELECT id FROM teams WHERE id = ? FOR UPDATE", [id]);
    if (!team) {
      return false;
    }
    const [[{ n }]] = await connection.query(
      "SELECT (SELECT COUNT(*) FROM team_members WHERE team_id = ?) + (SELECT COUNT(*) FROM team_invitations WHERE team_id = ?) AS n",
      [id, id]
    );
    if (input.maxMembers < Number(n)) {
      throw conflict(
        "The team already has {count} members and pending invitations: the limit cannot be lower.",
        "team_size_below_members",
        { count: Number(n) }
      );
    }
    try {
      await connection.execute(
        "UPDATE teams SET name = ?, name_key = ?, tag = ?, description = ?, region = ?, timezone = ?, languages_json = ?, level = ?, max_members = ?, updated_at = ? WHERE id = ?",
        [
          input.name,
          input.nameKey,
          input.tag,
          input.description,
          input.region,
          input.timezone,
          JSON.stringify(input.languages),
          input.level,
          input.maxMembers,
          Date.now(),
          id
        ]
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        throw taken(error);
      }
      throw error;
    }
    return true;
  });
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { listTeams, getTeam, teamsOfUser, roleOf, createTeam, updateTeam };
