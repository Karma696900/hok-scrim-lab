// Training, the reflex exercises: short games for reflexes, memory and aim. Each one runs in the
// browser and sends nothing while it is played, so that nothing slows it down; the result is kept once
// the run is over (the best score is remembered, and a team can ask for a number of runs a day or a
// week). The code of an exercise is fetched when its page opens, before the run begins. While a run
// lasts the page is calm: the stage and the entries step aside and the board is all there is.
import { exerciseOf } from "../../../../shared/reflex-model.js";
import { createRanking } from "./ranking.js";
import { bindTo } from "../../../../shared/bind-to.js";
import { onView as reflexParts } from "./reflex-parts.js";
import { onView as reflexList } from "./reflex-list.js";
import { onView as reflexRoutines } from "./reflex-routines.js";
import { onView as reflexExercise } from "./reflex-exercise.js";

export function createReflexPage(kit) {
  const view = { kit };
  bindTo(view, reflexParts, reflexList, reflexRoutines, reflexExercise);
  ({ api: view.api, go: view.go } = view.kit);
  view.ranking = createRanking(view.kit);
  view.stopRun = null;
  // the routine being played: its exercises, where it is, what each one gave (null: none)
  view.routine = null;

  return {
    stop: view.stop,
    /** `id` is the exercise to open; nothing (or an unknown one) shows the list. */
    async show(id = "") {
      view.stop();
      view.routine = null; // coming to a page by its address ends the routine that was played
      const root = view.kit.root();
      if (!view.kit.signedIn()) {
        return view.kit.needSignIn("reflex");
      }
      const summary =
        view.kit.overview?.reflex ??
        (await view.api(`/api/training/reflex?offset=${-new Date().getTimezoneOffset()}`));
      const exercise = exerciseOf(id);
      // what the other sections of the area left on the page
      root.onclick = root.onchange = root.oninput = root.onsubmit = null;
      if (exercise) {
        await view.showExercise(root, summary, exercise);
      } else if (id === "routine") {
        view.showRoutines(root, summary);
      } else {
        view.showList(root, summary);
      }
    }
  };
}
