// Reports (administrators). Wireframe:
//   1. the stage: a cover, the title, three numbers (open reports, teams involved, messages to read);
//   2. a table of the reports on the left (the teams, the reason, who reported, when, how many messages) and, on
//      the right, the panel of the one that is selected: its conversation and the button that dismisses it;
//   3. with no report: one line, and the three steps of the moderation.
import { bindTo } from "../../../shared/bind-to.js";
import { onView as reportsParts } from "./reports-parts.js";
import { actionsOf } from "./reports-actions.js";

export function createReportsPage(ctx) {
  const view = { ctx };
  bindTo(view, reportsParts);
  ({ api: view.api, state: view.state } = view.ctx);
  view.items = [];
  view.selected = null;
  view.contact = { items: [], open: 0 };

  view.actions = actionsOf(view);

  return { show: view.show, actions: view.actions };
}
