// What opens on top of the board: the surprise question and the pause (both hide the map), the countdown
// of a dead hero, and the grade at the end: only « Macro grade: X », and that the game was paused when it
// was.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { esc } from "./simulation-shared.js";

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
    <button type="button" class="btn btn--ghost" data-sim="leave">${icon("x")}${t("Leave the game")}</button>
  </div>`;

/** The countdown of a dead hero. */
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
