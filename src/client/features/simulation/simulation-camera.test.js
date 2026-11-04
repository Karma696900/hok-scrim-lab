// The camera of a game played by hand, on a map tilted like the game's: the hero's dot is always in the middle of the
// screen (near the edges of the map too, as in the game), the map turns about that point, and the minimap's frame is
// centred on the hero.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ANCHOR, CAMERA_HEIGHTS, fieldPose, lens, readCamera } from "./simulation-camera.js";

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

test("three camera heights; at the normal one a screen shows about a fifth of the field across, as in the game", () => {
  assert.deepEqual(Object.keys(CAMERA_HEIGHTS), ["close", "normal", "high"]);
  assert.ok(
    CAMERA_HEIGHTS.close > CAMERA_HEIGHTS.normal && CAMERA_HEIGHTS.normal > CAMERA_HEIGHTS.high
  );
  // the field is CAMERA_HEIGHTS[height] screens wide and shows the board's 724 map pixels
  const across = 724 / CAMERA_HEIGHTS.normal;
  assert.ok(across > 150 && across < 190, `${across} map pixels across`);
});

test("the perspective follows the screen's height, and the pieces grow with the field", () => {
  const phone = lens({ height: 390, side: 844 * CAMERA_HEIGHTS.normal });
  const tablet = lens({ height: 800, side: 1280 * CAMERA_HEIGHTS.normal });
  same(phone.depth / 390, tablet.depth / 800);
  assert.ok(phone.depth > 390, "the eye is farther than a screen's height");
  assert.ok(phone.piece > 1.2 && phone.piece < 1.6, `phone ${phone.piece}`);
  assert.ok(tablet.piece > phone.piece);
  assert.ok(lens({ height: 390, side: 844 * CAMERA_HEIGHTS.high }).piece < phone.piece);
  assert.equal(lens({ height: 100, side: 10 }).piece, 0.8, "never smaller than this");
  assert.equal(lens({ height: 2000, side: 99999 }).piece, 3, "nor larger than this");
});

test("the camera height is read from the device, normal when none (or an unknown one) was kept", () => {
  const kept = value => ({ getItem: () => value });
  assert.equal(readCamera(kept("close")), "close");
  assert.equal(readCamera(kept(null)), "normal");
  assert.equal(readCamera(kept("sky")), "normal");
  assert.equal(
    readCamera({
      getItem: () => {
        throw new Error("blocked");
      }
    }),
    "normal"
  );
});
