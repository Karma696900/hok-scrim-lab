// The Tournaments page (administrators): enter the real series that were played, as fast as
// possible. No timer and no turn order: a series is its teams, its date and, for each game, who was
// blue, who won and the ten picks (and the bans). Typing a hero name and pressing Enter fills the
// next free slot, so a whole game is about ten key presses.
// The list is a table with a filter, a page of series and a summary by event; the editor of a series is
// two panes: the series on the left (its fields, its buttons), the games on the right.
import { icon } from "../../../shared/icons.js";
import { pageRoot } from "../../app/view-wrapper.js";
import { t } from "../../app/browser-i18n.js";
import { gatePage } from "../../app/status-pages.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as tournamentParts } from "./tournament-parts.js";
import { onView as tournamentGame } from "./tournament-game.js";
import { onView as tournamentLanes } from "./tournament-lanes.js";
import { onView as tournamentEditor } from "./tournament-editor.js";
import { onView as tournamentList } from "./tournament-list.js";
import { onView as tournamentActions } from "./tournament-actions.js";
import { onView as tournamentDrag } from "./tournament-drag.js";
import { onDragLeave } from "./tournament-drag.js";

// The Tournaments page (administrators): enter the real series that were played, as fast as
// possible. No timer and no turn order: a series is its teams, its date and, for each game, who was
// blue, who won and the ten picks (and the bans). Typing a hero name and pressing Enter fills the
// next free slot, so a whole game is about ten key presses.
// The list is a table with a filter, a page of series and a summary by event; the editor of a series is
// two panes: the series on the left (its fields, its buttons), the games on the right.

export function createTournamentsPage({ hydration, api, tell, state }) {
  const view = { state, api, tell };
  bindTo(
    view,
    tournamentParts,
    tournamentGame,
    tournamentLanes,
    tournamentEditor,
    tournamentList,
    tournamentActions,
    tournamentDrag
  );
  view.root = null;
  view.list = null;
  view.summary = null;
  view.suggestions = { events: [], teams: [] };
  view.query = "";
  view.verify = "";
  view.page = 1;
  view.editor = null;
  view.active = null;
  view.search = "";
  view.error = "";
  view.busy = false;
  view.timer = null;
  view.entered = false; // the page rises once, not at every redraw
  view.armed = null; // a lane picked up in the palette, waiting to be put on a hero ("" = clear the lane)
  view.dragging = null; // what is being dragged: { lane } from the palette, or { from: "game:side:index" } from a hero

  // the series that the "suggest for all" button would change: { id, event, drafts, games, filled }
  view.proposal = null;

  return {
    /** Draws the page into `app` (administrators only). */
    async show(app) {
      if (!view.state.auth.user?.isAdmin) {
        app.innerHTML = gatePage({
          crumb: `${t("Admin")}${icon("right")}${t("Tournaments")}`,
          title: t("Tournaments"),
          message: view.state.auth.user
            ? t("This page is for administrators.")
            : t("Sign in with an administrator account to enter tournaments."),
          signedIn: Boolean(view.state.auth.user),
          next: location.pathname
        });
        return;
      }
      view.root = pageRoot(app, hydration, "tournaments-root");
      view.root.addEventListener("click", view.onClick);
      view.root.addEventListener("input", view.onInput);
      view.root.addEventListener("change", view.onChange);
      document.removeEventListener("keydown", view.onKeydown);
      document.addEventListener("keydown", view.onKeydown);
      view.root.addEventListener("submit", view.onSubmit);
      for (const [name, handler] of [
        ["dragstart", view.onDragStart],
        ["dragover", view.onDragOver],
        ["dragleave", onDragLeave],
        ["drop", view.onDrop],
        ["dragend", view.onDragEnd]
      ]) {
        view.root.addEventListener(name, handler);
      }
      view.paint(true);
      try {
        await view.reload();
      } catch (problem) {
        view.tell(problem.message);
        view.list = { total: 0, items: [] };
      }
      if (view.root.isConnected) {
        view.paint();
      }
    }
  };
}
