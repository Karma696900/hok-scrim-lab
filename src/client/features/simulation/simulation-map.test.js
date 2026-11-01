// The minimap's touch points back to the map: holding the minimap moves the camera to the point under the finger.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mapPointOf, placeOnBoard } from "./simulation-map.js";

const near = (actual, expected) =>
  assert.ok(
    Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < 1e-9,
    `${actual} ≠ ${expected}`
  );

test("a point of the minimap is the map point drawn there, on both sides", () => {
  for (const side of ["blue", "red"]) {
    for (const point of [
      [200, 300],
      [512, 512],
      [860, 170]
    ]) {
      near(mapPointOf(placeOnBoard(point, side), side), point);
    }
  }
});

test("the top left corner of the minimap is the corner of the field, turned for the red side", () => {
  near(mapPointOf([0, 0], "blue"), [150, 150]);
  near(mapPointOf([0, 0], "red"), [874, 874]);
});

test("a finger slid out of the minimap stays on the edge of the field", () => {
  near(mapPointOf([-20, 130], "blue"), [150, 874]);
});
