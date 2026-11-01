// simulation page, actions: paint, refreshHistory, wantPool, gameOver, start, onClick, onChange.
// Each takes the page's view object first (shared/bind-to.js).
import { t } from "../../app/browser-i18n.js";
import { paintStage, stageHero } from "../community/stage.js";
import { pageHtml } from "./simulation-setup.js";
import { loadGame, loadHistory, loadPool } from "./simulation-load.js";
import { startRun } from "./simulation-run.js";
import { addressHooks, DIFFICULTIES, LANES, SIDES } from "./simulation-shared.js";

export function paint(view) {
  if (!view.root) {
    return;
  }
  view.root.innerHTML = pageHtml(view);
  paintStage(view.root, stageHero(4));
  // the board of a game in progress (or its grade) stays on top of the set-up screen
  if (view.run) {
    view.root.append(view.run.layer);
  }
}

export async function refreshHistory(view) {
  if (!view.signedIn) {
    return;
  }
  try {
    view.history = await loadHistory(view.api);
  } catch {
    view.history = [];
  }
  view.paint();
}

export async function wantPool(view) {
  if (view.pool !== null) {
    return;
  }
  try {
    view.pool = await loadPool(view.api);
  } catch (error) {
    view.pool = [];
    view.problem = error.message || t("The heroes could not be loaded.");
  }
  view.paint();
}

// the bots server hands the end of a game to the site a moment after the grade shows
const KEPT_AFTER_MS = 1500;

export function gameOver(view) {
  setTimeout(() => view.refreshHistory(), KEPT_AFTER_MS);
}

export async function start(view) {
  if (view.starting) {
    return;
  }
  view.starting = true;
  view.problem = "";
  view.paint();
  const hooks = addressHooks();
  const choice = {
    mode: view.mode,
    side: view.side,
    lane: view.lane,
    difficulty: view.difficulty,
    fixed: view.handPicked ? view.fixed : {},
    limit: hooks.limit,
    debug: hooks.debug
  };
  try {
    const game = await loadGame(view.api, choice);
    view.run = startRun({
      host: view.root,
      game,
      choice,
      heroes: view.heroes,
      signedIn: view.signedIn,
      onEnd: view.gameOver,
      onLeave: () => {
        view.run = null;
        view.paint();
      },
      onLost: () => {
        view.run = null;
        view.problem = t("The connection to the game was lost.");
        view.paint();
      }
    });
  } catch (error) {
    view.problem = error.message || t("The game could not be set up.");
  } finally {
    view.starting = false;
    view.paint();
  }
}

const CHOICES = {
  mode: (view, value) => ["play", "watch"].includes(value) && (view.mode = value),
  side: (view, value) => SIDES.includes(value) && (view.side = value),
  lane: (view, value) => LANES.includes(value) && (view.lane = value),
  difficulty: (view, value) => DIFFICULTIES.includes(value) && (view.difficulty = value),
  heroes: (view, value) => {
    view.handPicked = value === "hand";
    if (view.handPicked) {
      view.wantPool();
    }
  }
};

export function onClick(view, event) {
  const button = event.target.closest("[data-act]");
  if (!button || !view.root.contains(button) || view.run) {
    return;
  }
  const act = button.dataset.act;
  if (act === "start") {
    view.start();
    return;
  }
  if (CHOICES[act]) {
    CHOICES[act](view, button.dataset.value);
    view.paint();
  }
}

export function onChange(view, event) {
  const select = event.target.closest("select[data-slot]");
  if (!select || view.run) {
    return;
  }
  // one hero in one slot only: choosing it again elsewhere frees the first slot
  for (const [slot, heroId] of Object.entries(view.fixed)) {
    if (heroId && heroId === select.value) {
      view.fixed[slot] = "";
    }
  }
  view.fixed[select.dataset.slot] = select.value;
  view.paint();
}

export const onView = { paint, refreshHistory, wantPool, gameOver, start, onClick, onChange };
