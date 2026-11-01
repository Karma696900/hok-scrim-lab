// The popular drafts of the tournaments: the five picks of a side, grouped when they look alike.
// Pure: the caller gives the games of the period.
import { PICK_LANES } from "../../../shared/draft-model.js";
import { bayesian, recencyWeight } from "./popular-score.js";
import {
  POPULAR_LIMIT,
  SIDES,
  DRAFT_SIZE,
  byWinRate,
  byPlays,
  blank,
  finish,
  todayOf,
  sideWon,
  record,
  ranked
} from "./popular-shared.js";

/** Two drafts of the same group differ by at most this many heroes (they share at least three of five). */
const MAX_DIFFERENT_HEROES = 2;

/**
 * The place of each pick of a side in the ten picks of a game (B1, R1 R2, B2 B3, R3 R4, B4 B5, R5): `picks` lists a
 * side's heroes in the order they were picked when `pickOrderKnown`.
 */
const SEQUENCE = { blue: [0, 3, 4, 7, 8], red: [1, 2, 5, 6, 9] };
const PHASES = ["first", "early", "early", "late", "last"];

/** The phase of a side's pick `index` (0 to 4): its first pick, the 2nd and 3rd, the 4th, its last. */
export const pickPhase = index => PHASES[index];

/** The enemy hero picked just before a side's pick `index`, when that pick answers it; else null. */
export function counterOf(game, side, index) {
  const other = side === "blue" ? "red" : "blue";
  const before = SEQUENCE[other].indexOf(SEQUENCE[side][index] - 1);
  return before >= 0 ? (game.picks[other][before] ?? null) : null;
}

/** How alike two drafts are: heroes in the same lane when both have their lanes, else heroes in common. */
function likeness(leader, draft) {
  if (leader.order && draft.order) {
    return leader.order.filter((heroId, lane) => draft.order[lane] === heroId).length;
  }
  return draft.heroes.filter(heroId => leader.heroes.includes(heroId)).length;
}

/** The leaders first: the drafts played twice or more, then the best score, then the most games. */
const leaderOrder = (a, b) =>
  Number(b.games >= 2) - Number(a.games >= 2) ||
  b.score - a.score ||
  b.games - a.games ||
  a.key.localeCompare(b.key);

/**
 * Compositions that look alike are one group: the draft with the best score leads (among the drafts played twice or
 * more first), and every other draft that has at least three heroes of the leader in the same lanes (or, when the
 * lanes of one of them are unknown, three heroes in common) is one of its variants, marked with the heroes that were
 * swapped. A draft goes to the group of the leader it is most alike, the bigger group when equal; a draft that resembles none leads a group of its own. The leader is never moved, so
 * two variants of the same group may differ by more than two between them but each is close to the leader.
 * Takes the exact drafts of a side (entries of `blank` with `heroes` and `order`) and returns the groups.
 */
export function groupDrafts(drafts) {
  for (const draft of drafts) {
    draft.score = bayesian(draft.weightedWins, draft.weight, 0.5);
  }
  const ordered = drafts.slice().sort(leaderOrder);
  const groups = [];
  const leadersOf = new Map(); // hero id -> the groups whose leader holds it
  for (const draft of ordered) {
    const shared = new Map(); // group -> how alike the draft is to its leader
    for (const heroId of draft.heroes) {
      for (const group of leadersOf.get(heroId) ?? []) {
        shared.set(group, likeness(group.leader, draft));
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
      total.weight += variant.weight;
      total.weightedWins += variant.weightedWins;
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

/** One more game whose pick order was seen: the phase of each hero of the draft and the enemy it answered. */
function tally(entry, game, side) {
  entry.phaseTally ??= {};
  game.picks[side].forEach((heroId, index) => {
    const mark = (entry.phaseTally[heroId] ??= { phases: {}, counters: {} });
    const phase = pickPhase(index);
    mark.phases[phase] = (mark.phases[phase] ?? 0) + 1;
    const enemy = counterOf(game, side, index);
    if (enemy) {
      mark.counters[enemy] = (mark.counters[enemy] ?? 0) + 1;
    }
  });
}

/** The key met most often in `counts`, the smallest key when equal; null when empty. */
const most = counts =>
  Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

/** The phase each hero of a group is picked in most, and the enemy it answers most (null when none). */
function phasesOf(variants) {
  const merged = {};
  for (const variant of variants) {
    for (const [heroId, mark] of Object.entries(variant.phaseTally ?? {})) {
      const into = (merged[heroId] ??= { phases: {}, counters: {} });
      for (const [key, count] of Object.entries(mark.phases)) {
        into.phases[key] = (into.phases[key] ?? 0) + count;
      }
      for (const [key, count] of Object.entries(mark.counters)) {
        into.counters[key] = (into.counters[key] ?? 0) + count;
      }
    }
  }
  return Object.fromEntries(
    Object.entries(merged)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([heroId, mark]) => [
        heroId,
        { phase: most(mark.phases), counterTo: most(mark.counters) }
      ])
  );
}

/**
 * The drafts (the five picks of a side, whatever the order they were picked in), for each side, grouped when they
 * look alike (see groupDrafts): the best groups by reliable win rate (see confidenceOf) and the most played. A draft
 * is shown in lane order when a game entered its five lanes, else sorted by hero id; `laned` says which. Each group
 * lists its variants, the most played first, with the heroes that differ from the leader.
 */
export function popularDrafts(games, { minGames = 1, limit = POPULAR_LIMIT, today = null } = {}) {
  const day = todayOf(games, today);
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
      record(
        entry,
        game,
        game.picks[other],
        sideWon(game, side),
        recencyWeight(game.playedOn, day)
      );
      if (game.pickOrderKnown === true) {
        tally(entry, game, side);
      }
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
      return {
        heroes: leader.heroes,
        laned: leader.laned,
        core: common,
        variants,
        phases: phasesOf(group.variants)
      };
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
