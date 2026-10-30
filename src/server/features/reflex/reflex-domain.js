// Reflex training, the rules: what a finished run may say, what a team can ask of its players, and
// how far each player is in the period that is running. Pure: the caller gives the time.
import {
  GOAL_LIMITS,
  GOAL_METRICS,
  GOAL_PERIODS,
  RUN_MAX_SECONDS,
  exerciseOf
} from "../../../shared/reflex-model.js";
import { HERO_GOAL_FORMS } from "../../../shared/combo-model.js";
import { badRequest } from "../../platform/errors.js";
import { integer, plainObject } from "../../platform/validation.js";

/** The members of a team who are asked to train: the ones who play. */
export const TRAINEE_ROLES = ["captain", "player", "sub"];

/** Who sets the training of a team: the owner, the managers and the coaches. */
export const canAssignTraining = role => role === "owner" || role === "manager" || role === "coach";

/** More than this in a day is not play any more. */
export const MAX_RUNS_PER_DAY = 600;
const DAY = 86_400_000;
const MINUTE = 60_000;

/** A finished run: an exercise, its score, how long it lasted. The server sets the time. */
export function parseRun(body) {
  const input = plainObject(body, "The run");
  const exercise = exerciseOf(input.exercise);
  if (!exercise) {
    throw badRequest("Unknown exercise.", "invalid_body");
  }
  return {
    exercise: exercise.id,
    score: integer(input.score, "score", { min: 0, max: exercise.max }),
    durationMs: integer(input.durationMs, "durationMs", {
      min: exercise.minSeconds * 1000,
      max: RUN_MAX_SECONDS * 1000
    })
  };
}

const choice = (value, allowed, label) => {
  if (!allowed.includes(value)) {
    throw badRequest("{label} is not one of: {allowed}.", "invalid_body", {
      label,
      allowed: allowed.join(", ")
    });
  }
  return value;
};

/**
 * What a team asks of each player: `amount` runs (or minutes of play) of an exercise (any one when
 * `exercise` is empty) each day or each week.
 */
export function parseGoal(body) {
  const input = plainObject(body, "The goal");
  const period = choice(input.period, GOAL_PERIODS, "period");
  const metric = choice(input.metric, GOAL_METRICS, "metric");
  const exercise = input.exercise ?? "";
  if (exercise !== "" && !exerciseOf(exercise)) {
    throw badRequest("Unknown exercise.", "invalid_body");
  }
  return {
    period,
    metric,
    exercise,
    amount: integer(input.amount, "amount", { min: 1, max: GOAL_LIMITS[metric][period] })
  };
}

/** What a team asks about a hero: a hero of the roster and the form its combos must be acquired in. */
export function parseHeroGoal(body, knownHeroIds) {
  const input = plainObject(body, "The goal");
  if (typeof input.heroId !== "string" || !knownHeroIds.has(input.heroId)) {
    throw badRequest("Unknown hero.", "invalid_body");
  }
  return { heroId: input.heroId, form: choice(input.form, HERO_GOAL_FORMS, "form") };
}

const RANKING_PERIODS = ["week", "all"];

/** What a request for the ranking asks: an exercise, and this week (on the team's clock) or ever. */
export function parseRankingQuery(query) {
  const exercise = exerciseOf(query.exercise);
  if (!exercise) {
    throw badRequest("Unknown exercise.", "invalid_body");
  }
  const period = query.period ?? "week";
  if (!RANKING_PERIODS.includes(period)) {
    throw badRequest("{label} is not one of: {allowed}.", "invalid_body", {
      label: "period",
      allowed: RANKING_PERIODS.join(", ")
    });
  }
  return { exercise, period };
}

/** What the staff decides about the ranking: shown to the players or kept for the staff. */
export function parseTrainingSettings(body) {
  const input = plainObject(body, "The settings");
  if (typeof input.leaderboard !== "boolean") {
    throw badRequest(
      "The ranking is shown to the players or it is not: true or false.",
      "invalid_body"
    );
  }
  return { leaderboard: input.leaderboard };
}

/**
 * The players in order of their best score in an exercise (the lowest time, the highest level):
 * those who share a score share the place, the next place skips the ones they took.
 */
export function rankPlayers(exercise, rows) {
  const compare = exercise.better === "lower" ? (a, b) => a - b : (a, b) => b - a;
  const sorted = [...rows].sort(
    (left, right) => compare(left.best, right.best) || left.name.localeCompare(right.name)
  );
  return sorted.map(row => ({
    ...row,
    rank: 1 + sorted.filter(other => compare(other.best, row.best) < 0).length
  }));
}

/** The minutes east of UTC in a body or a query, within what exists (-14 h to +14 h). */
export function parseOffset(value) {
  if (value === undefined || value === "") {
    return 0;
  }
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || Math.abs(minutes) > 14 * 60) {
    throw badRequest(
      "The time zone offset must be a number of minutes between -840 and 840.",
      "invalid_body"
    );
  }
  return minutes;
}

/**
 * The day or the week (from Monday) that contains `now`, on the clock of a place `offset` minutes
 * east of UTC: where it starts and where the next one starts, in milliseconds.
 */
export function periodWindow(now, offset, period) {
  const shift = offset * MINUTE;
  const day = Math.floor((now + shift) / DAY) * DAY;
  const monday = day - ((new Date(day).getUTCDay() + 6) % 7) * DAY;
  const start = period === "day" ? day : monday;
  return { from: start - shift, to: start + (period === "day" ? DAY : 7 * DAY) - shift };
}

/** How far a player is in a goal, given what they played in its period. */
export function progressOf(goal, { runs = 0, durationMs = 0 } = {}) {
  const done = goal.metric === "runs" ? runs : Math.floor(durationMs / MINUTE);
  return { done, target: goal.amount, complete: done >= goal.amount };
}

/**
 * The days in a row with at least one run, up to today (or up to yesterday, when today has none yet:
 * the day is not over). `days` are day numbers on the clock of the player, `today` is today's.
 */
export function streakOf(days, today) {
  const played = new Set(days);
  let day = played.has(today) ? today : today - 1;
  let count = 0;
  while (played.has(day)) {
    count += 1;
    day -= 1;
  }
  return count;
}

/** The number of the day that contains `now` on a clock `offset` minutes east of UTC. */
export const dayNumber = (now, offset) => Math.floor((now + offset * MINUTE) / DAY);
