// The draw of the composition roulette (spec 2026-11-07 casino), shared by the server (the roulette everyone sees) and
// the browser (a spectator who spins on their own screen, owner 2026-11-07: "ça ne s'appliquera pas sur l'original").
// Pure: no clock and no randomness of its own (the callers pass `now` and `pick`).

/** The five lanes, in the order they are shown and drawn. */
export const LANE_KEYS = ["clash", "jungle", "mid", "farm", "roam"];

/** How many spins the history keeps. */
export const HISTORY_SIZE = 10;

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
