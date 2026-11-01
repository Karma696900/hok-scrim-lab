// What the tournament games say about the drafts and the heroes that are played most and that win
// most. Pure: the caller gives the games of the period (see store.competitiveGames). Only real
// tournament games enter here, never the scrims of a team, and nothing is guessed: a pick whose lane
// was not entered is not put in a lane. Every game weighs by its age (popular-score.js) and the
// win rates are pulled toward the average: `score` ranks, the raw counts are shown.
import { PICK_LANES } from "../../../shared/draft-model.js";
import { heroWeight } from "./popular-score.js";
import {
  POPULAR_LIMIT,
  SIDES,
  byWinRate,
  byPlays,
  blank,
  finish,
  todayOf,
  sideWon,
  record,
  ranked
} from "./popular-shared.js";

export { confidenceOf } from "./popular-shared.js";
export { groupDrafts, popularDrafts } from "./popular-drafts.js";

/** How often each hero was there in the games: picked (any lane, any side), banned, either. */
function presenceOf(games) {
  const counts = new Map();
  const of = heroId => {
    const entry = counts.get(heroId) ?? { picked: 0, banned: 0, present: 0 };
    counts.set(heroId, entry);
    return entry;
  };
  for (const game of games) {
    const picked = new Set([...game.picks.blue, ...game.picks.red]);
    const banned = new Set([...(game.bans?.blue ?? []), ...(game.bans?.red ?? [])]);
    for (const heroId of new Set([...picked, ...banned])) {
      const entry = of(heroId);
      entry.picked += picked.has(heroId) ? 1 : 0;
      entry.banned += banned.has(heroId) ? 1 : 0;
      entry.present += 1;
    }
  }
  return counts;
}

/** The most present first (picked or banned), then the most played; then the same order every time. */
const byPresence = (a, b) =>
  b.presence - a.presence || b.games - a.games || b.score - a.score || a.key.localeCompare(b.key);

/**
 * The heroes of each lane (the lane entered for the pick), for the two sides together and for each
 * side: the best by score, the most played and the most present (picked or banned), with the
 * heroes of the other side they met most when they won and when they lost. A game weighs by its age,
 * half again for a hero when it was played before the hero's last balance change (`lastChange`); the
 * score of a hero is pulled toward 50 %, the average of every lane. A hero banned but not played in a lane
 * is listed among the most present of each lane it can play (`heroLanes`).
 */
export function popularHeroes(
  games,
  { minGames = 1, limit = POPULAR_LIMIT, today = null, lastChange = {}, heroLanes = {} } = {}
) {
  const day = todayOf(games, today);
  const tables = new Map(
    PICK_LANES.map(lane => [lane, { all: new Map(), blue: new Map(), red: new Map() }])
  );
  const laneGames = new Map(PICK_LANES.map(lane => [lane, 0]));
  let placed = 0;
  let unplaced = 0;
  for (const game of games) {
    for (const side of SIDES) {
      const other = side === "blue" ? "red" : "blue";
      const won = sideWon(game, side);
      game.picks[side].forEach((heroId, index) => {
        const lane = game.pickLanes?.[side]?.[index] ?? null;
        if (!lane || !tables.has(lane)) {
          unplaced += 1;
          return;
        }
        placed += 1;
        laneGames.set(lane, laneGames.get(lane) + 1);
        const weight = heroWeight(game.playedOn, day, lastChange[heroId] ?? null);
        for (const scope of ["all", side]) {
          const table = tables.get(lane)[scope];
          const entry = table.get(heroId) ?? { ...blank(heroId), heroId };
          record(entry, game, game.picks[other], won, weight);
          table.set(heroId, entry);
        }
      });
    }
  }
  const presence = presenceOf(games);
  const total = games.length;
  const rates = (heroId, entry) => {
    const seen = presence.get(heroId) ?? { banned: 0, present: 0 };
    return {
      pickRate: total ? entry.games / total : 0,
      banRate: total ? seen.banned / total : 0,
      presence: total ? seen.present / total : 0
    };
  };
  const lanes = PICK_LANES.map(lane => {
    const view = {};
    for (const scope of ["all", "blue", "red"]) {
      const entries = [...tables.get(lane)[scope].values()];
      // every game of a lane has a winner and a loser: the average a score is pulled toward is 50 %
      const prior = 0.5;
      const table = ranked(entries, { minGames, limit, prior });
      const details = entry => ({ heroId: entry.heroId, ...rates(entry.heroId, entry) });
      // the heroes banned in this lane's games but not played in it
      const bannedOnly = [...presence.keys()]
        .filter(id => !tables.get(lane)[scope].has(id) && (heroLanes[id] ?? []).includes(lane))
        .map(id => ({ ...blank(id), heroId: id, score: prior }));
      const present = [...entries, ...(scope === "all" ? bannedOnly : [])]
        .map(entry => ({ entry, ...rates(entry.heroId, entry) }))
        .filter(item => item.presence > 0)
        .map(item => Object.assign(item.entry, { presence: item.presence }))
        .sort(byPresence)
        .slice(0, limit)
        .map(entry => finish(entry, details(entry)));
      view[scope] = {
        different: table.entries,
        eligible: table.eligible,
        byWinRate: table.cut(byWinRate, details),
        byPlays: table.cut(byPlays, details),
        byPresence: present
      };
    }
    return { lane, picks: laneGames.get(lane), ...view };
  });
  return { lanes, placed, unplaced, games: total };
}
