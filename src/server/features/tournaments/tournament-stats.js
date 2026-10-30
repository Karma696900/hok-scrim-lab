// Statistics read from tournament series: pairings, the order of the picks, a hero in tournaments.
import { PAIRING_MIN_GAMES } from "../../../shared/pairing.js";
import { confidenceOf } from "./popular.js";

// ---- statistics ---------------------------------------------------------------------------------

/** The games a hero was seen in with (or against) the hero asked about, and how many of them that hero's side won. */
const bump = (records, id, won) => {
  const record = records.get(id) ?? { games: 0, wins: 0 };
  record.games += 1;
  record.wins += won ? 1 : 0;
  records.set(id, record);
};

/**
 * Three heroes of a pairing list, the most reliable rate first (the lower end of the Wilson interval, see confidenceOf)
 * over the games the asked hero's side won (`score` "wins") or lost ("losses"). A hero with none of them is never listed,
 * and one already placed in another list (`taken`) is skipped: the next hero takes its place.
 */
const pairingList = (records, score, taken, limit = 3) => {
  const count = record => (score === "wins" ? record.wins : record.games - record.wins);
  const chosen = [...records]
    .filter(
      ([id, record]) => record.games >= PAIRING_MIN_GAMES && count(record) > 0 && !taken.has(id)
    )
    .sort(
      ([idA, a], [idB, b]) =>
        confidenceOf(count(b), b.games) - confidenceOf(count(a), a.games) ||
        count(b) - count(a) ||
        a.games - b.games ||
        idA.localeCompare(idB)
    )
    .slice(0, limit)
    .map(([heroId, record]) => ({ heroId, count: count(record), games: record.games }));
  for (const { heroId } of chosen) {
    taken.add(heroId);
  }
  return chosen;
};

/**
 * The four lists of the pairings: who the hero wins best with and against, then who it loses most with and against.
 * A hero is in at most ONE of them: the wins are placed first, the losses take the next hero.
 */
const pairingLists = (allies, enemies) => {
  const taken = new Set();
  return {
    bestAllies: pairingList(allies, "wins", taken),
    bestEnemies: pairingList(enemies, "wins", taken),
    worstAllies: pairingList(allies, "losses", taken),
    worstEnemies: pairingList(enemies, "losses", taken)
  };
};

/**
 * What the order of the picks and bans says about one hero: the average position it was picked at (1 = the
 * first pick of its side) and banned at (1 = the first ban of its side). Only the games whose order is known
 * count (`pickOrderKnown`: the order was seen, not taken from a list of heroes): the others are left out, and
 * `games` says how many there were.
 */
export function pickOrderStats(games, heroId) {
  let counted = 0,
    picked = 0,
    pickSum = 0,
    banned = 0,
    banSum = 0;
  for (const game of games) {
    if (game.pickOrderKnown !== true) {
      continue;
    }
    counted += 1;
    for (const side of ["blue", "red"]) {
      const pick = game.picks[side].indexOf(heroId);
      if (pick >= 0) {
        picked += 1;
        pickSum += pick + 1;
      }
      const ban = game.bans[side].indexOf(heroId);
      if (ban >= 0) {
        banned += 1;
        banSum += ban + 1;
      }
    }
  }
  return {
    games: counted,
    picked,
    pickPosition: picked ? pickSum / picked : null,
    banned,
    banPosition: banned ? banSum / banned : null
  };
}

/**
 * What the tournament games say about one hero. `games` are the games of the chosen window (already
 * filtered by date). - picks / bans / wins / losses, pick rate, ban rate, presence and win rate
 * (all over the games of the window), - blue / red side split, - the 3 heroes on the SAME side and
 * the 3 on the OPPOSING side that it wins best with / against, then the 3 + 3 it loses most with / against (see
 * pairingLists: a hero is in one list only). A hero that
 * is both picked and banned in a game counts for neither twice (it cannot happen: a hero appears
 * once per game).
 */
export function heroTournamentStats(games, heroId, rule = null) {
  const filteredGames = rule ? games.filter(game => game.rule === rule) : games;
  const total = filteredGames.length;
  let picks = 0,
    bans = 0,
    wins = 0;
  const side = { blue: { picks: 0, wins: 0 }, red: { picks: 0, wins: 0 } };
  const allies = new Map(),
    enemies = new Map();
  let lastPlayed = "";
  for (const game of filteredGames) {
    // one side, or both in an Ultimate Battle where both teams took the hero (a pick for each team)
    const holding = ["blue", "red"].filter(team => game.picks[team].includes(heroId));
    for (const mine of holding) {
      picks += 1;
      const won = (mine === "blue" ? game.blueTeam : game.redTeam) === game.winner;
      side[mine].picks += 1;
      const other = mine === "blue" ? "red" : "blue";
      if (won) {
        wins += 1;
        side[mine].wins += 1;
      }
      for (const id of game.picks[mine]) {
        if (id !== heroId) {
          bump(allies, id, won);
        }
      }
      for (const id of game.picks[other]) {
        if (id !== heroId) {
          bump(enemies, id, won);
        }
      }
      if (game.playedOn > lastPlayed) {
        lastPlayed = game.playedOn;
      }
    }
    if (!holding.length && (game.bans.blue.includes(heroId) || game.bans.red.includes(heroId))) {
      bans += 1;
    }
  }
  const rate = (value, of) => (of ? value / of : null);
  return {
    order: pickOrderStats(filteredGames, heroId),
    totalGames: total,
    picks,
    bans,
    wins,
    losses: picks - wins,
    winRate: rate(wins, picks),
    pickRate: rate(picks, total),
    banRate: rate(bans, total),
    presence: rate(picks + bans, total),
    side: {
      blue: { ...side.blue, winRate: rate(side.blue.wins, side.blue.picks) },
      red: { ...side.red, winRate: rate(side.red.wins, side.red.picks) }
    },
    ...pairingLists(allies, enemies),
    lastPlayed: lastPlayed || null
  };
}
