// One exercise: its intro, the run, the result, the save.
import { EXERCISES } from "../../../../shared/reflex-model.js";
import { exerciseBlurb, exerciseName } from "../../../domain/reflex-labels.js";
import { escapeHtml as esc } from "../../../lib/escape.js";
import { icon } from "../../../../shared/icons.js";
import { number, t } from "../../../app/browser-i18n.js";
import { ICONS } from "./reflex-shared.js";
import { assignments, exerciseCard, scoreMarkup } from "./reflex-parts.js";
import { bindTo } from "../../../../shared/bind-to.js";
import { onView as reflexIntro } from "./reflex-intro.js";
import { onView as reflexRun } from "./reflex-run.js";

// ---- one exercise ---------------------------------------------------------------------------------
export async function showExercise(view, root, summary, exercise) {
  const run = { root, exercise, view, summary };
  bindTo(run, reflexIntro, reflexRun);
  run.start = await STARTERS[run.exercise.id]();
  run.stats = run.summary.exercises[run.exercise.id];
  run.teams = run.summary.teams;
  run.lastRun = null;
  // in a routine: where it is, so that the page can say what comes next and wait for the save
  run.inRoutine = Boolean(
    run.view.routine && run.view.routine.ids[run.view.routine.index] === run.exercise.id
  );
  run.last = run.inRoutine && run.view.routine.index === run.view.routine.ids.length - 1;
  const steps = run.inRoutine
    ? `<ol class="rx-steps rise" aria-label="${t("Routine")}">${run.view.routine.ids
        .map(
          (id, index) =>
            `<li class="${index < run.view.routine.index ? "is-done" : index === run.view.routine.index ? "is-now" : ""}"${index === run.view.routine.index ? ' aria-current="step"' : ""}>${icon(ICONS[id], "i--sm")}<span>${esc(exerciseName(id))}</span></li>`
        )
        .join("")}</ol>`
    : "";

  // under the board, the other exercises: a way to go on (a routine goes on by its own steps)
  const others = run.inRoutine
    ? ""
    : `<section class="rx-others" id="rx-others" aria-labelledby="rx-others-title"><div class="trn-sec"><h2 id="rx-others-title">${t("All exercises")}</h2></div><div class="rx-list rx-list--small">${EXERCISES.filter(
        entry => entry.id !== run.exercise.id
      )
        .map(entry => exerciseCard(entry, run.summary))
        .join("")}</div></section>`;
  run.root.classList.remove("is-running");
  run.root.innerHTML = `${run.view.kit.chrome({
    zone: "reflex",
    title: esc(exerciseName(run.exercise.id)),
    text: esc(exerciseBlurb(run.exercise.id)),
    back: { href: "/training/reflex", label: t("Reflex training") },
    slim: true,
    entries: false,
    figures: [
      [run.bestMarkup(), t("Best"), "rx-fig-best"],
      [number(run.stats.runs), t("Runs"), "rx-fig-runs"],
      [
        run.stats.last.length ? scoreMarkup(run.exercise, run.stats.last[0]) : "–",
        t("Latest"),
        "rx-fig-last"
      ]
    ]
  })}
      <div class="stack-y rx-page">
        ${steps}
        <div id="rx-assigned-slot">${assignments(run.teams, run.exercise.id)}</div>
        <section class="card rise d-1 rx-board"><div id="rx-area"></div></section>
        ${others}
      </div>`;
  run.view.kit.paintChrome();
  run.area = run.root.querySelector("#rx-area");

  run.root.onclick = run.onClick;
  run.intro();
}

const STARTERS = {
  reaction: () => import("./exercises/reaction.js").then(module => module.startReaction),
  sequence: () => import("./exercises/sequence.js").then(module => module.startSequence),
  chimp: () => import("./exercises/chimp.js").then(module => module.startChimp),
  aim: () => import("./exercises/aim.js").then(module => module.startAim),
  tracking: () => import("./exercises/tracking.js").then(module => module.startTracking),
  discern: () => import("./exercises/discern.js").then(module => module.startDiscern),
  lasthit: () => import("./exercises/lasthit.js").then(module => module.startLastHit),
  inputs: () => import("./exercises/inputs.js").then(module => module.startInputs)
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { showExercise };
