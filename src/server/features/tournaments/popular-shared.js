// What the popular drafts and heroes share: an entry of a table (its games, wins, weight and the
// heroes met), the two orders, the reliable rate of the tournament stats, the day the weights
// count from. Pure.
import { bayesian } from "./popular-score.js";

export const POPULAR_LIMIT = 20;
export const SIDES = ["blue", "red"];
export const DRAFT_SIZE = 5;

export const bump = (counts, key) => counts.set(key, (counts.get(key) ?? 0) + 1);

/** The three heroes met most often, then by id so that two equal counts always give the same order. */
export const topThree = counts =>
  [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([heroId, count]) => ({ heroId, count }));

export const winRateOf = entry => (entry.games ? entry.wins / entry.games : 0);

/**
 * The lowest win rate the games allow us to believe (the lower end of the 95 % Wilson interval): 1 win in 1
 * game is 21 %, 8 in 10 is 49 %, 80 in 100 is 71 %. Ranking on it, not on the raw rate, keeps a hero or a draft
 * that was played once and won from beating one that proved itself over many games.
 */
export function confidenceOf(wins, games) {
  if (!games) {
    return 0;
  }
  const z = 1.96;
  const rate = wins / games;
  const spread = (z * z) / (2 * games);
  const root = z * Math.sqrt((rate * (1 - rate)) / games + (z * z) / (4 * games * games));
  return Math.max(0, (rate + spread - root) / (1 + (z * z) / games));
}

export const confidenceRank = entry => confidenceOf(entry.wins, entry.games);
/** The best score first (the weighted win rate pulled toward the average), then the most games; then the same order every time. */
export const byWinRate = (a, b) =>
  b.score - a.score ||
  winRateOf(b) - winRateOf(a) ||
  b.games - a.games ||
  a.key.localeCompare(b.key);
/** The most played first, recent games weighing more: that is the popularity; the score only separates equals. */
export const byPlays = (a, b) =>
  b.weight - a.weight ||
  b.games - a.games ||
  b.score - a.score ||
  winRateOf(b) - winRateOf(a) ||
  a.key.localeCompare(b.key);

export const blank = key => ({
  key,
  games: 0,
  wins: 0,
  weight: 0,
  weightedWins: 0,
  score: 0,
  lastPlayed: "",
  beaten: new Map(), // the heroes of the other side, in the games that were won
  lostTo: new Map() // and in the games that were lost
});

/** One more game for an entry, weighing `weight`: who was against it, and whether it won. */
export function record(entry, game, enemies, won, weight = 1) {
  entry.games += 1;
  entry.wins += won ? 1 : 0;
  entry.weight += weight;
  entry.weightedWins += won ? weight : 0;
  if (game.playedOn > entry.lastPlayed) {
    entry.lastPlayed = game.playedOn;
  }
  for (const heroId of enemies) {
    bump(won ? entry.beaten : entry.lostTo, heroId);
  }
}

export const finish = (entry, extra) => ({
  ...extra,
  games: entry.games,
  wins: entry.wins,
  losses: entry.games - entry.wins,
  winRate: entry.games ? entry.wins / entry.games : null,
  confidence: confidenceOf(entry.wins, entry.games),
  weightedGames: Math.round(entry.weight * 100) / 100,
  score: entry.score,
  lastPlayed: entry.lastPlayed || null,
  whenWon: topThree(entry.beaten),
  whenLost: topThree(entry.lostTo)
});

/** The two rankings of a table of entries: the ones with the most wins out of their games, and the most played. */
export function ranked(entries, { minGames, limit, prior = 0.5 }) {
  for (const entry of entries) {
    entry.score = bayesian(entry.weightedWins, entry.weight, prior);
  }
  const eligible = entries.filter(entry => entry.games >= minGames);
  const cut = (compare, details) =>
    eligible
      .slice()
      .sort(compare)
      .slice(0, limit)
      .map(entry => finish(entry, details(entry)));
  return { eligible: eligible.length, entries: entries.length, cut };
}

/** The day the weights are counted from: the given one, else the last game's. */
export const todayOf = (games, today) =>
  today ??
  games.reduce((last, game) => (game.playedOn > last ? game.playedOn : last), "1970-01-01");

export const sideWon = (game, side) =>
  (side === "blue" ? game.blueTeam : game.redTeam) === game.winner;
