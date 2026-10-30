// Statistics computed ONLY from the viewer's own scrims ("Your scrims"). Nothing here is imported
// or estimated: every number is a count of recorded games. Percentages are withheld below
// `minGames`.

const emptyTally = () => ({ games: 0, wins: 0 });

function rate(tally, minGames) {
  return tally.games >= minGames ? tally.wins / tally.games : null;
}

function entries(map, minGames, limit) {
  return [...map.entries()]
    .map(([heroId, tally]) => ({
      heroId,
      games: tally.games,
      wins: tally.wins,
      winRate: rate(tally, minGames),
      insufficient: tally.games < minGames
    }))
    .sort(
      (left, right) =>
        right.games - left.games ||
        right.wins - left.wins ||
        left.heroId.localeCompare(right.heroId)
    )
    .slice(0, limit);
}

/** Walks every completed game once and returns the per-hero numbers for `heroId`. */
export function computeHeroScrimStats(seriesList, heroId, { minGames = 30, limit = 10 } = {}) {
  const picked = emptyTally();
  const synergies = new Map();
  const matchups = new Map();
  const lanes = new Map();
  let totalGames = 0;
  let banned = 0;
  let seriesCount = 0;

  for (const series of seriesList) {
    if (!series.games.length) {
      continue;
    }
    seriesCount += 1;
    for (const game of series.games) {
      totalGames += 1;
      const { picks, bans, pickAssignments } = game.draft;
      if (bans.blue.includes(heroId) || bans.red.includes(heroId)) {
        banned += 1;
      }
      for (const side of ["blue", "red"]) {
        if (!picks[side].includes(heroId)) {
          continue;
        }
        const teamName = side === "blue" ? game.blueTeam : game.redTeam;
        const won = game.winner === teamName;
        picked.games += 1;
        if (won) {
          picked.wins += 1;
        }
        const lane = pickAssignments?.[side]?.find(entry => entry.heroId === heroId)?.lane;
        if (lane) {
          const tally = lanes.get(lane) ?? emptyTally();
          tally.games += 1;
          if (won) {
            tally.wins += 1;
          }
          lanes.set(lane, tally);
        }
        for (const mate of picks[side]) {
          if (mate === heroId) {
            continue;
          }
          const tally = synergies.get(mate) ?? emptyTally();
          tally.games += 1;
          if (won) {
            tally.wins += 1;
          }
          synergies.set(mate, tally);
        }
        for (const opponent of picks[side === "blue" ? "red" : "blue"]) {
          const tally = matchups.get(opponent) ?? emptyTally();
          tally.games += 1;
          if (won) {
            tally.wins += 1;
          }
          matchups.set(opponent, tally);
        }
      }
    }
  }

  return {
    label: "Your scrims",
    minGames,
    seriesCount,
    totalGames,
    picked: picked.games,
    wins: picked.wins,
    losses: picked.games - picked.wins,
    banned,
    winRate: rate(picked, minGames),
    pickRate: totalGames >= minGames ? picked.games / totalGames : null,
    banRate: totalGames >= minGames ? banned / totalGames : null,
    insufficient: picked.games < minGames,
    lanes: entries(lanes, minGames, 5).map(({ heroId: lane, ...rest }) => ({ lane, ...rest })),
    synergies: entries(synergies, minGames, limit),
    matchups: entries(matchups, minGames, limit)
  };
}

/** Per-hero totals across all scrims, for History tables. Same threshold rule. */
export function computeAllHeroScrimStats(seriesList, { minGames = 30 } = {}) {
  const byHero = new Map();
  let totalGames = 0;
  const ensure = heroId =>
    byHero.get(heroId) ?? byHero.set(heroId, { picked: 0, wins: 0, banned: 0 }).get(heroId);
  for (const series of seriesList) {
    for (const game of series.games) {
      totalGames += 1;
      for (const side of ["blue", "red"]) {
        const teamName = side === "blue" ? game.blueTeam : game.redTeam;
        for (const heroId of game.draft.picks[side]) {
          const stats = ensure(heroId);
          stats.picked += 1;
          if (game.winner === teamName) {
            stats.wins += 1;
          }
        }
        for (const heroId of game.draft.bans[side]) {
          ensure(heroId).banned += 1;
        }
      }
    }
  }
  const rows = [...byHero.entries()]
    .map(([heroId, stats]) => ({
      heroId,
      picked: stats.picked,
      banned: stats.banned,
      wins: stats.wins,
      losses: stats.picked - stats.wins,
      winRate: stats.picked >= minGames ? stats.wins / stats.picked : null,
      insufficient: stats.picked < minGames
    }))
    .sort(
      (left, right) =>
        right.picked + right.banned - left.picked - left.banned ||
        left.heroId.localeCompare(right.heroId)
    );
  return { label: "Your scrims", minGames, totalGames, rows };
}

/**
 * Totals across the viewer's own recorded games (History header). Rates follow the same sample
 * threshold.
 */
export function computeOverviewStats(seriesList, { minGames = 30 } = {}) {
  let games = 0;
  let totalDuration = 0;
  let shortest = null;
  let longest = null;
  let blueWins = 0;
  let seriesCount = 0;
  const byMode = { "global-ban-pick": 0, "free-for-all": 0, classic: 0 };
  for (const series of seriesList) {
    if (!series.games.length) {
      continue;
    }
    seriesCount += 1;
    byMode[series.gameMode] = (byMode[series.gameMode] ?? 0) + series.games.length;
    for (const game of series.games) {
      games += 1;
      totalDuration += game.durationSeconds || 0;
      shortest =
        shortest === null ? game.durationSeconds : Math.min(shortest, game.durationSeconds);
      longest = longest === null ? game.durationSeconds : Math.max(longest, game.durationSeconds);
      if (game.winner === game.blueTeam) {
        blueWins += 1;
      }
    }
  }
  return {
    label: "Your scrims",
    minGames,
    seriesCount,
    gamesCount: games,
    totalDurationSeconds: totalDuration,
    averageDurationSeconds: games ? Math.round(totalDuration / games) : null,
    shortestSeconds: shortest,
    longestSeconds: longest,
    blueWins,
    redWins: games - blueWins,
    blueWinRate: games >= minGames ? blueWins / games : null,
    byMode
  };
}
