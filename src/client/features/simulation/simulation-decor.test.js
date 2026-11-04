// The small things scattered on the field: the same at every game, never on a lane, in a wall or in a bush; the lily
// pads on the water only; the runes of each side round its fountain.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decorMarks, insidePolygon, laneGap } from "./simulation-decor.js";

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
    mid: [
      [270, 754],
      [754, 270]
    ]
  },
  river: [
    [
      [300, 300],
      [460, 300],
      [460, 420],
      [300, 420]
    ]
  ],
  walls: [
    [
      [560, 560],
      [700, 560],
      [700, 700],
      [560, 700]
    ]
  ],
  bushes: [
    [
      [200, 400],
      [260, 400],
      [260, 460],
      [200, 460]
    ]
  ],
  towers: [],
  camps: [],
  neutral: []
};

const placed = (svg, name) =>
  [...svg.matchAll(new RegExp(`class="${name}" data-at="([\\d.]+),([\\d.]+)"`, "g"))].map(match => [
    Number(match[1]),
    Number(match[2])
  ]);

test("the same scatter at every game", () => {
  assert.equal(decorMarks(MAP, "blue").ground, decorMarks(MAP, "blue").ground);
  assert.equal(decorMarks(MAP, "blue").standing, decorMarks(MAP, "blue").standing);
});

test("rocks, flowers and shrubs lie on the grass: never on a lane, in a wall, in a bush or in the water", () => {
  const { ground, standing } = decorMarks(MAP, "blue");
  const things = [
    ...placed(standing, "sim-rock"),
    ...placed(ground, "sim-flowers"),
    ...placed(standing, "sim-shrub")
  ];
  assert.ok(things.length > 20, `${things.length} things`);
  for (const point of things) {
    assert.ok(insidePolygon(point, MAP.bounds), `${point} in the field`);
    assert.ok(laneGap(point, MAP.lanes) > 16, `${point} off the lanes`);
    for (const shape of [...MAP.walls, ...MAP.bushes, ...MAP.river]) {
      assert.ok(!insidePolygon(point, shape), `${point} not in ${shape[0]}`);
    }
  }
});

test("the lily pads float on the river only", () => {
  const pads = placed(decorMarks(MAP, "blue").ground, "sim-lily");
  assert.ok(pads.length > 0);
  for (const point of pads) {
    assert.ok(insidePolygon(point, MAP.river[0]), `${point} on the water`);
  }
});

test("stone posts line the lanes, a little to the side", () => {
  const posts = placed(decorMarks(MAP, "blue").standing, "sim-post");
  assert.ok(posts.length >= 4);
  for (const point of posts) {
    const gap = laneGap(point, MAP.lanes);
    assert.ok(gap > 14 && gap < 30, `${point}: ${gap} from the lane`);
  }
});

test("each side's runes ring its fountain, in its colour", () => {
  const { ground } = decorMarks(MAP, "blue");
  assert.match(ground, /class="sim-runes sim-runes--blue" cx="210" cy="814"/);
  assert.match(ground, /class="sim-runes sim-runes--red" cx="814" cy="210"/);
});

test("the standing things cast their shadow down the screen: up the map for the red side", () => {
  const offset = side =>
    Number(decorMarks(MAP, side).standing.match(/class="sim-rock-shadow" [^>]*cy="([\d.]+)"/)[1]);
  const rock = side => placed(decorMarks(MAP, side).standing, "sim-rock")[0][1];
  assert.ok(offset("blue") > rock("blue"));
  assert.ok(offset("red") < rock("red"));
});
