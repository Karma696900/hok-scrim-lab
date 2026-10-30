// tournament store, tournament suggestions: tournamentSuggestions, competitiveGames, competitiveSummary, rememberCompetitive.
import { day, presentGame } from "./tournament-store-parse.js";

/** Event names and team names already used (to complete the fields). */
export async function tournamentSuggestions(ctx) {
  const [events] = await ctx.pool.query(
    "SELECT event, MAX(played_on) AS last FROM competitive_series GROUP BY event ORDER BY last DESC LIMIT 50"
  );
  const [teams] = await ctx.pool.query(
    "SELECT name, MAX(played_on) AS last FROM (SELECT team_a AS name, played_on FROM competitive_series UNION ALL SELECT team_b, played_on FROM competitive_series) t GROUP BY name ORDER BY last DESC LIMIT 100"
  );
  return { events: events.map(row => row.event), teams: teams.map(row => row.name) };
}

/**
 * Every game played on or after `since` (YYYY-MM-DD, or null for all), with its date. Cached
 * for 30 s, dropped on any write. The visitor picks the date: the games are loaded from the first
 * day of its month and cut at the date itself, so that a loop over the calendar cannot fill the
 * memory with copies of the table (and cost a query each): there is one entry per month.
 */
export async function competitiveGames(ctx, since = null) {
  const month = since ? `${since.slice(0, 7)}-01` : null;
  const games = await ctx.cache.remember(`games|${month ?? "all"}`, async () => {
    const [rows] = await ctx.pool.query(
      `SELECT g.*, s.played_on, s.rule AS series_rule, s.pick_order_known FROM competitive_games g JOIN competitive_series s ON s.id = g.series_id ${month ? "WHERE s.played_on >= ?" : ""}`,
      month ? [month] : []
    );
    return rows.map(row => {
      const game = presentGame(row);
      return {
        ...game,
        playedOn: day(row.played_on),
        // the Ultimate Battle is played with the classic rules, whatever the series was
        rule: game.ultimateBattle ? "classic" : row.series_rule,
        pickOrderKnown: Boolean(row.pick_order_known)
      };
    });
  });
  return since ? games.filter(game => game.playedOn >= since) : games;
}

export function competitiveSummary(ctx) {
  return ctx.cache.remember("summary", async () => {
    const [[row]] = await ctx.pool.query(
      "SELECT COUNT(DISTINCT s.id) AS series, COUNT(g.id) AS games, MIN(s.played_on) AS first, MAX(s.played_on) AS last FROM competitive_series s LEFT JOIN competitive_games g ON g.series_id = s.id"
    );
    const [kinds] = await ctx.pool.query(
      "SELECT verification, COUNT(*) AS n FROM competitive_series GROUP BY verification"
    );
    return {
      series: Number(row.series),
      games: Number(row.games),
      first: row.first ? day(row.first) : null,
      last: row.last ? day(row.last) : null,
      verifications: Object.fromEntries(kinds.map(kind => [kind.verification, Number(kind.n)]))
    };
  });
}

/**
 * Something computed from the tournament games (an aggregation), kept for 30 s like the games
 * themselves and dropped by any write. The key must name everything the result depends on.
 */
export function rememberCompetitive(ctx, key, compute) {
  return ctx.cache.remember(`memo|${key}`, compute);
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  tournamentSuggestions,
  competitiveGames,
  competitiveSummary,
  rememberCompetitive
};
