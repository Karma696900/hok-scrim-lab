// series store, teams series: teamsOfSeries, shareSeriesWithTeam, unshareSeriesFromTeam, listTeamSeries, and 5 more.
import { badRequest, conflict, notFound } from "../../platform/errors.js";
import { nextTimestamp } from "../../platform/database/store.js";
import { summaryColumns } from "./series-summary.js";
import {
  SERIES_COLUMNS,
  SERIES_JOINS,
  SERIES_SELECT,
  SERIES_VISIBLE,
  seriesContext,
  seriesFilterSql
} from "./series-store-shared.js";

// ---- the teams a series is on ---------------------------------------------------------------------
/** The teams a series is on, by name. */
export async function teamsOfSeries(env, seriesId) {
  const [rows] = await env.pool.execute(
    "SELECT t.id, t.name, ts.created_at FROM team_series ts JOIN teams t ON t.id = ts.team_id WHERE ts.series_id = ? ORDER BY t.name LIMIT 50",
    [seriesId]
  );
  return rows.map(row => ({ id: row.id, name: row.name, sharedAt: Number(row.created_at) }));
}

/**
 * Puts a series on a team, once (counted under a lock on the series, so that two requests cannot go
 * past `max`). False when it already was.
 */
export async function shareSeriesWithTeam(
  env,
  seriesId,
  teamId,
  userId,
  { max, now = Date.now() }
) {
  return env.inTransaction(async connection => {
    await connection.execute("SELECT id FROM series WHERE id = ? FOR UPDATE", [seriesId]);
    const [[row]] = await connection.execute(
      "SELECT COUNT(*) AS n, COALESCE(SUM(team_id = ?), 0) AS already FROM team_series WHERE series_id = ?",
      [teamId, seriesId]
    );
    if (Number(row.already)) {
      return false;
    }
    if (Number(row.n) >= max) {
      throw conflict("A series can be on {max} teams at most.", "too_many_teams", { max });
    }
    await connection.execute(
      "INSERT INTO team_series (team_id, series_id, shared_by, created_at) VALUES (?, ?, ?, ?)",
      [teamId, seriesId, userId, now]
    );
    return true;
  });
}

/** Takes a series off a team. False when it was not on it. */
export async function unshareSeriesFromTeam(env, seriesId, teamId) {
  const [result] = await env.pool.execute(
    "DELETE FROM team_series WHERE series_id = ? AND team_id = ?",
    [seriesId, teamId]
  );
  return result.affectedRows === 1;
}

/** The series a team shared, as the viewer sees them (same shape as `listSeries`). */
export async function listTeamSeries(
  env,
  teamId,
  viewerId,
  { limit = 20, offset = 0, filters = {} } = {}
) {
  const { sql, params, order } = seriesFilterSql(filters);
  const [rows] = await env.pool.query(
    `${SERIES_COLUMNS} FROM (SELECT series_id AS id FROM team_series WHERE team_id = ?) v JOIN series s ON s.id = v.id ${SERIES_JOINS} WHERE TRUE${sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [teamId, viewerId, ...params, limit, offset]
  );
  const [[count]] = await env.pool.query(
    `SELECT COUNT(*) AS total FROM team_series ts JOIN series s ON s.id = ts.series_id WHERE ts.team_id = ?${sql}`,
    [teamId, ...params]
  );
  return {
    items: rows.map(row => ({
      series: JSON.parse(row.data_json),
      ctx: seriesContext(row, viewerId)
    })),
    total: Number(count.total)
  };
}

/**
 * Row-locked read-modify-write. `work(series, ctx)` may mutate `series`; throwing rolls
 * everything back.
 */
export async function mutateSeries(env, id, viewerId, work) {
  if (!viewerId) {
    throw notFound("Series not found.");
  }
  return env.inTransaction(async connection => {
    const [rows] = await connection.query(
      `${SERIES_SELECT} WHERE s.id = ? AND ${SERIES_VISIBLE} FOR UPDATE OF s`,
      [viewerId, id, viewerId, viewerId]
    );
    const row = rows[0];
    if (!row) {
      throw notFound("Series not found.");
    }
    const series = JSON.parse(row.data_json);
    const ctx = seriesContext(row, viewerId);
    const result = await work(series, ctx);
    if (result && result.noChange) {
      return { series, ctx, result };
    }
    series.updatedAt = nextTimestamp(row.updated_at);
    await connection.execute(
      `UPDATE series SET data_json = ?, updated_at = ?, version = version + 1, ${SUMMARY_COLUMNS.split(
        ", "
      )
        .map(column => `${column} = ?`)
        .join(", ")} WHERE id = ?`,
      [JSON.stringify(series), series.updatedAt, ...summaryValues(series), id]
    );
    ctx.version = row.version + 1;
    return { series, ctx, result };
  });
}

export async function createSeries(env, series, ownerId) {
  await env.pool.execute(
    `INSERT INTO series (id, data_json, created_at, updated_at, owner_user_id, version, ${SUMMARY_COLUMNS}) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    [
      series.id,
      JSON.stringify(series),
      series.createdAt,
      series.updatedAt,
      ownerId,
      ...summaryValues(series)
    ]
  );
}

export async function createOnlineSeries(env, series, invitationCode, ownerId) {
  await env.inTransaction(async connection => {
    await connection.execute(
      `INSERT INTO series (id, data_json, created_at, updated_at, owner_user_id, version, ${SUMMARY_COLUMNS}) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
      [
        series.id,
        JSON.stringify(series),
        series.createdAt,
        series.updatedAt,
        ownerId,
        ...summaryValues(series)
      ]
    );
    await connection.execute(
      "INSERT INTO online_series (series_id, invitation_code, team_a_user_id) VALUES (?, ?, ?)",
      [series.id, invitationCode, ownerId]
    );
  });
}

export async function joinOnlineSeries(env, invitationCode, userId) {
  const seriesId = await env.inTransaction(async connection => {
    const [rooms] = await connection.execute(
      "SELECT * FROM online_series WHERE invitation_code = ? FOR UPDATE",
      [invitationCode]
    );
    const room = rooms[0];
    if (!room) {
      throw notFound("Online invitation not found.");
    }
    if (room.team_a_user_id === userId) {
      throw badRequest("Use a different Google account to join this invitation.");
    }
    if (room.team_b_user_id && room.team_b_user_id !== userId) {
      throw conflict("This invitation has already been used.", "invite_used");
    }
    if (!room.team_b_user_id) {
      await connection.execute("UPDATE online_series SET team_b_user_id = ? WHERE series_id = ?", [
        userId,
        room.series_id
      ]);
      await connection.execute(
        "INSERT IGNORE INTO series_members (series_id, user_id, role, created_at) VALUES (?, ?, 'editor', ?)",
        [room.series_id, userId, new Date().toISOString()]
      );
      const [seriesRows] = await connection.execute(
        "SELECT updated_at FROM series WHERE id = ? FOR UPDATE",
        [room.series_id]
      );
      const updatedAt = nextTimestamp(seriesRows[0].updated_at);
      await connection.execute(
        "UPDATE series SET updated_at = ?, version = version + 1 WHERE id = ?",
        [updatedAt, room.series_id]
      );
    }
    return room.series_id;
  });
  return env.store.getSeries(seriesId, userId);
}

export async function deleteSeries(env, id, ownerId) {
  const [result] = await env.pool.execute("DELETE FROM series WHERE id = ? AND owner_user_id = ?", [
    id,
    ownerId
  ]);
  return result.affectedRows > 0;
}

const SUMMARY_COLUMNS =
  "status, team_a_name, team_b_name, best_of, game_mode, draft_mode, games_count";

const summaryValues = series => {
  const columns = summaryColumns(series);
  return [
    columns.status,
    columns.teamA,
    columns.teamB,
    columns.bestOf,
    columns.gameMode,
    columns.draftMode,
    columns.gamesCount
  ];
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  teamsOfSeries,
  shareSeriesWithTeam,
  unshareSeriesFromTeam,
  listTeamSeries,
  mutateSeries,
  createSeries,
  createOnlineSeries,
  joinOnlineSeries,
  deleteSeries
};
