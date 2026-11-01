// The joystick floats as in the game: a finger put anywhere in the bottom-left zone brings the ring under it (kept
// whole on the screen), and the ring goes back to its place when the finger lets go.
import assert from "node:assert/strict";
import { test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";

installFakeDom({ pathname: "/simulation" });
const { floatShift } = await import("./simulation-controls.js");

const screen = { width: 844, height: 390 };

test("a finger away from the ring brings the ring's centre under it", () => {
  assert.deepEqual(
    floatShift({ rest: [118, 308], finger: [200, 250], radius: 70, ...screen }),
    [82, -58]
  );
});

test("a finger on the ring's centre does not move it", () => {
  assert.deepEqual(
    floatShift({ rest: [118, 308], finger: [118, 308], radius: 70, ...screen }),
    [0, 0]
  );
});

test("near an edge, the ring stays whole on the screen", () => {
  assert.deepEqual(
    floatShift({ rest: [118, 308], finger: [10, 385], radius: 70, ...screen }),
    [-48, 12]
  );
});

test("the zone of the floating stick is in the controls' markup", async () => {
  const { controlsHtml } = await import("./simulation-controls.js");
  assert.match(
    controlsHtml(),
    /<div class="sim-stick-zone" data-stick-zone><div class="sim-stick" data-stick/
  );
});
