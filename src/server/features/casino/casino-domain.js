// The composition roulette's rules (spec 2026-11-07 casino): the pools of each lane, what a request may ask, and the
// draw itself. Pure: no database, no clock and no randomness of its own (the routes pass `now` and `pick`).
import { badRequest } from "../../platform/errors.js";

/** The five lanes, in the order they are shown and drawn. */
export const LANE_KEYS = ["clash", "jungle", "mid", "farm", "roam"];

const SITE_LANES = {
  "Clash Lane": "clash",
  Jungle: "jungle",
  "Mid Lane": "mid",
  "Farm Lane": "farm",
  Roamer: "roam"
};

/** How many heroes a pool may hold, and how many spins the history keeps. */
export const POOL_MAX = 200;
export const HISTORY_SIZE = 10;

/** The lane key of one of the site's lane names ("Roamer" -> "roam"), or null. */
export const laneKeyOf = siteLane => SITE_LANES[siteLane] ?? null;

const noLanes = fill => Object.fromEntries(LANE_KEYS.map(lane => [lane, fill()]));

/** Every hero in the pool of each of its lanes, ids sorted. */
export function defaultPools(heroes) {
  const pools = noLanes(() => []);
  for (const hero of heroes) {
    for (const lane of new Set((hero.lanes ?? []).map(laneKeyOf).filter(Boolean))) {
      pools[lane].push(hero.id);
    }
  }
  for (const lane of LANE_KEYS) {
    pools[lane].sort();
  }
  return pools;
}

const invalidPools = () =>
  badRequest("Each lane's pool must be a list of at most {max} heroes.", "invalid_pools", {
    max: POOL_MAX
  });

/** The pools a request sends: a list per lane (a lane left out is empty); unknown ids and repeats are dropped. */
export function parsePools(body, known) {
  const input = body?.pools;
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw invalidPools();
  }
  const pools = noLanes(() => []);
  for (const lane of LANE_KEYS) {
    const ids = input[lane] ?? [];
    if (!Array.isArray(ids) || ids.length > POOL_MAX * 2) {
      throw invalidPools();
    }
    pools[lane] = [...new Set(ids.filter(id => typeof id === "string" && known.has(id)))];
    if (pools[lane].length > POOL_MAX) {
      throw invalidPools();
    }
  }
  return pools;
}

/** The lanes a respin asks for: one to five distinct lanes, returned in the lanes' order. */
export function parseLanes(body) {
  const lanes = body?.lanes;
  if (
    !Array.isArray(lanes) ||
    !lanes.length ||
    new Set(lanes).size !== lanes.length ||
    lanes.some(lane => !LANE_KEYS.includes(lane))
  ) {
    throw badRequest("Choose one to five lanes to spin.", "invalid_lanes");
  }
  return LANE_KEYS.filter(lane => lanes.includes(lane));
}

/** A roulette that has not spun yet. */
export const emptyState = pools => ({
  pools,
  banned: [],
  result: noLanes(() => null),
  drawn: [],
  history: []
});

/**
 * Draws `lanes`, one after the other in the lanes' order: each takes a hero of its pool that is not banned, still
 * listed by the site (`known`), and not shown in another lane; a lane drawn again also skips the hero it shows when
 * another is left; a lane with none left shows nobody (null). `pick(n)`
 * gives an index in [0, n). Returns a new state with the spin first in its history.
 */
export function draw(state, lanes, { known, pick, now, kind, hero }) {
  const result = { ...state.result };
  const banned = new Set(state.banned);
  for (const lane of LANE_KEYS.filter(l => lanes.includes(l))) {
    const shown = new Set(LANE_KEYS.filter(l => l !== lane).map(l => result[l]));
    const free = (state.pools[lane] ?? []).filter(
      id => known.has(id) && !banned.has(id) && !shown.has(id)
    );
    // a lane drawn again changes its hero whenever its pool has another (owner, 2026-11-07: respin), a spin of all
    // five lanes too (the Respin button with five lanes ticked is one)
    const other = free.filter(id => id !== state.result[lane]);
    const left = other.length ? other : free;
    result[lane] = left.length ? left[pick(left.length)] : null;
  }
  const drawn = LANE_KEYS.filter(l => lanes.includes(l));
  const entry = { at: now, kind, lanes: drawn, result, ...(hero ? { hero } : {}) };
  return {
    ...state,
    banned: [...state.banned],
    result,
    drawn,
    history: [entry, ...state.history].slice(0, HISTORY_SIZE)
  };
}

/** Bans the hero shown in `lane` (out of every pool of this roulette) and draws that lane again. */
export function banLane(state, lane, { known, pick, now }) {
  const hero = state.result[lane];
  if (!LANE_KEYS.includes(lane) || !hero) {
    throw badRequest("No hero is shown in this lane.", "nothing_to_ban");
  }
  const banned = { ...state, banned: [...new Set([...state.banned, hero])] };
  return draw(banned, [lane], { known, pick, now, kind: "ban", hero });
}

/** Puts a banned hero back in the pools; nothing is drawn. */
export const unban = (state, heroId) => ({
  ...state,
  banned: state.banned.filter(id => id !== heroId)
});
