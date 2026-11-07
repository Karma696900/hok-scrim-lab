// The live view of a roulette: it asks every 2 s with the version it has, paints only a newer one, rests while the
// tab is hidden and asks at once when it is shown again, and stops when the roulette is gone or the page is left.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { startLive } from "./casino-live.js";

// a clock whose timers run when the test says so
function fakeClock() {
  const timers = new Map();
  let next = 1;
  return {
    setTimeout: (run, ms) => {
      timers.set(next, { run, ms });
      return next++;
    },
    clearTimeout: id => timers.delete(id),
    pending: () => timers.size,
    async tick() {
      const [id, timer] = [...timers][0] ?? [];
      if (!timer) {
        return;
      }
      timers.delete(id);
      await timer.run();
    }
  };
}

function fakeDocument() {
  const listeners = [];
  return {
    hidden: false,
    addEventListener: (type, run) => listeners.push([type, run]),
    removeEventListener: (type, run) => {
      const at = listeners.findIndex(([t, r]) => t === type && r === run);
      if (at >= 0) {
        listeners.splice(at, 1);
      }
    },
    async show() {
      this.hidden = false;
      for (const [type, run] of [...listeners]) {
        if (type === "visibilitychange") {
          await run();
        }
      }
    },
    listening: () => listeners.length
  };
}

const roll = version => ({ id: "Ab3dE5gH9k", version, drawn: ["mid"] });

function setUp(answers) {
  const clock = fakeClock();
  const doc = fakeDocument();
  const asked = [];
  const painted = [];
  let version = 1;
  const stop = startLive({
    id: "Ab3dE5gH9k",
    version: () => version,
    fetchState: async since => {
      asked.push(since);
      return answers.shift() ?? { status: 304, body: null };
    },
    onState: state => {
      painted.push(state);
      version = state?.version ?? version;
    },
    every: 2000,
    doc,
    clock
  });
  return { clock, doc, asked, painted, stop };
}

describe("the live view", () => {
  test("it asks every 2 s with the version it has, and paints only a new version", async () => {
    const { clock, asked, painted } = setUp([
      { status: 304, body: null },
      { status: 200, body: roll(2) },
      { status: 304, body: null }
    ]);
    await clock.tick();
    await clock.tick();
    await clock.tick();
    assert.deepEqual(asked, [1, 1, 2]);
    assert.deepEqual(painted, [roll(2)]);
  });

  test("an answer that is not newer is not painted again", async () => {
    const { clock, painted } = setUp([{ status: 200, body: roll(1) }]);
    await clock.tick();
    assert.deepEqual(painted, []);
  });

  test("a hidden tab stops asking, and asks at once when shown again", async () => {
    const { clock, doc, asked, painted } = setUp([{ status: 200, body: roll(5) }]);
    doc.hidden = true;
    for (let i = 0; i < 10; i += 1) {
      await clock.tick();
    }
    assert.deepEqual(asked, []);
    await doc.show();
    assert.deepEqual(asked, [1]);
    assert.deepEqual(painted, [roll(5)]);
  });

  test("a roulette gone stops the polling and shows the missing page", async () => {
    const { clock, asked, painted } = setUp([{ status: 404, body: null }]);
    await clock.tick();
    assert.deepEqual(painted, [null]);
    assert.equal(clock.pending(), 0);
    await clock.tick();
    assert.equal(asked.length, 1);
  });

  test("a failed ask is tried again at the next beat", async () => {
    const { clock, asked } = setUp([
      { status: 500, body: null },
      { status: 304, body: null }
    ]);
    await clock.tick();
    await clock.tick();
    assert.equal(asked.length, 2);
  });

  test("stop ends it: no timer left, no listener left", async () => {
    const { clock, doc, stop } = setUp([]);
    stop();
    assert.equal(clock.pending(), 0);
    assert.equal(doc.listening(), 0);
  });
});
