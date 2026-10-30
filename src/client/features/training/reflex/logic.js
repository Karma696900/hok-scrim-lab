// The plain calculation of the reflex exercises: the boards, the sequences, the movement of the balls
// and how a result is averaged. No page in here, so that it is tested without a browser. `random`
// gives a number from 0 up to (not including) 1, like Math.random.

export const average = values =>
  values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

/** A whole number from 0 to `count - 1`. */
const pick = (count, random) => Math.floor(random() * count);

/** A copy of the list in a random order. */
export function shuffled(items, random = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = pick(index + 1, random);
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

// ---- sequence memory: nine pads, a longer sequence at each level ---------------------------------
export const SEQUENCE_PADS = 9;

/** The sequence of the next level: the one before, with one pad more. */
export const extendSequence = (sequence, random = Math.random) => [
  ...sequence,
  pick(SEQUENCE_PADS, random)
];

// ---- the chimp test: numbers on a board, hidden once the first one is touched ----------------------
export const CHIMP_COLUMNS = 8;
export const CHIMP_ROWS = 5;
export const CHIMP_START = 4;
export const CHIMP_STRIKES = 3;

/** Where each number from 1 to `count` sits on the board: `count` different cells. */
export const chimpBoard = (count, random = Math.random) =>
  shuffled(
    Array.from({ length: CHIMP_COLUMNS * CHIMP_ROWS }, (_, cell) => cell),
    random
  )
    .slice(0, count)
    .map((cell, index) => ({ number: index + 1, cell }));

// ---- aim: one target at a time, anywhere in the arena -----------------------------------------------
export const AIM_TARGETS = 30;
export const AIM_SIZE = 56;
export const AIM_MISS = 150;

/** A spot of the arena for a target of `size`, away from the last one when there is room. */
export function targetSpot({ width, height }, size, random = Math.random, last = null) {
  let spot = { x: 0, y: 0 };
  for (let attempt = 0; attempt < 12; attempt += 1) {
    spot = {
      x: pick(Math.max(1, width - size), random),
      y: pick(Math.max(1, height - size), random)
    };
    if (!last || Math.hypot(spot.x - last.x, spot.y - last.y) >= size * 3) {
      break;
    }
  }
  return spot;
}

// ---- tracking: balls that move, a few of them to follow ---------------------------------------------
export const TRACKING_BALLS = 10;
export const TRACKING_START = 3;
export const TRACKING_MAX = 8;
export const TRACKING_LIVES = 3;

/** How fast the balls go, in pixels a second: a little faster with each ball to follow. */
export const trackingSpeed = targets => 110 + 12 * targets;

/** Which of the balls are to be followed: `count` of the `total`, by position in the list. */
export const pickTargets = (total, count, random = Math.random) =>
  new Set(
    shuffled(
      Array.from({ length: total }, (_, index) => index),
      random
    ).slice(0, count)
  );

/** The balls: apart from each other, each with a random direction, all at the same speed. */
export function makeBalls(count, { width, height, radius }, speed, random = Math.random) {
  const balls = [];
  let attempts = 0;
  while (balls.length < count) {
    const x = radius + random() * (width - 2 * radius);
    const y = radius + random() * (height - 2 * radius);
    attempts += 1;
    if (attempts > 500 || balls.every(ball => Math.hypot(ball.x - x, ball.y - y) >= radius * 2.6)) {
      const angle = random() * Math.PI * 2;
      balls.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
    }
  }
  return balls;
}

/** Moves the balls on for `seconds`; each one bounces on the walls. */
export function stepBalls(balls, seconds, { width, height, radius }) {
  for (const ball of balls) {
    ball.x += ball.vx * seconds;
    ball.y += ball.vy * seconds;
    if (ball.x < radius || ball.x > width - radius) {
      ball.x = Math.min(Math.max(ball.x, radius), width - radius);
      ball.vx = -ball.vx;
    }
    if (ball.y < radius || ball.y > height - radius) {
      ball.y = Math.min(Math.max(ball.y, radius), height - radius);
      ball.vy = -ball.vy;
    }
  }
}

// ---- friend or foe: hit the enemies, leave the allies alone -----------------------------------------
export const DISCERN_TRIALS = 30;
export const DISCERN_SHOWN = 1000;
export const DISCERN_ALLY = 250;

/** The trials of a run: mostly enemies, never more than three allies in a row, a pause before each. */
export function discernTrials(count, random = Math.random) {
  const trials = [];
  let allies = 0;
  for (let index = 0; index < count; index += 1) {
    const ally = allies < 3 && random() < 0.3;
    allies = ally ? allies + 1 : 0;
    trials.push({ kind: ally ? "ally" : "enemy", wait: 500 + pick(600, random) });
  }
  return trials;
}

/**
 * The score: the average time to hit an enemy (a missed one counts for the whole time it was shown),
 * plus 250 ms for each ally that was hit. `results` are `{ kind, hit, time }`.
 */
export function discernScore(results) {
  const enemies = results.filter(result => result.kind === "enemy");
  if (!enemies.length) {
    return 0;
  }
  const times = enemies.map(result => (result.hit ? result.time : DISCERN_SHOWN));
  const mistakes = results.filter(result => result.kind === "ally" && result.hit).length;
  return average(times) + mistakes * DISCERN_ALLY;
}

// ---- last hit: strike at the moment the bar goes under the notch --------------------------------------
export const LASTHIT_TRIALS = 10;
export const LASTHIT_CAP = 600;

/** One minion: how long its bar takes to empty, and where the notch is (how much of the bar is left). */
export function lastHitTrial(random = Math.random) {
  const duration = 1400 + pick(1200, random);
  const threshold = 0.2 + random() * 0.2;
  return { duration, threshold, crossAt: Math.round(duration * (1 - threshold)) };
}

/** How far from the moment the bar crosses the notch the strike was, in ms (negative: too early). */
export const timingOffset = (pressedAt, trial) =>
  Math.max(-LASTHIT_CAP, Math.min(LASTHIT_CAP, Math.round(pressedAt - trial.crossAt)));

/** The score: how far off the strikes were, on average, whatever the side. */
export const lastHitScore = offsets => average(offsets.map(Math.abs));

// ---- skill keys: press the skills in the order shown ---------------------------------------------------
export const INPUT_PROMPTS = 15;
export const INPUT_LENGTH = 4;
export const INPUT_KEYS = 4;
export const INPUT_WRONG = 300;

/**
 * A prompt: four skill keys (1 to 4) to press in order, never the same key twice in a row. Each key
 * after the first is drawn among the three others, so it ends whatever the generator gives.
 */
export function inputPrompt(random = Math.random) {
  const keys = [1 + pick(INPUT_KEYS, random)];
  while (keys.length < INPUT_LENGTH) {
    const roll = 1 + pick(INPUT_KEYS - 1, random);
    keys.push(roll >= keys.at(-1) ? roll + 1 : roll);
  }
  return keys;
}
