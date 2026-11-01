// The skills of the player's hero, shown in an arc around the attack as in the game: the AI casts them, the arc shows
// how long each one has left to recharge (a dark sweep and the seconds) and flashes when the AI casts it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";

installFakeDom({ pathname: "/simulation" });
const { arcSpots, coolState } = await import("./simulation-skills.js");

test("a skill ready shows no sweep and no seconds", () => {
  assert.deepEqual(coolState(null, 0), { left: 0, full: 0, share: 0, label: "" });
});

test("a skill that just went down remembers its whole cooldown, and the sweep shrinks with it", () => {
  const first = coolState(null, 8);
  assert.deepEqual(first, { left: 8, full: 8, share: 1, label: "8" });
  const later = coolState(first, 2.4);
  assert.equal(later.full, 8);
  assert.equal(later.share, 0.3);
  assert.equal(later.label, "3", "the seconds left, rounded up");
});

test("a cooldown that grows again (a new cast) starts a new sweep", () => {
  const state = coolState(coolState(null, 8), 1);
  assert.equal(coolState(state, 6).full, 6);
});

test("the last second shows its tenths", () => {
  assert.equal(coolState(null, 0.7).label, "0.7");
});

test("the skills sit on an arc left of and above the attack: the first on its left, the ultimate above it", () => {
  const three = arcSpots(3);
  assert.equal(three.length, 3);
  assert.ok(three[0].x < -100 && Math.abs(three[0].y) < 1, "first on the left");
  assert.ok(Math.abs(three[2].x) < 1 && three[2].y > 100, "last straight above");
  const four = arcSpots(4);
  for (let i = 1; i < four.length; i += 1) {
    const gap = Math.hypot(four[i].x - four[i - 1].x, four[i].y - four[i - 1].y);
    assert.ok(gap >= 58, `the buttons do not overlap (${gap.toFixed(0)} px)`);
  }
});
