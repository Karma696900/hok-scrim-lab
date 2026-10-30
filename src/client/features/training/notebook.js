// Training, the notebook: what a player wants to practise (goals, mechanics, combos drawn with the
// pictures of the skills) and the videos they review (a link and the moments to look at again). Two panes:
// the notes on the left, the editor on the right (an overview of the notebook while nothing is written).
// Private: only its owner reads it, unless they share their space.
import { bindTo } from "../../../shared/bind-to.js";
import { onView as notebookParts } from "./notebook-show.js";

export function createNotebookPage(kit) {
  const view = { kit };
  bindTo(view, notebookParts);
  ({
    api: view.api,
    tell: view.tell,
    state: view.state,
    heroOf: view.heroOf,
    heroName: view.heroName,
    portrait: view.portrait,
    sheetOf: view.sheetOf,
    skillsOf: view.skillsOf,
    skillIcon: view.skillIcon
  } = view.kit);

  return { show: view.show };
}
