import { randomUUID } from "node:crypto";
import { STAFF_ROLES } from "./community-domain.js";

// Small pieces of SQL and row shaping shared by the community stores.
import { jsonColumn as parse } from "../../platform/database/json-column.js";

export { parse };
export const staffList = STAFF_ROLES.map(role => `'${role}'`).join(", ");
const logoOf = row => (Number(row.logo_version) ? Number(row.logo_version) : 0);
export const teamCard = (row, prefix = "") => ({
  id: row[`${prefix}id`],
  name: row[`${prefix}name`],
  tag: row[`${prefix}tag`],
  level: row[`${prefix}level`],
  region: row[`${prefix}region`],
  timezone: row[`${prefix}timezone`],
  logoVersion: logoOf({ logo_version: row[`${prefix}logo_version`] })
});

export async function isStaff(executor, teamId, userId) {
  const [[row]] = await executor.query(
    `SELECT 1 AS yes FROM team_members WHERE team_id = ? AND user_id = ? AND role IN (${staffList})`,
    [teamId, userId]
  );
  return Boolean(row);
}
export const staffOf = async (executor, teamId) =>
  (
    await executor.query(
      `SELECT user_id FROM team_members WHERE team_id = ? AND role IN (${staffList})`,
      [teamId]
    )
  )[0].map(row => row.user_id);

export async function notify(executor, userIds, kind, payload) {
  const now = Date.now();
  const unique = [...new Set(userIds)];
  if (!unique.length) {
    return [];
  }
  await executor.query(
    "INSERT INTO notifications (id, user_id, kind, payload_json, created_at) VALUES ?",
    [unique.map(userId => [randomUUID(), userId, kind, JSON.stringify(payload), now])]
  );
  return unique.map(userId => ({ userId, kind, payload }));
}

export const requestRow = row => ({
  id: row.id,
  status: row.status,
  startsAt: Number(row.starts_at),
  endsAt: Number(row.ends_at),
  format: row.format,
  heroRule: row.hero_rule,
  control: row.control,
  note: row.note,
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
  awaitingTeamId: row.awaiting_team_id,
  postId: row.post_id,
  from: teamCard(row, "f_"),
  to: teamCard(row, "t_")
});
export const requestSelect = `SELECT r.*, f.id AS f_id, f.name AS f_name, f.tag AS f_tag, f.level AS f_level, f.region AS f_region, f.timezone AS f_timezone, f.logo_version AS f_logo_version,
  t.id AS t_id, t.name AS t_name, t.tag AS t_tag, t.level AS t_level, t.region AS t_region, t.timezone AS t_timezone, t.logo_version AS t_logo_version
  FROM scrim_requests r JOIN teams f ON f.id = r.from_team_id JOIN teams t ON t.id = r.to_team_id`;

/** The team of the viewer in a request (the one he is staff of), or null. */
export async function sideOf(executor, request, userId) {
  if (await isStaff(executor, request.from_team_id ?? request.from.id, userId)) {
    return request.from_team_id ?? request.from.id;
  }
  if (await isStaff(executor, request.to_team_id ?? request.to.id, userId)) {
    return request.to_team_id ?? request.to.id;
  }
  return null;
}
