// The guides editor: what the page of each hero shows besides the game's own data, the recommended
// builds (two at most) and the combos (as many as wanted). Written by the administrators and by the
// people they gave the Contributor label to; everybody else uses the build lab. On the left the heroes
// and how many builds and combos each has; on the right, for the chosen hero, three tabs: its two builds
// (the pieces to pick from beside the build itself, which is checked live against the rules the server
// applies when it is saved), its combos (combos.js) and an overview of the texts written for it.
import { icon } from "../../../shared/icons.js";
import { pageRoot } from "../../app/view-wrapper.js";
import { t } from "../../app/browser-i18n.js";
import { gatePage } from "../../app/status-pages.js";
import { decodeBuild } from "../../../shared/build-model.js";
import { createWorkbench } from "../build-lab/workbench.js";
import { createComboEditor } from "./combos.js";
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as guideParts } from "./guide-parts.js";
import { onView as guideStage } from "./guide-stage.js";
import { onView as guideList } from "./guide-list.js";
import { onView as guideSheet } from "./guide-sheet.js";
import { onView as guidePaint } from "./guide-paint.js";
import { onView as guideOpen } from "./guide-open.js";
import { onView as guideActions } from "./guide-actions.js";
import { VARIANTS } from "./guide-shared.js";

const BUILD_PARAMS = ["i", "u", "l", "c", "s", "r", "b", "g"];

export function createGuideEditor({ hydration, api, tell, state }) {
  const view = { state, api, tell };
  bindTo(view, guideParts, guideStage, guideList, guideSheet, guidePaint, guideOpen, guideActions);
  view.root = null;
  view.catalog = null;
  view.summaries = new Map(); // hero id -> [{ variant, name }] of the builds that exist
  view.comboCounts = new Map(); // hero id -> how many combos it has
  view.section = "builds"; // what is written: the builds or the combos of the hero, or the overview
  view.heroId = null;
  view.variants = { 1: null, 2: null };
  view.variant = 1;
  view.fields = { name: "", note: "", sourceUrl: "" };
  view.dirty = false;
  view.notice = "";
  view.saveError = "";
  view.saving = false;
  view.search = "";
  view.filter = "all";
  view.entered = false; // the page rises once, not at every redraw

  view.workbench = createWorkbench({ getCatalog: () => view.catalog, escapeHtml });
  view.comboEditor = createComboEditor({
    api: view.api,
    escapeHtml,
    tell: view.tell,
    repaint: focus => view.paintCombos(focus),
    counted(id, count) {
      view.comboCounts.set(id, count);
      view.paintSide();
    }
  });
  view.LOADING = `<div class="loading-line"></div>`;

  return {
    /** Draws the page into `app`: the heroes, and the builds of `wantedHero` when there is one. */
    async show(app, wantedHero = null) {
      const user = view.state.auth.user;
      if (!user?.isEditor) {
        app.innerHTML = gatePage({
          crumb: `${t("Heroes & Builds")}${icon("right")}${t("Hero guides")}`,
          title: t("Hero guides"),
          message: user
            ? t(
                "This page is for the people who write the guides of the heroes. An administrator can give you the Contributor label."
              )
            : t("Sign in to write the guides of the heroes."),
          signedIn: Boolean(user),
          next: location.pathname
        });
        return;
      }
      view.root = pageRoot(app, hydration, "builds-root");
      view.root.addEventListener("click", view.onClick);
      view.root.addEventListener("input", view.onInput);
      // the stage and the list of heroes at once, before the data of the page
      view.summaries = new Map();
      view.comboCounts = new Map();
      view.heroId = null;
      view.search = "";
      view.filter = "all";
      view.section = "builds";
      view.paint(true);
      try {
        const [loaded, listed, written] = await Promise.all([
          view.api("/api/catalog"),
          view.api("/api/builds"),
          view.api("/api/combos")
        ]);
        view.catalog = loaded;
        view.comboCounts = new Map(Object.entries(written.counts));
        view.summaries = new Map();
        for (const entry of listed.builds) {
          view.summaries.set(entry.heroId, [
            ...(view.summaries.get(entry.heroId) ?? []),
            { variant: entry.variant, name: entry.name }
          ]);
        }
      } catch (problem) {
        view.tell(problem.message);
        return;
      }
      if (!view.root.isConnected) {
        return;
      }
      view.heroId = null;
      view.search = "";
      view.filter = "all";
      view.dirty = false;
      view.section = ["combos", "notes"].includes(new URLSearchParams(location.search).get("tab"))
        ? new URLSearchParams(location.search).get("tab")
        : "builds";
      const opening = Boolean(wantedHero) && view.heroes().some(hero => hero.id === wantedHero);
      view.paint(false, opening);
      if (opening) {
        // a build brought by a link (from the lab) is opened in the build that was asked for
        const params = new URLSearchParams(location.search);
        const brought = BUILD_PARAMS.some(key => params.has(key)) ? decodeBuild(params) : null;
        const asked = Number(params.get("variant"));
        await view.open(wantedHero, {
          wantedVariant: VARIANTS.includes(asked) ? asked : null,
          brought
        });
        if (location.search) {
          history.replaceState(null, "", view.guideAddress(wantedHero));
        }
      }
    }
  };
}
