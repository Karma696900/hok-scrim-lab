// The words of the reflex exercises and of the goals a team sets, and the way a goal is drawn. The
// training area and the page of a team both need them.
import { icon } from "../../shared/icons.js";
import { exerciseOf } from "../../shared/reflex-model.js";
import { escapeHtml } from "../lib/dom.js";
import { t } from "../app/browser-i18n.js";

export const exerciseName = id =>
  ({
    reaction: t("Reaction time"),
    sequence: t("Sequence memory"),
    chimp: t("Chimp test"),
    aim: t("Aim trainer"),
    tracking: t("Tracking"),
    discern: t("Friend or foe"),
    lasthit: t("Last hit"),
    inputs: t("Skill keys")
  })[id] ?? id;

/** One line for the card of the exercise. */
export const exerciseBlurb = id =>
  ({
    reaction: t("Hit the pad the moment it turns green."),
    sequence: t("Repeat the order in which the pads light up."),
    chimp: t("Remember where the numbers were and touch them in order."),
    aim: t("Hit thirty targets as fast as you can."),
    tracking: t("Follow the lit balls while they move."),
    discern: t("Hit the enemies, leave your allies alone."),
    lasthit: t("Strike when the life bar goes under the notch."),
    inputs: t("Press the skill keys in the order shown.")
  })[id] ?? "";

/** The name of a routine (a few exercises played one after the other) and what it is for. */
export const routineName = id =>
  ({
    warmup: t("Warm-up"),
    mechanics: t("Mechanics"),
    focus: t("Focus and memory"),
    everything: t("Everything")
  })[id] ?? id;

export const routineBlurb = id =>
  ({
    warmup: t("Reaction, aim and skill keys: wake the hands up before a scrim."),
    mechanics: t("Skill keys, last hit, friend or foe and aim: the precision of the hands."),
    focus: t("Sequence memory, the chimp test and tracking: keep the information in your head."),
    everything: t("The eight exercises, one after the other.")
  })[id] ?? "";

/** What the score of an exercise is called. */
export const scoreLabel = id =>
  ({
    reaction: t("Average time"),
    sequence: t("Level reached"),
    chimp: t("Numbers cleared"),
    aim: t("Average time per target"),
    tracking: t("Balls followed"),
    discern: t("Average time, with penalties"),
    lasthit: t("Average error"),
    inputs: t("Average time per prompt")
  })[id] ?? "";

/** A score as it is read: times in milliseconds, levels and counts as they are. */
export const scoreText = (exercise, score) =>
  exercise.unit === "ms" ? `${score} ms` : String(score);

export const betterText = exercise =>
  exercise.better === "lower" ? t("Lower is better") : t("Higher is better");

export const runsText = count => t("{count, plural, one {# run} other {# runs}}", { count });
export const minutesText = count =>
  t("{count, plural, one {# minute} other {# minutes}}", { count });
export const daysText = count => t("{count, plural, one {# day} other {# days}}", { count });

/** When, how much, of what: the three parts of a goal, as words. */
export function goalParts(goal) {
  const exercise = exerciseOf(goal.exercise);
  return {
    period: goal.period === "day" ? t("Every day") : t("Every week"),
    amount: goal.metric === "runs" ? runsText(goal.amount) : minutesText(goal.amount),
    exercise: exercise ? exerciseName(exercise.id) : t("Any exercise")
  };
}

/**
 * A goal as a line: when, how much, of what; with a bar and a count when `progress` is given
 * ({ done, target, complete }). `action` is markup placed at the end (a link, a button).
 */
export function goalRow(goal, progress = null, action = "") {
  const { period, amount, exercise } = goalParts(goal);
  const bar = progress ? progressMarkup(progress, `${period} · ${amount} · ${exercise}`) : "";
  return `<li class="goal-row${progress?.complete ? " is-done" : ""}"><span class="goal-row__what"><span class="pill pill--blue">${escapeHtml(period)}</span><b>${escapeHtml(amount)}</b><span class="muted">${escapeHtml(exercise)}</span></span>${bar}${action}</li>`;
}

/**
 * A bar and a count for how far somebody is in a goal ({ done, target, complete }); `label` is what a
 * screen reader hears for the bar.
 */
export function progressMarkup(progress, label) {
  const done = Math.min(progress.done, progress.target);
  const percent = progress.target ? Math.round((done / progress.target) * 100) : 0;
  return `<div class="bar goal-row__bar" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="${Math.max(1, progress.target)}" aria-valuenow="${done}"><i data-p="${percent}"></i></div><span class="goal-row__count">${progress.complete ? icon("check", "i--sm") : ""}${progress.done} / ${progress.target}</span>`;
}
