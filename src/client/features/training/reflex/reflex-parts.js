// Pieces of the reflex pages: the score, the goals of the teams, an exercise card, the trend.
import { ROUTINES, bestOf } from "../../../../shared/reflex-model.js";
import { escapeHtml as esc } from "../../../lib/escape.js";
import { exerciseArt } from "./art.js";
import { exerciseBlurb, exerciseName, goalRow, scoreText } from "../../../domain/reflex-labels.js";
import { icon } from "../../../../shared/icons.js";
import { t } from "../../../app/browser-i18n.js";

/** The click handler of a page that lists routines: a button with `data-routine` starts that routine. */
export const startsRoutine = (view, root, summary) => event => {
  const button = event.target.closest("[data-routine]");
  if (button) {
    view.startRoutine(
      root,
      summary,
      ROUTINES.find(item => item.id === button.dataset.routine).exercises
    );
  }
};

/** Ends the exercise that is on screen, if any (its timers, its listeners). */
export function stop(view) {
  view.stopRun?.();
  view.stopRun = null;
}

/** A score as the big figures write it: the unit small beside the number. */
export const scoreMarkup = (exercise, score) =>
  exercise.unit === "ms" ? `${score}<small>ms</small>` : String(score);

/** The goals of the teams a player trains with; the ones an exercise counts for, on its own page. */
export function assignments(teams, exerciseId = "") {
  const blocks = teams
    .map(entry => ({
      team: entry.team,
      goals: entry.goals.filter(
        goal => !exerciseId || !goal.exercise || goal.exercise === exerciseId
      )
    }))
    .filter(block => block.goals.length);
  if (!blocks.length) {
    return "";
  }
  return `<section class="card rise d-1 rx-goals-card" id="rx-assigned"><div class="card__head"><h2>${t("Set by your teams")}</h2></div><div class="rx-goals">${blocks
    .map(
      block =>
        `<p class="trn-team"><b>${esc(block.team.name)}</b> <span class="pill pill--grey">${esc(block.team.tag)}</span></p><ul class="rx-goals">${block.goals
          .map(goal =>
            goalRow(
              goal,
              goal.progress,
              goal.exercise && goal.exercise !== exerciseId
                ? `<a class="btn btn--sm btn--ghost" href="/training/reflex/${esc(goal.exercise)}">${icon("play", "i--sm")}${t("Play")}</a>`
                : ""
            )
          )
          .join("")}</ul>`
    )
    .join("")}</div></section>`;
}

/** The tile of an exercise: its picture, its name, what it asks, the best score of the person. */
export const exerciseCard = (exercise, summary) => {
  const best = summary.exercises[exercise.id].best;
  return `<a class="rx-card" href="/training/reflex/${exercise.id}"><span class="rx-card__art keep-dark">${exerciseArt(exercise.id)}${summary.doneToday.includes(exercise.id) ? `<span class="rx-card__done" role="img" aria-label="${t("Played today")}" title="${t("Played today")}">${icon("check", "i--sm")}</span>` : ""}</span><span class="rx-card__body"><b>${esc(exerciseName(exercise.id))}</b><p>${esc(exerciseBlurb(exercise.id))}</p></span><span class="rx-card__best">${
    best === null
      ? `<span>${t("Not played yet")}</span>`
      : `<span>${t("Best")}</span><b>${esc(scoreText(exercise, best))}</b>`
  }</span></a>`;
};

/** The latest scores as bars, the oldest first: the taller the bar, the better the score. */
export function trendHtml(exercise, newestFirst, label) {
  const scores = [...newestFirst].reverse();
  if (scores.length < 2) {
    return ""; // one score is no trend
  }
  const low = Math.min(...scores);
  const high = Math.max(...scores);
  const best = bestOf(exercise, scores);
  const height = score => {
    if (high === low) {
      return 100;
    }
    const quality =
      exercise.better === "lower" ? (high - score) / (high - low) : (score - low) / (high - low);
    return Math.round(30 + quality * 70);
  };
  return `<ul class="rx-trend" aria-label="${esc(label)}">${scores
    .map(
      (score, index) =>
        `<li class="${score === best ? "is-best" : ""}${index === scores.length - 1 ? " is-now" : ""}" data-p="${height(score)}" title="${esc(scoreText(exercise, score))}"><span class="visually-hidden">${esc(scoreText(exercise, score))}</span></li>`
    )
    .join("")}</ul>`;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { stop };
