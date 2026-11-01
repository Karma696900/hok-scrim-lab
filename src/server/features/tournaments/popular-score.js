// The score shared by the popular pages and the public tier list. A game weighs less as it gets
// older (half after `SCORE.halfLife` days) and, for one hero, half again when it was played before
// the hero's last balance change; the win rate of the weighted games is pulled toward the average
// of its lane by `SCORE.k` games, so that a hero played twice cannot pass one that proved itself.
// The numbers are guesses for the owner to validate.

export const SCORE = { halfLife: 30, k: 10, minGames: 10 };

const DAY_MS = 86_400_000;
const daysBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / DAY_MS;

/** The weight of a game played on `playedOn` (YYYY-MM-DD), seen on `today`: 1 that day, never more. */
export function recencyWeight(playedOn, today, halfLife = SCORE.halfLife) {
  const age = Math.max(0, daysBetween(playedOn, today));
  return 0.5 ** (age / halfLife);
}

/** The weight of a game for one hero: its recency, halved when played before `lastChange`. */
export const heroWeight = (playedOn, today, lastChange) =>
  recencyWeight(playedOn, today) * (lastChange && playedOn < lastChange ? 0.5 : 1);

/** The win rate pulled toward `prior` (the average) by `k` games; `prior` when there is no game. */
export const bayesian = (wins, games, prior, k = SCORE.k) => (wins + k * prior) / (games + k);

/** The day of the latest balance change of each hero (its Camp adjustments), none in the future. */
export function lastChanges(detailsByHero, today) {
  const out = {};
  for (const [heroId, details] of Object.entries(detailsByHero)) {
    const days = (details?.adjustments ?? [])
      .map(adjustment => String(adjustment.publishedAt ?? "").slice(0, 10))
      .filter(day => day && day <= today)
      .sort();
    if (days.length) {
      out[heroId] = days.at(-1);
    }
  }
  return out;
}
