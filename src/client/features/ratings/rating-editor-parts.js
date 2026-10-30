// rating editor, small helpers: rise, heroOf, nameOf, rankedIn, and 4 more.
import { UNRANKED } from "./rating-editor-shared.js";

export const rise = (view, depth = "") => (view.entered ? "" : ` rise${depth}`);

export const heroOf = (view, id) => view.state.heroes.find(hero => hero.id === id) ?? null;

export const nameOf = (view, id) => {
  const hero = view.heroOf(id);
  return hero ? hero.displayName || hero.name : id;
};

export const rankedIn = list => list.tiers.reduce((sum, tier) => sum + tier.heroes.length, 0);

export const cloneDraft = view => ({
  rows: new Map([...view.draft.rows].map(([tier, heroes]) => [tier, [...heroes]])),
  unranked: [...view.draft.unranked]
});

/** The working copy of a lane: what the server holds. */
export function open(view, next) {
  view.lane = next;
  const list = view.saved.get(view.lane);
  view.draft = {
    rows: new Map(list.tiers.map(tier => [tier.label, [...tier.heroes]])),
    unranked: [...list.unranked]
  };
  view.moves = [];
  view.dirty = false;
  view.picked = null;
  view.problem = "";
  view.reserveSearch = "";
}

/** Takes a hero out of wherever it is and puts it at the end of a tier (or Unranked). */
export function move(view, heroId, tier) {
  view.moves.unshift({ heroId, to: tier, before: view.cloneDraft() });
  for (const heroes of view.draft.rows.values()) {
    const at = heroes.indexOf(heroId);
    if (at >= 0) {
      heroes.splice(at, 1);
    }
  }
  view.draft.unranked = view.draft.unranked.filter(id => id !== heroId);
  (tier === UNRANKED ? view.draft.unranked : view.draft.rows.get(tier)).push(heroId);
  view.dirty = true;
  view.problem = "";
}

/** Takes back the last move. */
export function undo(view) {
  const last = view.moves.shift();
  if (!last) {
    return;
  }
  view.draft = last.before;
  view.dirty = view.moves.length > 0;
  view.picked = null;
  view.problem = "";
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { rise, heroOf, nameOf, cloneDraft, open, move, undo };
