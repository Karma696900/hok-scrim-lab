// The reflex exercises of the training area: which ones exist, how a result is read and the limits a
// saved run must respect. The pages play the exercises in the browser, with no request while one runs;
// the server only keeps the result afterwards, and checks it against what follows.

/**
 * `id` is the address and the name of the exercise. `better` says whether a low score (a time) or a
 * high one (a level) wins, `unit` what it is counted in. A run cannot last less than `minSeconds`
 * (it would be made up: the shortest honest run is longer), and `max` is the largest score that can
 * be reached.
 */
export const EXERCISES = [
  { id: "reaction", better: "lower", unit: "ms", minSeconds: 8, max: 5000 },
  { id: "sequence", better: "higher", unit: "level", minSeconds: 2, max: 100 },
  { id: "chimp", better: "higher", unit: "numbers", minSeconds: 2, max: 40 },
  { id: "aim", better: "lower", unit: "ms", minSeconds: 4, max: 10_000 },
  { id: "tracking", better: "higher", unit: "targets", minSeconds: 8, max: 8 },
  { id: "discern", better: "lower", unit: "ms", minSeconds: 15, max: 10_000 },
  { id: "lasthit", better: "lower", unit: "ms", minSeconds: 8, max: 2000 },
  { id: "inputs", better: "lower", unit: "ms", minSeconds: 5, max: 20_000 }
];

/** A run that lasts longer than this is not one run of an exercise. */
export const RUN_MAX_SECONDS = 30 * 60;

export const exerciseOf = id => EXERCISES.find(exercise => exercise.id === id) ?? null;

/** Does `score` beat `other` (a score, or nothing yet) in this exercise? */
export const isBetter = (exercise, score, other) =>
  other === null || other === undefined
    ? true
    : exercise.better === "lower"
      ? score < other
      : score > other;

/** The best of some scores, or null when there are none. */
export const bestOf = (exercise, scores) =>
  scores.length ? (exercise.better === "lower" ? Math.min : Math.max)(...scores) : null;

// ---- routines: exercises chained in one sitting ----------------------------------------------------
/**
 * A routine is a few exercises played one after the other, each ending on its result before the next
 * begins. These are ours (a way to sort the eight exercises), not the game's.
 */
export const ROUTINES = [
  { id: "warmup", exercises: ["reaction", "aim", "inputs"] },
  { id: "mechanics", exercises: ["inputs", "lasthit", "discern", "aim"] },
  { id: "focus", exercises: ["sequence", "chimp", "tracking"] },
  { id: "everything", exercises: EXERCISES.map(exercise => exercise.id) }
];

export const routineOf = id => ROUTINES.find(routine => routine.id === id) ?? null;

/** The exercises someone ticked, in the order of the list and each once; unknown ones are dropped. */
export const chosenExercises = ids =>
  EXERCISES.map(exercise => exercise.id).filter(id => ids.includes(id));

// ---- what a team can ask of its players --------------------------------------------------------
export const GOAL_PERIODS = ["day", "week"];
/** Runs played, or minutes spent playing them. */
export const GOAL_METRICS = ["runs", "minutes"];
/** The most a goal can ask for, by what is counted and by period. */
export const GOAL_LIMITS = {
  runs: { day: 200, week: 1000 },
  minutes: { day: 480, week: 3000 }
};
export const MAX_GOALS_PER_TEAM = 10;
