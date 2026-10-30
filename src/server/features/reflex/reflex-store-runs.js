// reflex store, runs: addReflexRun, reflexRunsSince, reflexExerciseStats, reflexSummary.
import { EXERCISES, exerciseOf } from "../../../shared/reflex-model.js";
import { dayNumber, periodWindow, streakOf } from "./reflex-domain.js";
import { randomUUID } from "node:crypto";

// ---- runs --------------------------------------------------------------------------------
export async function addReflexRun(ctx, userId, run, now) {
  await ctx.pool.execute(
    "INSERT INTO reflex_runs (id, user_id, exercise, score, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), userId, run.exercise, run.score, run.durationMs, now]
  );
}

/** How many runs a player has finished since a moment. */
export async function reflexRunsSince(ctx, userId, since) {
  const [[row]] = await ctx.pool.execute(
    "SELECT COUNT(*) AS total FROM reflex_runs WHERE user_id = ? AND created_at >= ?",
    [userId, since]
  );
  return Number(row.total);
}

/** The best score of a player in an exercise (null before the first run), and how many runs. */
export async function reflexExerciseStats(ctx, userId, exerciseId) {
  const [[row]] = await ctx.pool.execute(
    "SELECT COUNT(*) AS runs, MIN(score) AS low, MAX(score) AS high FROM reflex_runs WHERE user_id = ? AND exercise = ?",
    [userId, exerciseId]
  );
  const runs = Number(row.runs);
  const best = !runs
    ? null
    : exerciseOf(exerciseId).better === "lower"
      ? Number(row.low)
      : Number(row.high);
  return { runs, best };
}

/**
 * What a player has done: for each exercise the best score, the number of runs and the latest
 * scores; how much they played today and this week (on their own clock, `offset` minutes east of
 * UTC); and the days in a row they have played.
 */
export async function reflexSummary(ctx, userId, { now, offset }) {
  const [totals] = await ctx.pool.execute(
    "SELECT exercise, COUNT(*) AS runs, MIN(score) AS low, MAX(score) AS high FROM reflex_runs WHERE user_id = ? GROUP BY exercise",
    [userId]
  );
  const [latest] = await ctx.pool.execute(
    "SELECT exercise, score FROM reflex_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT 400",
    [userId]
  );
  const today = periodWindow(now, offset, "day");
  const week = periodWindow(now, offset, "week");
  const [thisWeek] = await ctx.pool.execute(
    "SELECT exercise, created_at, duration_ms FROM reflex_runs WHERE user_id = ? AND created_at >= ? AND created_at < ?",
    [userId, week.from, week.to]
  );
  const [days] = await ctx.pool.query(
    "SELECT DISTINCT FLOOR((created_at + ?) / ?) AS day FROM reflex_runs WHERE user_id = ? AND created_at >= ? ORDER BY day DESC",
    [offset * MINUTE, DAY, userId, now - 400 * DAY]
  );

  const byExercise = new Map(totals.map(row => [row.exercise, row]));
  const exercises = {};
  for (const exercise of EXERCISES) {
    const row = byExercise.get(exercise.id);
    exercises[exercise.id] = {
      runs: row ? Number(row.runs) : 0,
      best: row ? Number(exercise.better === "lower" ? row.low : row.high) : null,
      last: latest
        .filter(entry => entry.exercise === exercise.id)
        .slice(0, LAST_SCORES)
        .map(entry => Number(entry.score))
    };
  }
  const spent = (rows, from, to) => {
    const inside = rows.filter(
      row => Number(row.created_at) >= from && Number(row.created_at) < to
    );
    return {
      runs: inside.length,
      minutes: Math.floor(inside.reduce((sum, row) => sum + row.duration_ms, 0) / MINUTE)
    };
  };
  return {
    exercises,
    // the exercises played today, in the order of the list (the routines tick them off)
    doneToday: EXERCISES.map(exercise => exercise.id).filter(id =>
      thisWeek.some(
        row =>
          row.exercise === id &&
          Number(row.created_at) >= today.from &&
          Number(row.created_at) < today.to
      )
    ),
    today: spent(thisWeek, today.from, today.to),
    week: spent(thisWeek, week.from, week.to),
    streak: streakOf(
      days.map(row => Number(row.day)),
      dayNumber(now, offset)
    )
  };
}

const DAY = 86_400_000;

const MINUTE = 60_000;

/** How many of the latest scores of each exercise the page shows. */
const LAST_SCORES = 10;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { addReflexRun, reflexRunsSince, reflexExerciseStats, reflexSummary };
