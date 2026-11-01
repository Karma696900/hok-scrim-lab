// What opens on top of the board: the decision box (four choices and "stay", never saying which are
// good), the surprise question and the pause (both hide the map), the countdown of a dead hero, and the
// grade at the end: only « Macro grade: X », and that the game was paused when it was.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { esc, heroName } from "./simulation-shared.js";

/** The text of a choice, its place names translated and its hero named. */
export function choiceText(choice, heroes) {
  const params = {};
  for (const [key, value] of Object.entries(choice.params ?? {})) {
    params[key] = esc(key === "hero" ? heroName(heroes, value) : t(String(value)));
  }
  return t(choice.label, params);
}

/** The decision box: the four choices in the order the engine shuffled them, then "stay". */
export function decisionHtml(decision, heroes) {
  const button = (choice, cls = "") =>
    `<button type="button" class="sim-choice${cls}" data-sim="choose" data-id="${esc(choice.id)}">${choiceText(choice, heroes)}</button>`;
  return `<p class="sim-decision__title">${decision.waiting ? t("Your hero is waiting: what next?") : t("What next?")}</p>
  <div class="sim-choices">${decision.options.map(choice => button(choice)).join("")}${button(decision.stay, " sim-choice--stay")}</div>`;
}

/** A surprise question: the map is hidden, the player answers from memory before the time runs out. */
export function questionHtml(question) {
  return `<div class="sim-question" role="dialog" aria-modal="true" aria-labelledby="sim-question-text">
    <p class="sim-cover__kicker">${icon("clock")}${t("Surprise question")} · <b class="sim-question__left">${Math.ceil(question.left)}</b></p>
    <h2 id="sim-question-text">${t(question.text, question.params)}</h2>
    <div class="sim-answers">${question.choices
      .map(
        choice =>
          `<button type="button" class="btn sim-answer" data-sim="answer" data-id="${esc(choice.id)}">${t(choice.label)}</button>`
      )
      .join("")}</div>
  </div>`;
}

export const pauseHtml =
  () => `<div class="sim-paused" role="dialog" aria-modal="true" aria-labelledby="sim-paused-title">
    <h2 id="sim-paused-title">${t("Paused")}</h2>
    <p class="muted">${t("The map is hidden while the game is paused, and the pause is noted with your grade.")}</p>
    <button type="button" class="btn btn--primary" data-sim="resume">${icon("play")}${t("Resume")}</button>
  </div>`;

/** The countdown of a dead hero (no decision until 5 s before he is back). */
export const deathHtml = seconds =>
  `<p>${t("Back in {seconds} s", { seconds: Math.max(0, Math.ceil(seconds)) })}</p>`;

/** The end of the game: the grade and nothing else (and the pause, when there was one). */
export function gradeHtml(result, { signedIn }) {
  return `<div class="sim-grade-card" role="dialog" aria-modal="true" aria-labelledby="sim-grade-title">
    <p class="sim-cover__kicker">${t("Game over")}</p>
    <h2 id="sim-grade-title">${t("Macro grade: {grade}", { grade: `<b class="sim-grade sim-grade--${esc(result.letter.toLowerCase())}">${esc(result.letter)}</b>` })}</h2>
    ${result.paused ? `<p class="muted">${t("The game was paused.")}</p>` : ""}
    ${signedIn ? `<p class="muted">${t("The grade is kept in your games.")}</p>` : ""}
    <button type="button" class="btn btn--primary" data-sim="leave">${t("Back to the set-up")}</button>
  </div>`;
}
