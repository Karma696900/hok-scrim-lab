// A player's page. Wireframe:
//   1. the stage: the cover of the main hero of the player (or of a hero of the day), the avatar, the name (64 px),
//      the tag, the labels and the teams as chips, the actions, three numbers (teams, main heroes, languages);
//   2. the main heroes as tall portraits (or the heroes of the lane of the player), next to "About";
//   3. the teams as cards and the team-mates; for the person themselves their training goals and their last series;
//   4. the tools of the staff (invite) and of the administrators (labels).
// The server decides who may do what.
import { bindTo } from "../../../shared/bind-to.js";
import { onView as playerParts } from "./player-parts.js";
import { onView as playerPiecesPage } from "./player-pieces-page.js";
import { onView as playerPage } from "./player-page.js";
import { actionsOf, formsOf } from "./player-actions.js";

export function createPlayerPage(ctx) {
  const view = { ctx };
  bindTo(view, playerParts, playerPiecesPage, playerPage);
  ({ api: view.api, tell: view.tell, state: view.state } = view.ctx);
  view.current = null;

  view.actions = actionsOf(view);

  view.forms = formsOf(view);

  return { show: view.show, actions: view.actions, forms: view.forms };
}
