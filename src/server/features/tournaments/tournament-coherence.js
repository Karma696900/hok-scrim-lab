/**
 * What a person would look at first in a series taken from a results page: is it finished, and does each game
 * come before the end. `series` is a series as parseTournamentSeries returns it; the answer is a list of
 * sentences, empty when the series hangs together. This does not read any video: it says the page is
 * consistent, not that it is right.
 */
export function seriesProblems(series) {
  const needed = Math.floor(series.bestOf / 2) + 1;
  const wins = { [series.teamA]: 0, [series.teamB]: 0 };
  const problems = [];
  series.games.forEach((game, index) => {
    if (Math.max(...Object.values(wins)) >= needed) {
      problems.push(`game ${index + 1} is after the series was decided`);
    }
    wins[game.winner] += 1;
  });
  if (Math.max(...Object.values(wins)) < needed) {
    problems.push(
      `nobody reached ${needed} wins of a best of ${series.bestOf} (${wins[series.teamA]}-${wins[series.teamB]})`
    );
  }
  return problems;
}
