// tournament store, parse: parse, forget, gameRow, presentGame, and 9 more.
import { randomUUID } from "node:crypto";

export const parse = value => (typeof value === "string" ? JSON.parse(value) : value);

export const forget = ctx => ctx.cache.clear();

export const gameRow = (seriesId, game) => [
  randomUUID(),
  seriesId,
  game.gameNumber,
  game.blueTeam,
  game.redTeam,
  game.winner,
  game.durationSeconds,
  JSON.stringify({
    bans: game.bans,
    picks: game.picks,
    pickLanes: game.pickLanes,
    ...(game.ultimateBattle ? { ultimateBattle: true } : {})
  })
];

export const presentGame = row => ({
  gameNumber: row.game_number,
  blueTeam: row.blue_team,
  redTeam: row.red_team,
  winner: row.winner,
  durationSeconds: row.duration_seconds,
  pickLanes: { blue: [null, null, null, null, null], red: [null, null, null, null, null] },
  ultimateBattle: false,
  ...parse(row.draft_json)
}); // games entered before the lanes existed have none

// A DATE column comes back as a Date at local midnight: its calendar day is read with local
// getters (toISOString would shift it with the time zone).
export const two = value => String(value).padStart(2, "0");

export const day = value =>
  value instanceof Date
    ? `${value.getFullYear()}-${two(value.getMonth() + 1)}-${two(value.getDate())}`
    : String(value).slice(0, 10);

export const presentSeries = (row, games = []) => ({
  id: row.id,
  event: row.event,
  stage: row.stage,
  teamA: row.team_a,
  teamB: row.team_b,
  bestOf: row.best_of,
  rule: row.rule,
  playedOn: day(row.played_on),
  patch: row.patch,
  sourceUrl: row.source_url,
  note: row.note,
  verification: row.verification ?? "verified",
  pickOrderKnown:
    row.pick_order_known === undefined || row.pick_order_known === null
      ? row.verification !== "listed"
      : Boolean(row.pick_order_known),
  toCheck: row.to_check ? String(row.to_check).split("\n") : [],
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
  games
});

export const insertGames = (connection, seriesId, games) =>
  connection.query(
    "INSERT INTO competitive_games (id, series_id, game_number, blue_team, red_team, winner, duration_seconds, draft_json) VALUES ?",
    [games.map(game => gameRow(seriesId, game))]
  );

export async function createTournament(ctx, series, adminId) {
  const id = randomUUID();
  const now = Date.now();
  await ctx.inTransaction(async connection => {
    await connection.execute(
      "INSERT INTO competitive_series (id, event, stage, team_a, team_b, best_of, rule, played_on, patch, source_url, note, verification, pick_order_known, to_check, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        series.event,
        series.stage,
        series.teamA,
        series.teamB,
        series.bestOf,
        series.rule,
        series.playedOn,
        series.patch,
        series.sourceUrl,
        series.note,
        series.verification ?? "verified",
        series.pickOrderKnown === false ? 0 : 1,
        series.toCheck?.length ? series.toCheck.join("\n") : null,
        adminId,
        now,
        now
      ]
    );
    await insertGames(connection, id, series.games);
  });
  ctx.forget();
  return id;
}

/**
 * Replaces the whole series (header and games): renaming, correcting a pick and adding a game
 * are all this.
 */
export async function replaceTournament(ctx, id, series) {
  const done = await ctx.inTransaction(async connection => {
    const [[found]] = await connection.execute(
      "SELECT id FROM competitive_series WHERE id = ? FOR UPDATE",
      [id]
    );
    if (!found) {
      return false;
    }
    await connection.execute(
      "UPDATE competitive_series SET event = ?, stage = ?, team_a = ?, team_b = ?, best_of = ?, rule = ?, played_on = ?, patch = ?, source_url = ?, note = ?, verification = ?, pick_order_known = ?, to_check = ?, updated_at = ? WHERE id = ?",
      [
        series.event,
        series.stage,
        series.teamA,
        series.teamB,
        series.bestOf,
        series.rule,
        series.playedOn,
        series.patch,
        series.sourceUrl,
        series.note,
        series.verification ?? "verified",
        series.pickOrderKnown === false ? 0 : 1,
        series.toCheck?.length ? series.toCheck.join("\n") : null,
        Date.now(),
        id
      ]
    );
    await connection.execute("DELETE FROM competitive_games WHERE series_id = ?", [id]);
    await insertGames(connection, id, series.games);
    return true;
  });
  ctx.forget();
  return done;
}

export async function deleteTournament(ctx, id) {
  const [result] = await ctx.pool.execute("DELETE FROM competitive_series WHERE id = ?", [id]);
  ctx.forget();
  return result.affectedRows > 0;
}

export async function getTournament(ctx, id) {
  const [[row]] = await ctx.pool.execute("SELECT * FROM competitive_series WHERE id = ?", [id]);
  if (!row) {
    return null;
  }
  const [games] = await ctx.pool.execute(
    "SELECT * FROM competitive_games WHERE series_id = ? ORDER BY game_number",
    [id]
  );
  return presentSeries(row, games.map(presentGame));
}

/**
 * Series, newest first, with their score; filtered by a text found in the event, stage or team
 * names.
 */
export async function listTournaments(
  ctx,
  { q = "", page = 1, pageSize = 25, verification = "" } = {}
) {
  const like = `%${String(q).replace(/[%_\\]/g, match => `\\${match}`)}%`;
  const conditions = [];
  const args = [];
  if (q) {
    conditions.push("(event LIKE ? OR stage LIKE ? OR team_a LIKE ? OR team_b LIKE ?)");
    args.push(like, like, like, like);
  }
  if (verification) {
    conditions.push("verification = ?");
    args.push(verification);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [[count]] = await ctx.pool.query(
    `SELECT COUNT(*) AS n FROM competitive_series ${where}`,
    args
  );
  const [rows] = await ctx.pool.query(
    `SELECT * FROM competitive_series ${where} ORDER BY played_on DESC, created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const ids = rows.map(row => row.id);
  const games = ids.length
    ? (
        await ctx.pool.query(
          "SELECT series_id, winner, JSON_EXTRACT(draft_json, '$.ultimateBattle') AS ultimate FROM competitive_games WHERE series_id IN (?)",
          [ids]
        )
      )[0]
    : [];
  return {
    total: Number(count.n),
    items: rows.map(row => {
      const own = games.filter(game => game.series_id === row.id);
      return {
        ...presentSeries(row),
        gamesCount: own.length,
        ultimateBattle: own.some(game => game.ultimate === true || game.ultimate === "true"),
        score: {
          teamA: own.filter(game => game.winner === row.team_a).length,
          teamB: own.filter(game => game.winner === row.team_b).length
        }
      };
    })
  };
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  forget,
  createTournament,
  replaceTournament,
  deleteTournament,
  getTournament,
  listTournaments
};
