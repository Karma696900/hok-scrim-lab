// The camera of a game played by hand, on a map tilted like the game's: the hero's dot is always in the middle of the
// screen (near the edges of the map too, as in the game), the map turns about that point, and the minimap's frame is
// centred on the hero.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ANCHOR, fieldPose } from "./simulation-camera.js";

const screen = { width: 844, height: 390, side: 2200 };
const same = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test("the camera looks at the middle of the screen", () => {
  assert.deepEqual(ANCHOR, [0.5, 0.5]);
});

test("the hero is drawn in the middle of the screen", () => {
  const pose = fieldPose({ ...screen, px: 1100, py: 900 });
  same(pose.x + 1100, screen.width / 2);
  same(pose.y + 900, screen.height / 2);
});

test("the map turns about the hero's point, so the hero does not move", () => {
  const pose = fieldPose({ ...screen, px: 1100, py: 900 });
  same(pose.x + pose.ox, screen.width / 2);
  same(pose.y + pose.oy, screen.height / 2);
  same(pose.ox, 1100);
  same(pose.oy, 900);
});

test("near a corner of the map the hero stays in the middle too", () => {
  const pose = fieldPose({ ...screen, px: 10, py: 2190 });
  same(pose.x + 10, screen.width / 2);
  same(pose.y + 2190, screen.height / 2);
});
