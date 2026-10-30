// Training, the editor of a situation (administrators): click the map to place the chosen tool,
// drag a pin to move it, arrow keys to nudge it, then give the situation a title and publish it.
import { bindTo } from "../../../shared/bind-to.js";
import { onView as scenarioEditorParts } from "./scenario-editor-show.js";

export function createScenarioEditor(kit) {
  const view = { kit };
  bindTo(view, scenarioEditorParts);
  ({
    api: view.api,
    tell: view.tell,
    go: view.go,
    state: view.state,
    heroName: view.heroName,
    portrait: view.portrait
  } = view.kit);

  return { show: view.show };
}
