// A run: its start, its end, the result screen and the save.
import { RUN_MAX_SECONDS, exerciseOf } from "../../../../shared/reflex-model.js";
import { assignments, scoreMarkup, trendHtml } from "./reflex-parts.js";
import { createHud } from "./hud.js";
import { escapeHtml as esc } from "../../../lib/escape.js";
import { exerciseArt } from "./art.js";
import { exerciseName, scoreLabel, scoreText } from "../../../domain/reflex-labels.js";
import { icon } from "../../../../shared/icons.js";
import { number, t } from "../../../app/browser-i18n.js";

export function begin(run) {
  run.goals().hidden = true;
  // calm: the stage and the entries step aside before the board is looked at, so that nothing moves
  // once the run has begun
  run.root.classList.add("is-running");
  // the run has the whole screen: a bar (stop, name, how far it is), then the stage of the exercise
  run.area.innerHTML = `<div class="rx-play keep-dark" data-exercise="${run.exercise.id}">
          <header class="rx-hud">
            <button type="button" class="rx-hud__stop" data-quit aria-label="${t("Stop")}">${icon("x", "i--sm")}<span>${t("Stop")}</span></button>
            <b class="rx-hud__name">${esc(exerciseName(run.exercise.id))}</b>
            <span class="rx-hud__meter" id="rx-meter" aria-hidden="true"></span>
          </header>
          <div class="rx-hud__bar" aria-hidden="true"><i id="rx-bar"></i></div>
          <div class="rx-stage" id="rx-stage" data-exercise="${run.exercise.id}"></div>
        </div>`;
  const startedAt = performance.now();
  let ended = false;
  const finish = score => {
    if (ended) {
      return;
    }
    ended = true;
    run.view.stopRun?.();
    run.view.stopRun = null;
    run.result(score, Math.round(performance.now() - startedAt));
  };
  const leave = new AbortController();
  document.addEventListener(
    "keydown",
    event => {
      if (event.key === "Escape") {
        run.view.stop();
        run.intro();
      }
    },
    { signal: leave.signal }
  );
  const end = run.start({
    stage: run.area.querySelector("#rx-stage"),
    finish,
    random: Math.random,
    hud: createHud(run.area)
  });
  run.view.stopRun = () => {
    end();
    leave.abort();
  };
}

/** Keeps the run, once it is over: the only request an exercise makes. */
export async function save(run) {
  const saved = run.area.querySelector("#rx-saved");
  const record = run.area.querySelector("#rx-record");
  saved.textContent = t("Saving…");
  try {
    const answer = await run.view.api("/api/training/reflex/runs", {
      method: "POST",
      body: { exercise: run.exercise.id, ...run.lastRun }
    });
    run.stats.runs = answer.exercise.runs;
    run.stats.best = answer.exercise.best;
    run.stats.last = [run.lastRun.score, ...run.stats.last].slice(0, 10);
    run.teams = answer.teams;
    run.summary.teams = run.teams; // the next exercise of a routine starts from here
    if (run.inRoutine) {
      run.view.routine.results[run.view.routine.index].isBest = answer.exercise.isBest;
    }
    saved.textContent = t("Saved.");
    record.classList.toggle("is-best", answer.exercise.isBest);
    record.innerHTML = answer.exercise.isBest
      ? t("New best!")
      : `${t("Best")}: <b>${esc(scoreText(run.exercise, answer.exercise.best))}</b>`;
    run.root.querySelector("#rx-assigned-slot").innerHTML = assignments(run.teams, run.exercise.id);
    run.figureOf("rx-fig-best", run.bestMarkup());
    run.figureOf("rx-fig-runs", number(run.stats.runs));
    run.figureOf("rx-fig-last", scoreMarkup(run.exercise, run.stats.last[0]));
    const trend = run.area.querySelector("#rx-trend-slot");
    if (trend) {
      trend.innerHTML = trendHtml(run.exercise, run.stats.last, t("Your latest scores"));
    }
  } catch (error) {
    saved.innerHTML = `${esc(error.message)} <button type="button" class="btn btn--sm" data-retry>${t("Try saving again")}</button>`;
  }
  // in a routine the next exercise waits for the save: nothing is asked of the server while it runs
  const forward = run.area.querySelector("[data-routine-next], [data-routine-end]");
  if (forward) {
    forward.disabled = false;
    forward.focus({ preventScroll: true });
  }
}

export function result(run, measured, durationMs) {
  // a score outside what the exercise can give (somebody left it waiting) is kept at its edge
  const score = Math.min(run.exercise.max, Math.max(0, measured));
  run.lastRun = { score, durationMs: Math.min(durationMs, RUN_MAX_SECONDS * 1000) };
  run.root.classList.remove("is-running");
  run.goals().hidden = false;
  run.root.querySelector(".rx-board").scrollIntoView({ block: "start", behavior: "instant" });
  run.area.innerHTML = `<div class="rx-result keep-dark">
          <span class="rx-result__art keep-dark">${exerciseArt(run.exercise.id)}</span>
          <div class="rx-result__main">
            <span class="rx-result__label">${esc(scoreLabel(run.exercise.id))}</span>
            <b class="rx-result__score" data-score="${score}">${scoreMarkup(run.exercise, score)}</b>
            <p class="rx-result__record" id="rx-record" aria-live="polite"></p>
            <p class="rx-result__saved" id="rx-saved" role="status"></p>
            <div id="rx-trend-slot" class="rx-trend-slot"></div>
            ${
              run.inRoutine
                ? `<div class="hstack wrap">${
                    run.last
                      ? `<button type="button" class="btn btn--primary btn--lg" data-routine-end disabled>${icon("check", "i--sm")}${t("See how you did")}</button>`
                      : `<button type="button" class="btn btn--primary btn--lg" data-routine-next disabled>${icon("play", "i--sm")}${t("Next: {name}", { name: esc(exerciseName(run.view.routine.ids[run.view.routine.index + 1])) })}</button>`
                  }<button type="button" class="btn" data-again>${icon("refresh", "i--sm")}${t("Try again")}</button><button type="button" class="btn btn--ghost" data-routine-stop>${t("Stop the routine")}</button></div>`
                : `<div class="hstack wrap"><button type="button" class="btn btn--primary btn--lg" data-again>${icon("refresh", "i--sm")}${t("Try again")}</button><a class="btn btn--ghost" href="/training/reflex">${t("All exercises")}</a></div>`
            }
          </div>
        </div>`;
  if (run.inRoutine) {
    run.view.routine.results[run.view.routine.index] = {
      id: run.exercise.id,
      score,
      isBest: false
    };
  } else {
    run.area.querySelector("[data-again]").focus({ preventScroll: true });
  }
  run.save();
}

export async function onClick(run, event) {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }
  if (button.matches("[data-start], [data-again]")) {
    run.begin();
  } else if (button.matches("[data-quit]")) {
    run.view.stop();
    run.intro();
  } else if (button.matches("[data-retry]")) {
    run.save();
  } else if (button.matches("[data-routine-next]")) {
    run.view.routine.index += 1;
    await run.view.showExercise(
      run.root,
      run.summary,
      exerciseOf(run.view.routine.ids[run.view.routine.index])
    );
  } else if (button.matches("[data-routine-end]")) {
    run.view.showRoutineSummary(run.root, run.summary);
  } else if (button.matches("[data-routine-stop]")) {
    run.view.go("/training/reflex");
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { begin, save, result, onClick };
