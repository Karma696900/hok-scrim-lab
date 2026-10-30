// The screen before a run: how it is played, how it is scored, the best score and the trend.
import { betterText, scoreLabel } from "../../../domain/reflex-labels.js";
import { escapeHtml as esc } from "../../../lib/escape.js";
import { exerciseArt } from "./art.js";
import { icon } from "../../../../shared/icons.js";
import { scoreMarkup, trendHtml } from "./reflex-parts.js";
import { t } from "../../../app/browser-i18n.js";

export const figureOf = (run, id, html) => {
  const node = run.root.querySelector(`#${id}`);
  if (node) {
    node.innerHTML = html;
  }
};

export const bestMarkup = run =>
  run.stats.best === null ? "–" : scoreMarkup(run.exercise, run.stats.best);

// the goals of the teams are not needed while a run lasts: the stage comes up the page
export const goals = run => run.root.querySelector("#rx-assigned-slot");

export function intro(run) {
  run.root.classList.remove("is-running");
  run.goals().hidden = false;
  const yours =
    run.stats.best === null
      ? `<p class="rx-record">${t("You have not played this one yet.")}</p>`
      : `<span class="rx-yours__label">${t("Best")}</span><b class="rx-yours__best">${scoreMarkup(run.exercise, run.stats.best)}</b>`;
  run.area.innerHTML = `<div class="rx-intro">
          <div class="rx-intro__how">
            <span class="rx-intro__art keep-dark">${exerciseArt(run.exercise.id)}</span>
            <div class="rx-how">
              <h2>${t("How it is played")}</h2><p>${esc(how(run.exercise.id))}</p>
              <h2>${t("How it is scored")}</h2><p><b>${esc(scoreLabel(run.exercise.id))}</b>: ${esc(rule(run.exercise.id))} ${esc(betterText(run.exercise))}.</p>
            </div>
          </div>
          <aside class="rx-yours">
            ${yours}
            ${trendHtml(run.exercise, run.stats.last, t("Your latest scores"))}
            <div class="hstack wrap rx-actions"><button type="button" class="btn btn--primary btn--lg" data-start>${icon("play", "i--sm")}${t("Start")}</button>${
              run.inRoutine
                ? `<button type="button" class="btn" ${run.last ? "data-routine-end" : "data-routine-next"}>${t("Skip this exercise")}</button><button type="button" class="btn btn--ghost" data-routine-stop>${t("Stop the routine")}</button>`
                : `<a class="btn btn--ghost" href="/training/reflex">${t("All exercises")}</a>`
            }</div>
          </aside>
        </div>`;
  run.area.querySelector("[data-start]").focus({ preventScroll: true });
}

/** How an exercise is played. */
const how = id =>
  ({
    reaction: t(
      "The pad turns green after a random wait. Hit it as soon as it does. A hit before the green does not count: the round is played again. Five rounds."
    ),
    sequence: t(
      "Pads light up one after the other. Repeat the order. Each level adds a pad, and one wrong pad ends the run."
    ),
    chimp: t(
      "Numbers are scattered on the board. Touch them in order from 1: once you touch the 1, the others are hidden. Three strikes end the run."
    ),
    aim: t(
      "A target appears; hit it and the next one appears somewhere else. Thirty targets. A click next to the target adds 150 ms to it."
    ),
    tracking: t(
      "Some balls light up, then all of them look the same and move. When they stop, touch the ones that were lit. Each level adds a ball; three lives."
    ),
    discern: t(
      "Units appear for one second. Hit the red ones (enemies) and leave the blue ones (allies) alone. Thirty units."
    ),
    lasthit: t(
      "A minion's life bar runs down and there is a notch on it. Strike exactly when the bar goes under the notch, not before and not after. Ten minions."
    ),
    inputs: t(
      "Four skills appear. Press them in order with the keys 1 to 4, or by touch. Fifteen prompts. A wrong key adds 300 ms."
    )
  })[id] ?? "";

/** How the score of an exercise is made. */
const rule = id =>
  ({
    reaction: t("The average of your five rounds, in milliseconds."),
    sequence: t("The longest sequence you repeated without a mistake."),
    chimp: t("The most numbers you cleared on one board."),
    aim: t("The average time to hit a target, in milliseconds."),
    tracking: t("The most balls you followed without a mistake."),
    discern: t(
      "The average time to hit an enemy in milliseconds (a missed one counts for the whole second), plus 250 ms for each ally you hit."
    ),
    lasthit: t("How far off your strikes were on average, in milliseconds."),
    inputs: t("The average time for one prompt, in milliseconds.")
  })[id] ?? "";

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { figureOf, bestMarkup, goals, intro };
