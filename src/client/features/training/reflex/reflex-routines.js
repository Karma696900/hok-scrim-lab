// Routines: several exercises, one after the other, and their summary.
import {
  EXERCISES,
  ROUTINES,
  chosenExercises,
  exerciseOf
} from "../../../../shared/reflex-model.js";
import { escapeHtml as esc } from "../../../lib/escape.js";
import {
  exerciseName,
  routineBlurb,
  routineName,
  scoreText
} from "../../../domain/reflex-labels.js";
import { icon } from "../../../../shared/icons.js";
import { number, t } from "../../../app/browser-i18n.js";
import { ICONS } from "./reflex-shared.js";
import { assignments, startsRoutine } from "./reflex-parts.js";

// ---- routines: several exercises, one after the other ---------------------------------------------
/** The exercise a routine is on is drawn like any other, with where it stands and what comes next. */
export async function startRoutine(view, root, summary, ids) {
  view.routine = { ids, index: 0, results: [] };
  await view.showExercise(root, summary, exerciseOf(ids[0]));
}

/** The routines to choose from (the ticks say which exercises were played today) and one's own. */
export function showRoutines(view, root, summary) {
  view.routine = null;
  const done = new Set(summary.doneToday);
  const steps = ids =>
    ids
      .map(
        id =>
          `<li class="${done.has(id) ? "is-done" : ""}">${icon(ICONS[id], "i--sm")}<span>${esc(exerciseName(id))}</span>${done.has(id) ? `<span class="visually-hidden"> (${t("Played today")})</span>` : ""}</li>`
      )
      .join("");
  const card = item => `<article class="card rise d-1 rx-routine">
        <div class="card__head"><h2>${esc(routineName(item.id))}</h2><span class="pill pill--grey">${t("{count, plural, one {# exercise} other {# exercises}}", { count: item.exercises.length })}</span></div>
        <p class="muted">${esc(routineBlurb(item.id))}</p>
        <ul class="rx-routine__steps">${steps(item.exercises)}</ul>
        <button type="button" class="btn btn--primary" data-routine="${item.id}">${icon("play", "i--sm")}${t("Start the routine")}</button>
      </article>`;
  root.innerHTML = `${view.kit.chrome({
    zone: "reflex",
    title: t("Routines"),
    text: t(
      "Play several exercises in a row, each one after the other, and see how you did at the end."
    ),
    back: { href: "/training/reflex", label: t("Reflex training") },
    slim: true,
    entries: false,
    figures: [
      [number(ROUTINES.length), t("Routines")],
      [number(EXERCISES.length), t("Exercises")],
      [number(summary.doneToday.length), t("Played today")]
    ]
  })}
      <div class="stack-y rx-page">
        ${assignments(summary.teams)}
        <div class="rx-routines">${ROUTINES.map(card).join("")}</div>
        <form id="rx-custom" class="card rise d-2" novalidate>
          <div class="card__head"><h2>${t("Your own routine")}</h2></div>
          <p class="muted">${t("Tick the exercises you want, they are played in the order of the list.")}</p>
          <div class="chip-checks">${EXERCISES.map(exercise => `<label class="chip-check"><input type="checkbox" name="exercises" value="${exercise.id}"><span>${esc(exerciseName(exercise.id))}</span></label>`).join("")}</div>
          <p class="form-error" id="rx-custom-error" role="alert"></p>
          <button class="btn btn--primary" type="submit">${icon("play", "i--sm")}${t("Start the routine")}</button>
        </form>
      </div>`;
  view.kit.paintChrome();
  root.onclick = startsRoutine(view, root, summary);
  root.onsubmit = event => {
    event.preventDefault();
    const ids = chosenExercises(new FormData(event.target).getAll("exercises"));
    if (ids.length < 2) {
      root.querySelector("#rx-custom-error").textContent = t("Tick at least two exercises.");
      return;
    }
    view.startRoutine(root, summary, ids);
  };
}

/** What the routine that has just ended gave, exercise by exercise. */
export function showRoutineSummary(view, root, summary) {
  const ended = view.routine;
  view.routine = null;
  const played = ended.results.filter(Boolean);
  root.innerHTML = `${view.kit.chrome({
    zone: "reflex",
    title: t("Routine complete"),
    text: t("Your results, exercise by exercise."),
    back: { href: "/training/reflex", label: t("Reflex training") },
    slim: true,
    entries: false,
    figures: [
      [number(played.length), t("Exercises")],
      [number(played.filter(entry => entry.isBest).length), t("New best!")]
    ]
  })}
      <div class="stack-y rx-page">
        <section class="card rise d-1" id="rx-routine-summary">
          <div class="card__head"><h2>${t("Your results")}</h2></div>
          ${
            played.length
              ? `<div class="table-scroll"><table class="table table--boxed"><thead><tr><th scope="col">${t("Exercise")}</th><th scope="col" class="r">${t("Score")}</th><th scope="col"><span class="visually-hidden">${t("Record")}</span></th></tr></thead><tbody>${played
                  .map(
                    entry =>
                      `<tr><th scope="row">${esc(exerciseName(entry.id))}</th><td class="r">${esc(scoreText(exerciseOf(entry.id), entry.score))}</td><td>${entry.isBest ? `<span class="pill pill--live">${t("New best!")}</span>` : ""}</td></tr>`
                  )
                  .join("")}</tbody></table></div>`
              : `<p class="muted">${t("Nothing was played in this routine.")}</p>`
          }
          <div class="hstack wrap rx-actions"><button type="button" class="btn btn--primary" data-routine-again>${icon("refresh", "i--sm")}${t("Do it again")}</button><a class="btn btn--ghost" href="/training/reflex">${t("All exercises")}</a></div>
        </section>
        ${assignments(summary.teams)}
      </div>`;
  view.kit.paintChrome();
  root.onclick = event => {
    if (event.target.closest("[data-routine-again]")) {
      view.startRoutine(root, summary, ended.ids);
    }
  };
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { startRoutine, showRoutines, showRoutineSummary };
