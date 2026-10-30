// The calculation behind the reflex exercises (boards, sequences, balls, scores), and the promise that
// the exercises themselves send nothing while they run.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  AIM_SIZE,
  CHIMP_COLUMNS,
  CHIMP_ROWS,
  DISCERN_ALLY,
  DISCERN_SHOWN,
  INPUT_KEYS,
  INPUT_LENGTH,
  LASTHIT_CAP,
  SEQUENCE_PADS,
  average,
  chimpBoard,
  discernScore,
  discernTrials,
  extendSequence,
  inputPrompt,
  lastHitScore,
  lastHitTrial,
  makeBalls,
  pickTargets,
  shuffled,
  stepBalls,
  targetSpot,
  timingOffset,
  trackingSpeed
} from "./logic.js";
import { filesUnder } from "../../../../testing/sources.js";

/** A small deterministic generator, so that a failure can be played again. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

describe("averages and shuffles", () => {
  test("an average is a whole number, and nothing gives zero", () => {
    assert.equal(average([240, 260, 251]), 250);
    assert.equal(average([]), 0);
    assert.equal(average([1, 2]), 2, "1.5 rounds up");
  });

  test("a shuffle keeps every item once, leaves the list alone, and can be played again", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const first = shuffled(items, seeded(7));
    assert.deepEqual([...first].sort(), items);
    assert.deepEqual(items, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(shuffled(items, seeded(7)), first, "same seed, same order");
    assert.notDeepEqual(shuffled(items, seeded(8)), first);
  });
});

describe("sequence memory", () => {
  test("each level adds one pad of the nine to what came before", () => {
    const random = seeded(3);
    let sequence = [];
    for (let level = 1; level <= 40; level += 1) {
      const longer = extendSequence(sequence, random);
      assert.equal(longer.length, level);
      assert.deepEqual(longer.slice(0, -1), sequence, "the start is the same");
      assert.ok(
        Number.isInteger(longer.at(-1)) && longer.at(-1) >= 0 && longer.at(-1) < SEQUENCE_PADS
      );
      sequence = longer;
    }
  });
});

describe("the chimp test", () => {
  test("the numbers sit on different cells of the board, in order from one", () => {
    for (const count of [4, 9, 20, CHIMP_COLUMNS * CHIMP_ROWS]) {
      const board = chimpBoard(count, seeded(count));
      assert.equal(board.length, count);
      assert.deepEqual(
        board.map(entry => entry.number),
        Array.from({ length: count }, (_, index) => index + 1)
      );
      const cells = board.map(entry => entry.cell);
      assert.equal(new Set(cells).size, count, "no two numbers on one cell");
      assert.ok(cells.every(cell => cell >= 0 && cell < CHIMP_COLUMNS * CHIMP_ROWS));
    }
  });
});

describe("aim", () => {
  const arena = { width: 600, height: 340 };
  test("a target always fits in the arena, and moves away from the last one", () => {
    const random = seeded(11);
    let last = null;
    for (let index = 0; index < 200; index += 1) {
      const spot = targetSpot(arena, AIM_SIZE, random, last);
      assert.ok(spot.x >= 0 && spot.x <= arena.width - AIM_SIZE);
      assert.ok(spot.y >= 0 && spot.y <= arena.height - AIM_SIZE);
      if (last) {
        assert.ok(Math.hypot(spot.x - last.x, spot.y - last.y) >= AIM_SIZE * 3 - 1);
      }
      last = spot;
    }
  });

  test("an arena smaller than the target still gives a spot", () => {
    assert.deepEqual(targetSpot({ width: 10, height: 10 }, AIM_SIZE, seeded(1)), { x: 0, y: 0 });
  });
});

describe("tracking", () => {
  const field = { width: 640, height: 380, radius: 16 };

  test("the balls start apart from each other, inside, at one speed", () => {
    const balls = makeBalls(10, field, 140, seeded(5));
    assert.equal(balls.length, 10);
    for (const ball of balls) {
      assert.ok(ball.x >= field.radius && ball.x <= field.width - field.radius);
      assert.ok(ball.y >= field.radius && ball.y <= field.height - field.radius);
      assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - 140) < 1e-9);
    }
    for (const [index, ball] of balls.entries()) {
      for (const other of balls.slice(index + 1)) {
        assert.ok(Math.hypot(ball.x - other.x, ball.y - other.y) >= field.radius * 2.6);
      }
    }
  });

  test("the balls bounce on the walls: they stay inside and keep their speed", () => {
    const balls = makeBalls(10, field, trackingSpeed(5), seeded(9));
    for (let step = 0; step < 6000; step += 1) {
      stepBalls(balls, 1 / 60, field);
      for (const ball of balls) {
        assert.ok(ball.x >= field.radius - 1e-6 && ball.x <= field.width - field.radius + 1e-6);
        assert.ok(ball.y >= field.radius - 1e-6 && ball.y <= field.height - field.radius + 1e-6);
      }
    }
    for (const ball of balls) {
      assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - trackingSpeed(5)) < 1e-6);
    }
  });

  test("a ball that reaches a wall turns back", () => {
    const [ball] = [{ x: 30, y: 100, vx: -100, vy: 0 }];
    stepBalls([ball], 0.5, field);
    assert.equal(ball.x, field.radius);
    assert.equal(ball.vx, 100);
  });

  test("more balls to follow, faster balls; targets are picked among the balls", () => {
    assert.ok(trackingSpeed(6) > trackingSpeed(3));
    const targets = pickTargets(10, 4, seeded(2));
    assert.equal(targets.size, 4);
    assert.ok([...targets].every(index => index >= 0 && index < 10));
  });
});

describe("friend or foe", () => {
  test("mostly enemies, never more than three allies in a row, a pause before each", () => {
    const trials = discernTrials(300, seeded(4));
    assert.equal(trials.length, 300);
    let run = 0;
    for (const trial of trials) {
      run = trial.kind === "ally" ? run + 1 : 0;
      assert.ok(run <= 3);
      assert.ok(trial.wait >= 500 && trial.wait < 1100);
    }
    const allies = trials.filter(trial => trial.kind === "ally").length;
    assert.ok(allies > 30 && allies < 130, `about three in ten are allies (${allies})`);
  });

  test("the score is the time to hit the enemies, a missed one costs the whole time it was shown", () => {
    const hit = time => ({ kind: "enemy", hit: true, time });
    assert.equal(discernScore([hit(300), hit(400)]), 350);
    assert.equal(
      discernScore([hit(300), { kind: "enemy", hit: false, time: 0 }]),
      Math.round((300 + DISCERN_SHOWN) / 2)
    );
    assert.equal(discernScore([]), 0);
    assert.equal(discernScore([{ kind: "ally", hit: false }]), 0, "no enemy, nothing to time");
  });

  test("an ally that is hit costs 250 ms each; one that is left alone costs nothing", () => {
    const base = [
      { kind: "enemy", hit: true, time: 300 },
      { kind: "ally", hit: false, time: 0 }
    ];
    assert.equal(discernScore(base), 300);
    assert.equal(
      discernScore([...base, { kind: "ally", hit: true, time: 200 }]),
      300 + DISCERN_ALLY
    );
    assert.equal(
      discernScore([...base, { kind: "ally", hit: true }, { kind: "ally", hit: true }]),
      300 + 2 * DISCERN_ALLY
    );
  });
});

describe("last hit", () => {
  test("a minion's bar empties in a second and a half or so, the notch is near the end", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const trial = lastHitTrial(seeded(seed));
      assert.ok(trial.duration >= 1400 && trial.duration < 2600);
      assert.ok(trial.threshold >= 0.2 && trial.threshold < 0.4);
      assert.equal(trial.crossAt, Math.round(trial.duration * (1 - trial.threshold)));
      assert.ok(trial.crossAt > 0 && trial.crossAt < trial.duration);
    }
  });

  test("the strike is early (negative), late (positive), never further than the cap", () => {
    const trial = { duration: 2000, threshold: 0.3, crossAt: 1400 };
    assert.equal(timingOffset(1400, trial), 0);
    assert.equal(timingOffset(1368, trial), -32);
    assert.equal(timingOffset(1413, trial), 13);
    assert.equal(timingOffset(0, trial), -LASTHIT_CAP);
    assert.equal(timingOffset(99_999, trial), LASTHIT_CAP);
  });

  test("the score is how far off the strikes were on average, whichever side", () => {
    assert.equal(lastHitScore([-30, 10, 20, -40]), 25);
    assert.equal(lastHitScore([]), 0);
  });
});

describe("skill keys", () => {
  test("four keys from one to four, never the same twice in a row", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const keys = inputPrompt(seeded(seed));
      assert.equal(keys.length, INPUT_LENGTH);
      assert.ok(keys.every(key => Number.isInteger(key) && key >= 1 && key <= INPUT_KEYS));
      assert.ok(keys.every((key, index) => index === 0 || key !== keys[index - 1]));
    }
  });
});

describe("a generator that does not vary", () => {
  test("nothing waits for a better draw: every function ends, and gives valid values", () => {
    for (const value of [0, 0.5, 0.999999]) {
      const constant = () => value;
      const keys = inputPrompt(constant);
      assert.equal(keys.length, INPUT_LENGTH);
      assert.ok(
        keys.every((key, index) => key >= 1 && key <= INPUT_KEYS && key !== keys[index - 1])
      );
      assert.equal(
        makeBalls(10, { width: 640, height: 380, radius: 16 }, 140, constant).length,
        10
      );
      assert.equal(chimpBoard(12, constant).length, 12);
      assert.equal(discernTrials(30, constant).length, 30);
      assert.ok(Number.isInteger(targetSpot({ width: 600, height: 340 }, AIM_SIZE, constant).x));
      assert.equal(extendSequence([], constant).length, 1);
      assert.ok(lastHitTrial(constant).crossAt > 0);
    }
  });

  test("the key after another is drawn among the three others, evenly", () => {
    for (let previous = 1; previous <= INPUT_KEYS; previous += 1) {
      const seen = new Set();
      for (const roll of [0, 0.34, 0.67, 0.99]) {
        let calls = 0;
        // the first draw gives `previous`, the next ones the roll
        const draws = () => (calls++ === 0 ? (previous - 1) / INPUT_KEYS : roll);
        const keys = inputPrompt(draws);
        assert.equal(keys[0], previous);
        seen.add(keys[1]);
      }
      assert.equal(seen.size, INPUT_KEYS - 1, `from ${previous}: the three other keys`);
      assert.ok(!seen.has(previous));
    }
  });
});

describe("while an exercise runs", () => {
  test("it sends nothing: no request, no beacon, no socket, in any file that plays one", () => {
    const files = filesUnder("src/client/features/training/reflex/exercises", /\.js$/).concat(
      "src/client/features/training/reflex/logic.js"
    );
    assert.ok(files.length >= 9, "the eight exercises and their calculation");
    const request =
      /\b(api|fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import)\s*\(|\bfrom\s+["'][^"']*(api|core\/api)[^"']*["']/;
    for (const file of files) {
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      assert.doesNotMatch(source, request, `${file} must not call the network`);
    }
  });
});
