// The best duos of the tournaments: two heroes picked on the same side, over all the lanes and for
// each pair of lanes (when the game entered them), ranked by the shared score. Pure.
import { PICK_LANES } from "../../../shared/draft-model.js";
import { recencyWeight } from "./popular-score.js";
import {
  POPULAR_LIMIT,
  SIDES,
  blank,
  byPlays,
  byWinRate,
  record,
  ranked,
  sideWon,
  todayOf
} from "./popular-shared.js";

/** "Jungle+Roamer": the two lanes in the order of the draft board. */
const laneKey = (a, b) =>
  PICK_LANES.indexOf(a) < PICK_LANES.indexOf(b) ? `${a}+${b}` : `${b}+${a}`;

/**
 * The duos with at least `minGames` games: `all` by score, `byLanes["Jungle+Roamer"]` the same for
 * the duos whose lanes were entered, and `mostPlayed` over all the lanes.
 */
export function popularDuos(games, { minGames = 1, limit = POPULAR_LIMIT, today = null } = {}) {
  const day = todayOf(games, today);
  const all = new Map();
  const byLanes = new Map();
  const add = (table, key, heroes, lanes, game, enemies, won, weight) => {
    const entry = table.get(key) ?? { ...blank(key), heroes, lanes };
    record(entry, game, enemies, won, weight);
    table.set(key, entry);
  };
  for (const game of games) {
    const weight = recencyWeight(game.playedOn, day);
    for (const side of SIDES) {
      const other = side === "blue" ? "red" : "blue";
      const picks = game.picks[side];
      const lanes = game.pickLanes?.[side] ?? [];
      const won = sideWon(game, side);
      for (let i = 0; i < picks.length; i += 1) {
        for (let j = i + 1; j < picks.length; j += 1) {
          const [a, b] = [picks[i], picks[j]].sort();
          add(all, `${a}+${b}`, [a, b], null, game, game.picks[other], won, weight);
          if (lanes[i] && lanes[j] && lanes[i] !== lanes[j]) {
            const pair = laneKey(lanes[i], lanes[j]);
            const ordered = pair.startsWith(lanes[i]) ? [picks[i], picks[j]] : [picks[j], picks[i]];
            const table = byLanes.get(pair) ?? new Map();
            byLanes.set(pair, table);
            add(
              table,
              ordered.join("+"),
              ordered,
              pair.split("+"),
              game,
              game.picks[other],
              won,
              weight
            );
          }
        }
      }
    }
  }
  const details = entry => ({ heroes: entry.heroes, lanes: entry.lanes });
  const table = ranked([...all.values()], { minGames, limit });
  return {
    all: table.cut(byWinRate, details),
    mostPlayed: table.cut(byPlays, details),
    byLanes: Object.fromEntries(
      [...byLanes]
        .sort(
          (a, b) => PICK_LANES.indexOf(a[0]) - PICK_LANES.indexOf(b[0]) || a[0].localeCompare(b[0])
        )
        .map(([pair, entries]) => [
          pair,
          ranked([...entries.values()], { minGames, limit }).cut(byWinRate, details)
        ])
    )
  };
}
