// The minimap's touch points back to the map: holding the minimap moves the camera to the point under the finger.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mapPointOf, mapSvg, placeOnBoard } from "./simulation-map.js";

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

const MAP = {
  bounds: [
    [160, 160],
    [864, 160],
    [864, 864],
    [160, 864]
  ],
  bases: {
    blue: { fountain: [210, 814], crystal: [270, 754] },
    red: { fountain: [814, 210], crystal: [754, 270] }
  },
  lanes: {
    top: [
      [225, 705],
      [262, 205]
    ],
    mid: [
      [270, 754],
      [754, 270]
    ]
  },
  river: [
    [
      [300, 300],
      [400, 300],
      [400, 400]
    ]
  ],
  walls: [],
  bushes: [],
  towers: [],
  camps: [],
  neutral: []
};

test("each lane is a stone path with its darker edge drawn under it, the river with its bank", () => {
  const svg = mapSvg(MAP, "blue", { marks: false });
  const edges = [...svg.matchAll(/class="sim-lane-edge"/g)].length;
  assert.equal(edges, 2);
  // every edge comes before the first path, so the paths cover them
  assert.ok(svg.lastIndexOf("sim-lane-edge") < svg.indexOf('class="sim-lane"'));
  assert.match(svg, /class="sim-river-bank"/);
  // drawn over a picture with ?debug=map, the vector stays outlines only
  assert.doesNotMatch(
    mapSvg(MAP, "blue", { image: "/m.png", debug: true }),
    /sim-lane-edge|sim-river-bank/
  );
});
