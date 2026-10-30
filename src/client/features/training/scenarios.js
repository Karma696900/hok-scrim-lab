// Training, the situations: the list of the ones the administrators prepared, a situation on its map (who
// is where, dead or alive) with the player's answer beside it, and the maps themselves.
import { createScenarioEditor } from "./scenario-editor.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as scenariosParts } from "./scenarios-parts.js";

export function createScenariosPage(kit) {
  const view = { kit };
  bindTo(view, scenariosParts);
  ({ api: view.api, tell: view.tell, portrait: view.portrait, heroName: view.heroName } = view.kit);
  view.editor = createScenarioEditor(view.kit);

  return { showList: view.showList, show: view.show };
}
