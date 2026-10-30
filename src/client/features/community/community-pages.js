// Community pages: Find a scrim, the Inbox (scrim requests and notifications), the Agenda, a
// player's page, the reports of the administrators and Discord & onboarding. Loaded on demand. Each
// page is a module of its own (find.js, inbox.js…); this one holds what they share (the page they
// are drawn in, the teams of the viewer) and sends the clicks, the forms and the typing to the page
// that owns them. The server decides who may do what; the buttons only hide what would be refused.
import { icon } from "../../../shared/icons.js";
import { pageRoot } from "../../app/view-wrapper.js";
import { paintStage, communityFrame } from "./stage.js";
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as communityPagesParts } from "./community-pages-parts.js";
import { onView as communityPagesActions } from "./community-pages-actions.js";
import { actionsOf, formsOf } from "./community-pages-actions.js";
import {
  agendaOf,
  contextOf,
  discordOf,
  findOf,
  inboxOf,
  pagesOf,
  playerOf,
  reportsOf
} from "./community-pages-parts.js";

export function createCommunityPages({ hydration, api, tell, go, state }) {
  const pane = { state, api, tell, go, hydration };
  bindTo(pane, communityPagesParts, communityPagesActions);
  pane.root = null;
  pane.myTeams = [];

  pane.context = contextOf(pane);

  pane.find = findOf(pane);

  pane.inbox = inboxOf(pane);

  pane.agenda = agendaOf(pane);

  pane.player = playerOf(pane);

  pane.reports = reportsOf(pane);

  pane.discord = discordOf(pane);

  pane.pages = pagesOf(pane);

  pane.actions = actionsOf(pane);

  pane.forms = formsOf(pane);

  return {
    /** Draws one community page into `app`. */
    async show(app, view, parameter = null) {
      pane.inbox.stop();
      pane.root = pageRoot(app, pane.hydration, "community-root");
      pane.root.addEventListener("click", pane.onClick);
      pane.root.addEventListener("submit", pane.onSubmit);
      pane.root.addEventListener("change", event => {
        pane.find.change(event);
        pane.agenda.change(event);
      });
      pane.root.addEventListener("input", pane.inbox.input);
      // The stage and a skeleton at once, before the data of the page (what a visitor sees is drawn without waiting)
      const frame = pane.signedIn() || view === "find" ? communityFrame(view) : null;
      if (frame) {
        pane.root.paintFrame(frame.html);
        paintStage(pane.root, frame.hero);
      }
      try {
        if (view === "player") {
          await pane.player.show(parameter);
        } else if (view === "reports") {
          await pane.reports.show();
        } else if (view === "find") {
          await pane.find.show();
        } else if (!pane.signedIn()) {
          pane.needSignIn(view);
        } else if (view === "inbox") {
          await pane.inbox.show();
        } else if (view === "agenda") {
          await pane.agenda.show();
        } else if (view === "discord") {
          await pane.discord.show();
        }
      } catch (error) {
        pane.root.innerHTML = `<div class="note note--warn">${icon("warn", "i--sm")}<span>${escapeHtml(error.message)}</span></div>`;
      }
    },
    stop() {
      pane.inbox.stop();
    }
  };
}
