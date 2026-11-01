// The popularity pages: the drafts and the heroes that win most and that are played most in the
// tournament games (never the scrims), over a period of at least three months that cannot start
// before the first game that was entered. Two tabs: the drafts of each side, and the heroes of each
// lane. Everything is computed by the server (see server/features/tournaments/popular.js); this
// module draws it and asks again when the period or a filter changes. A stage opens each page (the
// cover of the hero that leads, the figures of the period, the best drafts or heroes in big portraits).
import { pageRoot } from "../../app/view-wrapper.js";
import { PICK_LANES } from "../../../shared/draft-model.js";
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as popularPageParts } from "./popular-page-parts.js";
import { onView as popularPageMarkup } from "./popular-page-markup.js";
import { onView as popularPageStage } from "./popular-page-stage.js";
import { onView as popularPageActions } from "./popular-page-actions.js";
import { onView as popularPageExtras } from "./popular-page-extras.js";

export function createPopularPages({ hydration, api, tell, state }) {
  const view = { state, api, tell };
  bindTo(
    view,
    popularPageParts,
    popularPageMarkup,
    popularPageStage,
    popularPageActions,
    popularPageExtras
  );
  view.esc = escapeHtml;
  view.root = null;
  view.tab = "drafts"; // "drafts" or "heroes"
  view.data = null; // the last answer of the server
  view.loading = false;
  view.problem = "";
  view.ask = { preset: "3", from: "", to: "", rule: "", minGames: 1 }; // what the person chose
  view.rank = "plays"; // "plays" (the popularity), "rate" (the score) or "presence" (the heroes: picked or banned)
  view.duoLanes = ""; // the pair of lanes of the duos, "" for all
  view.lane = PICK_LANES[0];
  view.scope = "all"; // the heroes: both sides, blue or red

  return {
    /** Draws the page into `app`: `section` is "" (the drafts) or "/heroes". */
    async show(app, section = "") {
      view.tab = section === "/heroes" ? "heroes" : "drafts";
      const kept = Boolean(hydration?.active() && app.querySelector(":scope > #popular-root"));
      view.root = pageRoot(app, hydration, "popular-root");
      view.root.addEventListener("click", view.onClick);
      view.root.addEventListener("change", view.onChange);
      view.data = null;
      await view.load({ quiet: kept });
    }
  };
}
