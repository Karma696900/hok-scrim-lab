// The helper that waits for a pause in the typing (client/lib/debounce.js).
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import { debounce } from "./debounce.js";

describe("debounce", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  test("a burst of keystrokes runs the work once, with the last value, after the pause", () => {
    const seen = [];
    const typing = debounce(value => seen.push(value), 120);
    typing("b");
    mock.timers.tick(100);
    typing("bl");
    mock.timers.tick(100);
    typing("bla");
    mock.timers.tick(119);
    assert.deepEqual(seen, [], "still waiting: each keystroke restarts the wait");
    mock.timers.tick(1);
    assert.deepEqual(seen, ["bla"]);
    mock.timers.tick(1000);
    assert.deepEqual(seen, ["bla"], "and nothing more on its own");
  });

  test("typing again after the pause starts a new wait", () => {
    const seen = [];
    const typing = debounce(value => seen.push(value), 50);
    typing("a");
    mock.timers.tick(50);
    typing("ab");
    mock.timers.tick(50);
    assert.deepEqual(seen, ["a", "ab"]);
  });

  test("flush() does the pending work now (Enter, leaving the field) and only once", () => {
    const seen = [];
    const typing = debounce(value => seen.push(value), 120);
    typing.flush(); // nothing pending: nothing happens
    assert.deepEqual(seen, []);
    typing("blade");
    typing.flush();
    assert.deepEqual(seen, ["blade"]);
    mock.timers.tick(500);
    assert.deepEqual(seen, ["blade"], "the timer that was waiting is gone");
  });

  test("cancel() drops the pending work (the page was left)", () => {
    const seen = [];
    const typing = debounce(value => seen.push(value), 120);
    typing("x");
    typing.cancel();
    mock.timers.tick(500);
    assert.deepEqual(seen, []);
    typing("y");
    mock.timers.tick(120);
    assert.deepEqual(seen, ["y"], "and it still works afterwards");
  });
});
