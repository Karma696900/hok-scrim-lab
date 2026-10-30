// What the tournament games say about the drafts and the heroes that are played most and that win
// most. Pure: the caller gives the games of the period (see store.competitiveGames). Only real
// tournament games enter here, never the scrims of a team, and nothing is guessed: a pick whose lane
// was not entered is not put in a lane.
import { PICK_LANES } from "../../../shared/draft-model.js";

const POPULAR_LIMIT = 20;
const SIDES = ["blue", "red"];
const DRAFT_SIZE = 5;

const bump = (counts, key) => counts.set(key, (counts.get(key) ?? 0) + 1);

/** The three heroes met most often, then by id so that two equal counts always give the same order. */
const topThree = counts =>
  [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([heroId, count]) => ({ heroId, count }));

const winRateOf = entry => (entry.games ? entry.wins / entry.games : 0);

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

const confidenceRank = entry => confidenceOf(entry.wins, entry.games);
/** The most reliable win rate first (see confidenceOf), then the most games; then the same order every time. */
const byWinRate = (a, b) =>
  confidenceRank(b) - confidenceRank(a) ||
  winRateOf(b) - winRateOf(a) ||
  b.games - a.games ||
  a.key.localeCompare(b.key);
/** The most played first: that is the popularity; the win rate only separates equals. */
const byPlays = (a, b) =>
  b.games - a.games ||
  confidenceRank(b) - confidenceRank(a) ||
  winRateOf(b) - winRateOf(a) ||
  a.key.localeCompare(b.key);

const blank = key => ({
  key,
  games: 0,
  wins: 0,
  lastPlayed: "",
  beaten: new Map(), // the heroes of the other side, in the games that were won
  lostTo: new Map() // and in the games that were lost
});

/** One more game for an entry: who was against it, and whether it won. */
function record(entry, game, enemies, won) {
  entry.games += 1;
  entry.wins += won ? 1 : 0;
  if (game.playedOn > entry.lastPlayed) {
    entry.lastPlayed = game.playedOn;
  }
  for (const heroId of enemies) {
    bump(won ? entry.beaten : entry.lostTo, heroId);
  }
}

const finish = (entry, extra) => ({
  ...extra,
  games: entry.games,
  wins: entry.wins,
  losses: entry.games - entry.wins,
  winRate: entry.games ? entry.wins / entry.games : null,
  confidence: confidenceOf(entry.wins, entry.games),
  lastPlayed: entry.lastPlayed || null,
  whenWon: topThree(entry.beaten),
  whenLost: topThree(entry.lostTo)
});

/** The two rankings of a table of entries: the ones with the most wins out of their games, and the most played. */
function ranked(entries, { minGames, limit }) {
  const eligible = entries.filter(entry => entry.games >= minGames);
  const cut = (compare, details) =>
    eligible
      .slice()
      .sort(compare)
      .slice(0, limit)
      .map(entry => finish(entry, details(entry)));
  return { eligible: eligible.length, entries: entries.length, cut };
}

const sideWon = (game, side) => (side === "blue" ? game.blueTeam : game.redTeam) === game.winner;

/** Two drafts of the same group differ by at most this many heroes (they share at least three of five). */
const MAX_DIFFERENT_HEROES = 2;

/**
 * Compositions that look alike are one group: the most played draft leads (its heroes, in lane order when known),
 * and every other draft that differs from it by at most two heroes is one of its variants, marked with the heroes
 * that were swapped. A draft goes to the group of the leader it shares the most heroes with (at least three), the
 * bigger group when equal; a draft that resembles none leads a group of its own. The leader is never moved, so
 * two variants of the same group may differ by more than two between them but each is close to the leader.
 * Takes the exact drafts of a side (entries of `blank` with `heroes` and `order`) and returns the groups.
 */
export function groupDrafts(drafts) {
  const ordered = drafts
    .slice()
    .sort(
      (a, b) =>
        b.games - a.games || confidenceRank(b) - confidenceRank(a) || a.key.localeCompare(b.key)
    );
  const groups = [];
  const leadersOf = new Map(); // hero id -> the groups whose leader holds it
  for (const draft of ordered) {
    const shared = new Map(); // group -> heroes shared with its leader
    for (const heroId of draft.heroes) {
      for (const group of leadersOf.get(heroId) ?? []) {
        shared.set(group, (shared.get(group) ?? 0) + 1);
      }
    }
    let best = null;
    for (const [group, count] of shared) {
      if (
        count >= DRAFT_SIZE - MAX_DIFFERENT_HEROES &&
        (!best || count > best.count || (count === best.count && group.index < best.group.index))
      ) {
        best = { group, count };
      }
    }
    if (best) {
      best.group.variants.push(draft);
      continue;
    }
    const group = { index: groups.length, leader: draft, variants: [draft] };
    groups.push(group);
    for (const heroId of draft.heroes) {
      leadersOf.set(heroId, [...(leadersOf.get(heroId) ?? []), group]);
    }
  }
  return groups.map(group => {
    const total = blank(group.leader.key);
    for (const variant of group.variants) {
      total.games += variant.games;
      total.wins += variant.wins;
      if (variant.lastPlayed > total.lastPlayed) {
        total.lastPlayed = variant.lastPlayed;
      }
      for (const [heroId, count] of variant.beaten) {
        total.beaten.set(heroId, (total.beaten.get(heroId) ?? 0) + count);
      }
      for (const [heroId, count] of variant.lostTo) {
        total.lostTo.set(heroId, (total.lostTo.get(heroId) ?? 0) + count);
      }
    }
    return { ...total, leader: group.leader, variants: group.variants };
  });
}

/**
 * What changed in a variant compared with the leader: the heroes it does not have, and the ones that took their
 * place. When both drafts are in lane order a hero is paired with the one that stands in its lane; otherwise
 * the pairs follow the order of the lists.
 */
function swapsOf(leader, variant) {
  const out = leader.heroes.filter(id => !variant.heroes.includes(id));
  const into = variant.heroes.filter(id => !leader.heroes.includes(id));
  const taken = new Set();
  return out.map(heroId => {
    const lane = leader.heroes.indexOf(heroId);
    const sameLane = leader.laned && variant.laned ? variant.heroes[lane] : null;
    const replacement =
      sameLane && into.includes(sameLane) && !taken.has(sameLane)
        ? sameLane
        : (into.find(id => !taken.has(id)) ?? null);
    if (replacement) {
      taken.add(replacement);
    }
    return { out: heroId, in: replacement };
  });
}

/**
 * The drafts (the five picks of a side, whatever the order they were picked in), for each side, grouped when they
 * look alike (see groupDrafts): the best groups by reliable win rate (see confidenceOf) and the most played. A draft
 * is shown in lane order when a game entered its five lanes, else sorted by hero id; `laned` says which. Each group
 * lists its variants, the most played first, with the heroes that differ from the leader.
 */
export function popularDrafts(games, { minGames = 1, limit = POPULAR_LIMIT } = {}) {
  const result = {};
  for (const side of SIDES) {
    const other = side === "blue" ? "red" : "blue";
    const drafts = new Map();
    for (const game of games) {
      const picks = game.picks[side];
      if (picks.length !== DRAFT_SIZE || new Set(picks).size !== DRAFT_SIZE) {
        continue;
      } // five different heroes: anything else is not a draft
      const key = [...picks].sort().join(".");
      const entry = drafts.get(key) ?? { ...blank(key), heroes: [...picks].sort(), order: null };
      record(entry, game, game.picks[other], sideWon(game, side));
      const lanes = game.pickLanes?.[side] ?? [];
      if (!entry.order && lanes.length === DRAFT_SIZE && lanes.every(Boolean)) {
        entry.order = PICK_LANES.map(lane => picks[lanes.indexOf(lane)]);
      }
      drafts.set(key, entry);
    }
    const shown = entry => ({
      ...entry,
      heroes: entry.order ?? entry.heroes,
      laned: Boolean(entry.order)
    });
    const groups = groupDrafts([...drafts.values()]);
    const table = ranked(groups, { minGames, limit });
    const details = group => {
      const leader = shown(group.leader);
      const variants = group.variants
        .slice()
        .sort(byPlays)
        .map(variant => {
          const form = shown(variant);
          return finish(variant, {
            heroes: form.heroes,
            laned: form.laned,
            leader: variant === group.leader,
            swaps: variant === group.leader ? [] : swapsOf(leader, form)
          });
        });
      const common = leader.heroes.filter(id =>
        group.variants.every(variant => variant.heroes.includes(id))
      );
      return { heroes: leader.heroes, laned: leader.laned, core: common, variants };
    };
    result[side] = {
      different: drafts.size,
      groups: groups.length,
      eligible: table.eligible,
      byWinRate: table.cut(byWinRate, details),
      byPlays: table.cut(byPlays, details)
    };
  }
  return result;
}

/**
 * The heroes of each lane (the lane entered for the pick), for the two sides together and for each
 * side: the best by win rate and the most played, with the heroes of the other side they met most
 * when they won and when they lost.
 */
export function popularHeroes(games, { minGames = 1, limit = POPULAR_LIMIT } = {}) {
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
        for (const scope of ["all", side]) {
          const table = tables.get(lane)[scope];
          const entry = table.get(heroId) ?? { ...blank(heroId), heroId };
          record(entry, game, game.picks[other], won);
          table.set(heroId, entry);
        }
      });
    }
  }
  const lanes = PICK_LANES.map(lane => {
    const view = {};
    for (const scope of ["all", "blue", "red"]) {
      const table = ranked([...tables.get(lane)[scope].values()], { minGames, limit });
      const details = entry => ({ heroId: entry.heroId });
      view[scope] = {
        different: table.entries,
        eligible: table.eligible,
        byWinRate: table.cut(byWinRate, details),
        byPlays: table.cut(byPlays, details)
      };
    }
    return { lane, picks: laneGames.get(lane), ...view };
  });
  return { lanes, placed, unplaced };
}
