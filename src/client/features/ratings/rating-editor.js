// The official ratings (editors): one tier list per lane, from SS to D, drawn on the same board as the
// tier lists (domain/tier-labels.js). The heroes are dragged from a tier to another, or picked with a click and
// sent to a tier with a button (no drag needed on a phone or with a keyboard). Nobody but the editors
// sees these lists: everybody sees their result as the rating next to each lane on the page of a hero.
// A work screen: the lane tabs on a low stage, the six tiers on the left and, beside them, the state of the
// lane (its version, how the heroes are spread, the buttons, what was moved) with the heroes that wait.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { gatePage } from "../../app/status-pages.js";
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as ratingEditorParts } from "./rating-editor-parts.js";
import { onView as ratingEditorMarkup } from "./rating-editor-markup.js";
import { onView as ratingEditorActions } from "./rating-editor-actions.js";
import { onDragStart } from "./rating-editor-actions.js";

export function createRatingsEditor({ api, tell, state }) {
  const view = { state, api, tell };
  bindTo(view, ratingEditorParts, ratingEditorMarkup, ratingEditorActions);
  view.esc = escapeHtml;
  view.root = null;
  view.tiers = []; // ["SS", "S", "A", "B", "C", "D"], from the server
  view.saved = new Map(); // lane → { tiers, unranked, version } as the server has them
  view.lane = null;
  view.draft = null; // the lane being edited: { rows: Map(tier → [hero ids]), unranked: [] }
  view.moves = []; // what was moved since the lane was opened: { heroId, to, before }, the last one on top
  view.dirty = false;
  view.picked = null; // the hero chosen with a click
  view.saving = false;
  view.problem = "";
  view.reserveSearch = ""; // what is typed in the box of the heroes that wait
  view.entered = false; // the page rises once, not at every redraw

  return {
    /** Draws the page into `app` (editors only). */
    async show(app) {
      const user = view.state.auth.user;
      if (!user?.isEditor) {
        app.innerHTML = gatePage({
          crumb: `${t("Heroes & Builds")}${icon("right")}${t("Official ratings")}`,
          title: t("Official ratings"),
          message: user
            ? t(
                "This page is for the people who write the ratings of the heroes. An administrator can give you the Contributor label."
              )
            : t("Sign in to write the ratings of the heroes."),
          signedIn: Boolean(user),
          next: location.pathname
        });
        return;
      }
      view.root = document.createElement("div");
      view.root.id = "ratings-root";
      app.replaceChildren(view.root);
      view.root.addEventListener("click", view.onClick);
      view.root.addEventListener("input", view.onInput);
      view.root.addEventListener("dragstart", onDragStart);
      view.root.addEventListener("dragover", view.onDragOver);
      view.root.addEventListener("dragleave", event => {
        event.target.closest?.("[data-drop]")?.classList.remove("over");
      });
      view.root.addEventListener("drop", view.onDrop);
      view.root.innerHTML = `<div class="loading-line"></div>`;
      try {
        await view.load();
      } catch (error) {
        view.tell(error.message);
        return;
      }
      if (!view.root.isConnected) {
        return;
      }
      view.open(view.saved.keys().next().value);
      view.paint();
    }
  };
}
