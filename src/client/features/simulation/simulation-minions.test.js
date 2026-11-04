// The minions of a wave, one dot each, in a column on their lane behind the front one.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MINION_GAP, minionSize, minionSpots } from "./simulation-minions.js";

// a lane bent once, from the blue end (0, 0) to the red end (200, 100)
const LANE = [
  [0, 0],
  [100, 0],
  [200, 100]
];
const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// how far a point is from the lane's polyline
function offLane(point) {
  let best = Infinity;
  for (let i = 1; i < LANE.length; i += 1) {
    const [a, b] = [LANE[i - 1], LANE[i]];
    const span = gap(a, b);
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / span ** 2
      )
    );
    best = Math.min(best, gap(point, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]));
  }
  return best;
}

test("the front minion stands at the wave's point, the others behind it towards their own base", () => {
  const blue = minionSpots(LANE, [80, 0], "blue", 3);
  assert.deepEqual(blue[0], [80, 0]);
  assert.ok(blue[1][0] < 80 && blue[2][0] < blue[1][0], JSON.stringify(blue));
  const red = minionSpots(LANE, [80, 0], "red", 3);
  assert.ok(red[1][0] > 80 && red[2][0] > 80, JSON.stringify(red));
});

test("the minions keep about a gap apart and stay on their lane, round its bend too", () => {
  const spots = minionSpots(LANE, [104, 4], "red", 4);
  for (let i = 1; i < spots.length; i += 1) {
    assert.ok(Math.abs(gap(spots[i], spots[i - 1]) - MINION_GAP) < MINION_GAP * 0.6, `${i}`);
    assert.ok(offLane(spots[i]) < MINION_GAP / 2, `${spots[i]} is off the lane`);
  }
});

test("a wave at the very end of its lane keeps its minions on the lane", () => {
  const spots = minionSpots(LANE, [0, 0], "blue", 3);
  assert.equal(spots.length, 3);
  for (const spot of spots) {
    assert.ok(offLane(spot) < MINION_GAP / 2 && spot.every(Number.isFinite), `${spot}`);
  }
});

test("the siege and super minions are a little larger, the dragons of the Overlord and the Tempest larger still", () => {
  assert.deepEqual(
    [
      "melee",
      "ranged",
      "ballista",
      "cannon",
      "super",
      "vanguard",
      "tempest-vanguard",
      "shadow-vanguard"
    ].map(minionSize),
    ["", "", "siege", "siege", "siege", "dragon", "dragon", "shadow"]
  );
});
