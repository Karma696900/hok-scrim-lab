// Draft board. Built once per game, then patched in place: a pick, a tick of the clock or a poll
// only touches the slots / text that changed (no innerHTML of the whole board, so the hero search
// keeps its focus and animations are not restarted).
//
// The room: the Blue side on the left, the Red side on the right (their five bans in a row, then their five
// picks as tall cards whose art is the cover of the hero), and in the middle the clock in big bright digits over
// the pool of heroes (the result of the game and the log of the draft once it is over).
import { bindTo } from "../../../shared/bind-to.js";
import { onView as draftRoomMarkup } from "./draft-room-markup.js";
import { onView as draftPool } from "./draft-pool.js";
import { onView as draftSlots } from "./draft-slots.js";
import { onView as draftClock } from "./draft-clock.js";
import { onView as draftUpdate } from "./draft-update.js";
import { FLOWBORN } from "./draft-view-shared.js";
import { roomMarkup } from "./draft-room-markup.js";

export function createDraftView({
  imageMarkup,
  heroCardMarkup,
  getHero,
  getCover = () => Promise.resolve(null),
  formatDuration
}) {
  const view = { heroCardMarkup, getCover, getHero, imageMarkup, formatDuration };
  bindTo(view, draftRoomMarkup, draftPool, draftSlots, draftClock, draftUpdate);
  view.root = null;
  view.refs = null;
  view.mountedKey = null;
  view.lastActions = 0;
  view.lastTimerName = null;
  view.lastSuggested = null;
  view.resultBuilt = false;
  view.cards = new Map();
  view.filter = { search: "", lane: "All", role: "All" };

  return {
    mount: view.mount,
    frame: roomMarkup,
    update: view.update,
    tick: view.tick,
    isMounted: () => Boolean(view.root && view.root.isConnected && view.refs),
    reset() {
      view.root = null;
      view.refs = null;
      view.mountedKey = null;
      view.cards.clear();
    },
    /** Test hook: how many hero cards exist (proves the pool is built once). */
    cardCount: () => view.cards.size,
    isFlowborn: hero => FLOWBORN.test(hero.name)
  };
}
