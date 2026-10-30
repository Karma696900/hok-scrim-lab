export const SERIES_COLUMNS = `SELECT s.id, s.data_json, s.version, s.owner_user_id, s.updated_at, m.role AS member_role,
    o.invitation_code, o.team_a_user_id, o.team_b_user_id,
    ua.name AS team_a_name, ua.picture AS team_a_picture, ub.name AS team_b_name, ub.picture AS team_b_picture`;

export const SERIES_JOINS = `LEFT JOIN series_members m ON m.series_id = s.id AND m.user_id = ?
  LEFT JOIN online_series o ON o.series_id = s.id
  LEFT JOIN users ua ON ua.id = o.team_a_user_id
  LEFT JOIN users ub ON ub.id = o.team_b_user_id`;

/** One series, looked up by its id (the viewer is the first `?`). */
export const SERIES_SELECT = `${SERIES_COLUMNS} FROM series s ${SERIES_JOINS}`;

/** Whether the viewer (the first, second and last `?`) can see `s`: they own it, were given it, or a team of theirs has it. */
export const SERIES_VISIBLE = `(s.owner_user_id = ? OR m.user_id IS NOT NULL OR EXISTS (
  SELECT 1 FROM team_series ts JOIN team_members tm ON tm.team_id = ts.team_id WHERE ts.series_id = s.id AND tm.user_id = ?))`;

/** Access context derived from a joined row; consumed by policy.js and presenters.js. */
export function seriesContext(row, viewerId) {
  const online = row.invitation_code
    ? {
        invitationCode: row.invitation_code,
        teamAUserId: row.team_a_user_id,
        teamBUserId: row.team_b_user_id,
        teamAUser: row.team_a_name ? { name: row.team_a_name, picture: row.team_a_picture } : null,
        teamBUser: row.team_b_name ? { name: row.team_b_name, picture: row.team_b_picture } : null
      }
    : null;
  const isOwner = Boolean(viewerId) && row.owner_user_id === viewerId;
  return {
    viewerId,
    // not the owner, not a member: it can only be visible because a team of the viewer shared it
    role: isOwner ? "owner" : (row.member_role ?? "viewer"),
    version: row.version,
    online,
    side:
      online && viewerId
        ? viewerId === online.teamAUserId
          ? "A"
          : viewerId === online.teamBUserId
            ? "B"
            : null
        : null
  };
}

// the id breaks ties: two series saved in the same millisecond must not swap places between two pages
const SERIES_SORTS = {
  updated: "s.updated_at DESC, s.id",
  oldest: "s.updated_at ASC, s.id",
  created: "s.created_at DESC, s.id"
};

/**
 * filters: status, mode (game mode), draftMode, q (team name), from/to (YYYY-MM-DD on updated_at),
 * sort. Values arrive validated.
 */
export function seriesFilterSql(filters) {
  const clauses = [];
  const params = [];
  if (filters.status) {
    clauses.push("s.status = ?");
    params.push(filters.status);
  }
  if (filters.mode) {
    clauses.push("s.game_mode = ?");
    params.push(filters.mode);
  }
  if (filters.draftMode) {
    clauses.push("s.draft_mode = ?");
    params.push(filters.draftMode);
  }
  if (filters.q) {
    const pattern = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
    clauses.push("(s.team_a_name LIKE ? OR s.team_b_name LIKE ?)");
    params.push(pattern, pattern);
  }
  if (filters.from) {
    clauses.push("s.updated_at >= ?");
    params.push(`${filters.from}T00:00:00.000Z`);
  }
  if (filters.to) {
    clauses.push("s.updated_at <= ?");
    params.push(`${filters.to}T23:59:59.999Z`);
  }
  return {
    sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "",
    params,
    order: SERIES_SORTS[filters.sort] ?? SERIES_SORTS.updated
  };
}
