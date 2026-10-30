// Training: four zones under one stage. The heroes a player works on (their combos, what the teams ask),
// a private notebook (goals, mechanics, combos drawn with the skill pictures, videos to review), the
// situations prepared by administrators on a map, and the reflex exercises. Loaded on demand. Each zone
// is a module of its own (heroes.js, notebook.js, scenarios.js, reflex/reflex-page.js); this one holds what they
// share (the sheets of the heroes, the numbers of the stage) and picks the one to draw. The server decides
// who may do what; the buttons only hide what would be refused.
import { icon } from "../../../shared/icons.js";
import { pageRoot } from "../../app/view-wrapper.js";
import { paintStage } from "../community/stage.js";
import { createHeroesPage } from "./heroes.js";
import { createNotebookPage } from "./notebook.js";
import { createReflexPage } from "./reflex/reflex-page.js";
import { createScenariosPage } from "./scenarios.js";
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as trainingPagesParts } from "./training-pages-parts.js";
import { ZONE_HERO } from "./training-pages-shared.js";
import { kitOf } from "./training-pages-parts.js";

export function createTrainingPages({ hydration, api, tell, go, state }) {
  const view = { state, api, tell, go };
  bindTo(view, trainingPagesParts);
  view.esc = escapeHtml;
  view.root = null;
  view.sheets = new Map(); // hero id → hero sheet (skills with their pictures), fetched once

  /** What the stage and the four entries say about the person (set by `loadOverview`). */
  view.overview = null;

  view.chromeOptions = null;

  view.kit = kitOf(view);

  const heroes = createHeroesPage(view.kit);
  const notebook = createNotebookPage(view.kit);
  const scenarios = createScenariosPage(view.kit);
  const reflex = createReflexPage(view.kit);

  return {
    /** section: "" (heroes), "/notebook", "/reflex", "/reflex/<exercise>", "/scenarios" or "/scenarios/<id>" */
    async show(app, section = "") {
      view.root = pageRoot(app, hydration);
      reflex.stop(); // an exercise left running by the section that was open
      view.root.onclick = view.root.onchange = view.root.oninput = view.root.onsubmit = null;
      view.root.onkeydown = view.root.onpointerdown = null;
      view.chromeOptions = null;
      try {
        const [zone = "heroes", sub = ""] = section.split("/").filter(Boolean);
        const inside =
          (zone === "reflex" && sub && sub !== "routine") || (zone === "scenarios" && sub);
        if (!view.kit.signedIn() && zone !== "scenarios") {
          return view.needSignIn(zone === "notebook" || zone === "reflex" ? zone : "heroes");
        }
        view.overview = null;
        if (view.kit.signedIn() && !inside) {
          if (zone in ZONE_HERO) {
            const frame = view.frameOf(zone);
            view.root.paintFrame(frame.html);
            paintStage(view.root, frame.hero);
          }
          await view.loadOverview();
        }
        if (zone === "notebook") {
          await notebook.show();
        } else if (zone === "reflex") {
          await reflex.show(sub);
        } else if (zone === "scenarios") {
          await (sub ? scenarios.show(sub) : scenarios.showList());
        } else {
          await heroes.show();
        }
      } catch (error) {
        view.root.innerHTML = `<div class="note note--warn">${icon("warn", "i--sm")}<span>${view.esc(error.message)}</span></div>`;
      }
    }
  };
}
