// The Game Simulation page (/simulation): open to everybody, separate from the Training. The set-up
// screen (drawn by the server too) chooses the side, the role, the difficulty and the heroes; Start
// fetches the engine and the game, and the board covers the screen until the grade. A signed-in player
// keeps the grade of each game, listed under the set-up and in the personal space.
import { bindTo } from "../../../shared/bind-to.js";
import { pageRoot } from "../../app/view-wrapper.js";
import { onView as simulationActions } from "./simulation-actions.js";

export function createSimulationPage({ hydration, api, tell, state }) {
  const view = {
    api,
    tell,
    root: null,
    heroes: [],
    signedIn: false,
    side: "blue",
    lane: "Mid Lane",
    difficulty: "normal",
    handPicked: false,
    fixed: {},
    pool: null,
    history: null,
    starting: false,
    problem: "",
    run: null
  };
  bindTo(view, simulationActions);

  return {
    show(app) {
      view.run?.stop();
      view.run = null;
      view.heroes = state.heroes ?? [];
      view.signedIn = Boolean(state.auth?.user);
      view.root = pageRoot(app, hydration, "simulation-root");
      view.root.addEventListener("click", view.onClick);
      view.root.addEventListener("change", view.onChange);
      view.paint();
      if (view.handPicked) {
        view.wantPool();
      }
      view.refreshHistory();
    }
  };
}
