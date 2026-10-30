// The build lab: anybody (no account) picks a hero, a level, items, arcana and spells, and sees the stats the
// build gives, the details of each piece and whether it suits the hero according to the tags. Two panels: on
// the left the catalogue (three tabs, categories, search, large icons that say what they give when they are
// looked at), on the right the sheet of the build, which stays in view: the hero at its head, the pieces in
// framed tiles, the arcana by colour, the stats added up (always on screen), then save, share and start over,
// and the builds kept on this device. The build lives in the address, so it can be shared. The recommended
// builds of the heroes are written in the builds editor (guides), not here.
import { icon } from "../../../shared/icons.js";
import { pageRoot } from "../../app/view-wrapper.js";
import { t } from "../../app/browser-i18n.js";
import { MAX_LEVEL, decodeBuild } from "../../../shared/build-model.js";
import { heroFacts } from "../../../shared/condition-model.js";
import { readSaved } from "./saved.js";
import { createWorkbench } from "./workbench.js";
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as buildLabParts } from "./build-lab-parts.js";
import { onView as buildLabMarkup } from "./build-lab-markup.js";
import { onView as buildLabTips } from "./build-lab-tips.js";
import { onView as buildLabKeep } from "./build-lab-keep.js";
import { onView as buildLabActions } from "./build-lab-actions.js";
import { piecesOf } from "./build-lab-parts.js";
import { storage } from "./build-lab-shared.js";

export function createBuildLab({ api, tell, state, hydration }) {
  const view = { state, api, tell };
  bindTo(view, buildLabParts, buildLabMarkup, buildLabTips, buildLabKeep, buildLabActions);
  view.root = null;
  view.catalog = null;
  view.heroId = "";
  view.level = MAX_LEVEL;
  let scrollBound = false;
  view.resetGrid = false; // the pieces start from the top again (another tab or category)
  view.sheetOpen = false; // on a phone the sheet is a drawer that the bar at the bottom opens
  view.sheet = null; // /api/heroes/:id of the chosen hero: its profile and recommended builds
  // the builds kept in this browser
  view.kept = [];
  view.activeId = null;
  view.keepName = "";
  view.keepError = "";
  view.scope = "hero"; // which kept builds are listed: those of this hero, or all of them
  view.workbench = createWorkbench({
    getCatalog: () => view.catalog,
    escapeHtml,
    // what depends on the hero is checked against the hero of the lab, at the level of the slider
    getFacts: () => heroFacts(view.hero(), view.sheet?.profile ?? null, view.level)
  });

  return {
    async show(app) {
      // The page the server drew is kept and reconciled with the first draw (see app/view-wrapper.js), so
      // the painted heading and text stay the same nodes; until the catalog is there it stays as it is.
      const here = Boolean(hydration?.active() && app.querySelector(":scope > #lab-root"));
      view.root = pageRoot(app, hydration, "lab-root");
      if (!here) {
        view.root.innerHTML = `<div class="loading-line"></div>`;
      }
      try {
        view.catalog = await view.api("/api/catalog");
      } catch (problem) {
        // one line that says why, and the way to try again (the page needs the catalogue to be drawn)
        view.root.innerHTML = `<div class="lb-error" role="alert">${icon("warn", "i--sm")}<span>${escapeHtml(problem.message)}</span><button type="button" class="btn btn--sm" data-retry>${icon("refresh", "i--sm")}${t("Try again")}</button></div>`;
        view.root.querySelector("[data-retry]").addEventListener("click", () => location.reload());
        return;
      }
      // the controls of a page the server drew only answer once the catalog is there
      view.root.addEventListener("click", view.onClick);
      view.root.addEventListener("change", view.onChange);
      view.root.addEventListener("input", view.onInput);
      view.root.addEventListener("submit", view.onSubmit);
      view.root.addEventListener("keydown", event => {
        if (event.key === "Escape" && view.sheetOpen) {
          view.sheetOpen = false;
          view.paint();
          view.root.querySelector('[data-sheet="open"]')?.focus({ preventScroll: true });
        }
      });
      // a piece looked at (the mouse over it, or the keyboard on it) says what it gives
      view.root.addEventListener("pointerover", event => {
        const piece = event.pointerType === "mouse" ? piecesOf(event.target) : null;
        if (piece) {
          view.showTip(piece);
        } else {
          view.hideTip();
        }
      });
      view.root.addEventListener("pointerleave", view.hideTip);
      view.root.addEventListener("scroll", () => view.hideTip(), true);
      view.root.addEventListener("focusin", event => {
        const piece = piecesOf(event.target);
        if (piece && event.target.matches(":focus-visible")) {
          view.showTip(piece);
        } else {
          view.hideTip();
        }
      });
      view.root.addEventListener("focusout", view.hideTip);
      if (!scrollBound) {
        scrollBound = true;
        window.addEventListener("scroll", () => view.hideTip(), { passive: true });
      }
      view.kept = readSaved(storage());
      view.activeId = null;
      view.keepName = "";
      view.keepError = "";
      const params = new URLSearchParams(location.search);
      view.workbench.set(decodeBuild(params));
      view.level = Math.max(1, Math.min(MAX_LEVEL, Number(params.get("lv")) || MAX_LEVEL));
      const wanted = params.get("h");
      if (view.root.isConnected) {
        if (wanted && view.heroes().some(entry => entry.id === wanted)) {
          await view.chooseHero(wanted);
        } else {
          view.scope = "all";
          view.paint();
        }
      }
    }
  };
}
