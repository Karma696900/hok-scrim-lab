import { getSeriesScore } from "../../../shared/draft-model.js";

/**
 * Columns mirrored from the series blob so lists can be filtered and paged in SQL. Kept in sync on
 * every save.
 */
export function summaryColumns(series) {
  return {
    status: series.status,
    teamA: series.teamA.name,
    teamB: series.teamB.name,
    bestOf: series.bestOf,
    gameMode: series.gameMode,
    draftMode: series.draftMode ?? "solo",
    gamesCount: series.games.length
  };
}

/** Light representation of a series for Overview and History (no drafts). */
export function summarize(series, ctx) {
  const score = getSeriesScore(series);
  return {
    id: series.id,
    teamA: series.teamA.name,
    teamB: series.teamB.name,
    bestOf: series.bestOf,
    winsRequired: series.winsRequired,
    gameMode: series.gameMode,
    draftMode: series.draftMode ?? "solo",
    status: series.status,
    score,
    gamesCount: series.games.length,
    currentGameNumber: series.currentGame?.gameNumber ?? null,
    online: Boolean(ctx.online),
    role: ctx.role,
    createdAt: series.createdAt,
    updatedAt: series.updatedAt
  };
}
