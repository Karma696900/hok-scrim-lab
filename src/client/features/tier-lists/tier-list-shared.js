import { state } from "../../app/app-state.js";

// The tier lists page. A stage opens it (the cover of the best-ranked hero, the title, the lanes and the
// lists of the person as cards), then the board (one full-width band per tier, from SS to D, with a big
// coloured badge and the portraits that wrap), then the reserve of the heroes not ranked yet, which stays
// docked at the bottom of the screen with its own search and lane filter. A hero is moved by dragging, or
// by picking it (click, Enter) and choosing the tier on the bar that appears: no drag needed on a phone.

/**
 * What the page remembers between two drawings: the hero picked with a click, what is typed in the search of
 * the reserve and its lane filter, the hero whose chip gets the focus back once the page is drawn again, and
 * whether the person has chosen a lane yet (until then the page opens on the lane of their latest list).
 */
export const tierUi = { picked: null, query: "", lane: "all", focus: null, chosen: false };

export function visibleTierLists() {
  const lane = state.tierLaneFilter === "all" ? null : state.tierLaneFilter;
  return state.tierLists.filter(item => (item.lane ?? null) === lane);
}

export function currentTierList() {
  const visible = visibleTierLists();
  return visible.find(item => item.id === state.activeTierId) || visible[0] || null;
}
