// scrim actions, small helpers: showForm, showMode.
import { state } from "../../app/app-state.js";

// "New series" and the quick starts both lead to the panel of the page (the rule and the format are chosen
// for you).
export const showForm = () => {
  const card = document.querySelector("#new-series-card");
  card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  card?.querySelector("#team-a")?.focus({ preventScroll: true });
};

/** The rule on the tiles of the panel, and the sentence and the order that explain it. */
export const showMode = mode => {
  state.gameMode = mode;
  for (const choice of document.querySelectorAll("[data-action='set-game-mode']")) {
    choice.setAttribute("aria-pressed", String(choice.dataset.mode === mode));
  }
  for (const panel of document.querySelectorAll("[data-rule-panel]")) {
    panel.hidden = panel.dataset.rulePanel !== mode;
  }
};
