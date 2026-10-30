// Community: the teams list, a team's page (overview, roster, agenda, series, training, Discord, settings) and
// everything its staff can do there. Loaded on demand (like the tournaments page). The list is drawn by
// list.js, a team by team-view.js, the forms by form.js; this module sends the clicks, the changes, the
// typing and the forms to the code that owns them. The server decides who may do what; the buttons only
// hide what would be refused.
import { icon } from "../../../shared/icons.js";
import { closeMenu } from "../../shell/popover.js";
import { createTeamList } from "./team-list.js";
import { createTeamView } from "./team-view.js";
import { createTeamTraining } from "./training.js";
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as teamPageParts } from "./team-page-parts.js";
import { onView as teamPageActions } from "./team-page-actions.js";
import { ctxOf, teamActionsOf } from "./team-page-parts.js";
import { formsOf } from "./team-page-actions.js";

export function createTeamsPage({ api, tell, go, state }) {
  const page = { api, tell, go, state };
  bindTo(page, teamPageParts, teamPageActions);
  page.root = null;
  page.mode = "list"; // what the page shows: the list of the teams, or one team
  page.training = createTeamTraining({
    api: page.api,
    escapeHtml,
    tell: page.tell,
    state: page.state
  });
  page.ctx = ctxOf(page);

  page.list = createTeamList(page.ctx);
  page.view = createTeamView(page.ctx);

  page.teamActions = teamActionsOf(page);

  page.filterTimer = 0;

  page.forms = formsOf(page);

  return {
    /** Draws the list (no id) or one team into `app`. */
    async show(app, teamId = null) {
      closeMenu();
      page.mode = teamId ? "team" : "list";
      page.root = document.createElement("div");
      page.root.id = "teams-root";
      app.replaceChildren(page.root);
      page.root.addEventListener("click", page.onClick);
      page.root.addEventListener("change", page.onChange);
      page.root.addEventListener("input", page.onInput);
      page.root.addEventListener("submit", page.onSubmit);
      try {
        await (teamId ? page.view.show(teamId, { fresh: true }) : page.list.show());
      } catch (error) {
        page.root.innerHTML = `<div class="note note--warn">${icon("warn", "i--sm")}<span>${escapeHtml(error.message)}</span></div>`;
      }
    }
  };
}
