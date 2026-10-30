// series store, small helpers: listSeries, countVisibleSeries, countOwnScrims, listOwnScrims, and 1 more.
import {
  SERIES_COLUMNS,
  SERIES_JOINS,
  SERIES_SELECT,
  SERIES_VISIBLE,
  seriesContext,
  seriesFilterSql
} from "./series-store-shared.js";

export async function listSeries(env, viewerId, { limit = 20, offset = 0, filters = {} } = {}) {
  if (!viewerId) {
    return { items: [], total: 0 };
  }
  const { sql, params, order } = seriesFilterSql(filters);
  const [rows] = await env.pool.query(
    `${SERIES_LIST_SELECT} WHERE TRUE${sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [viewerId, viewerId, viewerId, viewerId, ...params, limit, offset]
  );
  const [[count]] = await env.pool.query(
    `SELECT COUNT(*) AS total FROM ${VISIBLE_IDS} JOIN series s ON s.id = v.id WHERE TRUE${sql}`,
    [viewerId, viewerId, viewerId, ...params]
  );
  return {
    items: rows.map(row => ({
      series: JSON.parse(row.data_json),
      ctx: seriesContext(row, viewerId)
    })),
    total: Number(count.total)
  };
}

export async function countVisibleSeries(env, viewerId) {
  if (!viewerId) {
    return { series: 0, active: 0, games: 0 };
  }
  const [[row]] = await env.pool.query(
    `SELECT COUNT(*) AS series, COALESCE(SUM(s.status = 'active'), 0) AS active, COALESCE(SUM(s.games_count), 0) AS games
          FROM ${VISIBLE_IDS} JOIN series s ON s.id = v.id`,
    [viewerId, viewerId, viewerId]
  );
  return { series: Number(row.series), active: Number(row.active), games: Number(row.games) };
}

/**
 * Series the viewer created or played in (online): the basis of "Your scrims" statistics.
 * Series merely shared with them are excluded.
 */
export async function countOwnScrims(env, viewerId, filters = {}) {
  if (!viewerId) {
    return 0;
  }
  const { sql, params } = seriesFilterSql(filters);
  const [[row]] = await env.pool.query(
    `SELECT COUNT(*) AS total FROM ${OWN_SCRIM_IDS} JOIN series s ON s.id = v.id WHERE TRUE${sql}`,
    [viewerId, viewerId, ...params]
  );
  return Number(row.total);
}

export async function listOwnScrims(env, viewerId, { limit = 3000, filters = {} } = {}) {
  if (!viewerId) {
    return [];
  }
  const { sql, params } = seriesFilterSql(filters);
  const [rows] = await env.pool.query(
    `SELECT s.data_json FROM ${OWN_SCRIM_IDS} JOIN series s ON s.id = v.id WHERE TRUE${sql} ORDER BY s.updated_at DESC LIMIT ?`,
    [viewerId, viewerId, ...params, limit]
  );
  return rows.map(row => JSON.parse(row.data_json));
}

export async function getSeries(env, id, viewerId) {
  if (!viewerId) {
    return null;
  }
  const [rows] = await env.pool.query(`${SERIES_SELECT} WHERE s.id = ? AND ${SERIES_VISIBLE}`, [
    viewerId,
    id,
    viewerId,
    viewerId
  ]);
  return rows[0]
    ? { series: JSON.parse(rows[0].data_json), ctx: seriesContext(rows[0], viewerId) }
    : null;
}

/**
 * The series a person can see: the ones they own, the ones shared with them, and the ones a team of theirs
 * shared (three `?`: the viewer three times). Two index lookups joined by UNION. The obvious `WHERE owner = ? OR member IS NOT NULL` over a
 * join makes MySQL read EVERY series of the site, so the cost grew with the whole table and not with the
 * person's own series: measured with scripts/performance/api-probe.mjs on 30 000 series, 224 ms for someone
 * who owns two, against a few milliseconds like this. The team branch starts from the teams of the person
 * (STRAIGHT_JOIN): left alone, MySQL may scan every shared series of the site and look each team up.
 */
const VISIBLE_IDS = `(SELECT id FROM series WHERE owner_user_id = ? UNION
  SELECT series_id AS id FROM series_members WHERE user_id = ? UNION
  SELECT ts.series_id AS id FROM team_members tm STRAIGHT_JOIN team_series ts ON ts.team_id = tm.team_id WHERE tm.user_id = ?) v`;

/** The same for the series a person created or played in (not the ones merely shared with them). */
const OWN_SCRIM_IDS = `(SELECT id FROM series WHERE owner_user_id = ? UNION
  SELECT series_id AS id FROM online_series WHERE team_b_user_id = ?) v`;

/** A list of visible series: the four `?` are the viewer (owner, member, team, own role). */
const SERIES_LIST_SELECT = `${SERIES_COLUMNS} FROM ${VISIBLE_IDS} JOIN series s ON s.id = v.id ${SERIES_JOINS}`;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { listSeries, countVisibleSeries, countOwnScrims, listOwnScrims, getSeries };
