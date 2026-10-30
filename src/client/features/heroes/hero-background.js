// Page background: the presentation video of a hero (Camp Global), muted, dimmed, behind
// everything. A new browser session starts with a random hero; a hero chosen on its page stays
// until another is chosen. Never started for visitors who asked for less motion, who save data, or
// on small screens; paused when the tab is hidden.
import { state } from "../../app/app-state.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as heroBackgroundParts } from "./hero-background-parts.js";
import { KEY, PICK, canPlay, read } from "./hero-background-shared.js";

const write = value => {
  try {
    value === null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, value);
  } catch {
    /* private mode: the choice lasts until reload */
  }
};

export function createBackground() {
  const view = {};
  bindTo(view, heroBackgroundParts);
  view.items = null;
  view.stage = null;
  view.video = null;
  view.toggle = document.querySelector("#bg-toggle");

  view.toggle?.addEventListener("click", () => {
    write(read() === "off" ? null : "off");
    view.paintToggle();
    view.show();
  });
  document.addEventListener("visibilitychange", () => {
    if (!view.video) {
      return;
    }
    if (document.hidden) {
      view.video.pause();
    } else if (!state.quiet) {
      view.video.play().catch(() => {});
    }
  });
  document.addEventListener("hok:quiet", event => {
    if (event.detail) {
      view.video?.pause();
    } else if (view.video) {
      if (!document.hidden) {
        view.video.play?.().catch(() => {});
      }
    } else {
      view.show();
    }
  });
  matchMedia("(min-width: 900px)").addEventListener("change", () => {
    view.paintToggle();
    view.show();
  });

  view.paintToggle();
  // This module is only loaded after the visitor first interacts: the video (tens of MB) never
  // slows the page down.
  setTimeout(
    () => (window.requestIdleCallback ?? setTimeout)(() => view.show(), { timeout: 4000 }),
    1200
  );

  return {
    /** Makes a hero's video the background (kept across sessions). */
    choose(heroId) {
      write(heroId);
      view.paintToggle();
      return view.show();
    },
    /** Back to a random hero for every new session. */
    random() {
      write(null);
      try {
        sessionStorage.removeItem(PICK);
      } catch {
        /* ignore */
      }
      view.paintToggle();
      return view.show();
    },
    isChosen: heroId => read() === heroId,
    available: async () => canPlay() && (await view.load()).some(item => item.heroId),
    has: async heroId => (await view.load()).some(item => item.heroId === heroId)
  };
}
