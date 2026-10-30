// The teams page. Wireframe:
//   1. the stage: a hero cover, the title, three big numbers (teams, members, open announcements), the actions;
//   2. the invitations that wait for the person, then "Your teams" as large cards (next event, shared series);
//   3. the filters on the left (search, scope, level, region), the banner cards of the teams on the right;
//   4. "How a team works" in three steps, and the latest scrim announcements. Nothing ends in a void.
import { bindTo } from "../../../shared/bind-to.js";
import { onView as teamListParts } from "./team-list-parts.js";
import { onView as teamListPieces } from "./team-list-pieces.js";
import { onView as teamListList } from "./team-list-list.js";
import { actionsOf } from "./team-list-actions.js";
export { recordOf } from "./team-list-list.js";

export function createTeamList(ctx) {
  const view = { ctx };
  bindTo(view, teamListParts, teamListPieces, teamListList);
  ({ api: view.api, tell: view.tell, state: view.state } = view.ctx);
  view.scope = "all"; // the list: every team, or the ones of the signed-in person
  view.mine = [];
  view.invitations = [];
  view.items = [];
  view.total = 0;
  view.page = 1;

  view.actions = actionsOf(view);

  return { show: view.show, loadGrid: view.loadGrid, actions: view.actions };
}
