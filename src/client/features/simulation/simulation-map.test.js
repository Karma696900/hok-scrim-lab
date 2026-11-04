// The minimap's touch points back to the map: holding the minimap moves the camera to the point under the finger.
import assert from "node:assert/strict";
import { test } from "node:test";
import { eyesMarkup, mapPointOf, mapSvg, placeOnBoard } from "./simulation-map.js";

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

const RELIEF = {
  ...MAP,
  walls: [
    [
      [300, 500],
      [340, 500],
      [340, 540]
    ]
  ],
  bushes: [
    [
      [500, 300],
      [540, 300],
      [540, 340]
    ]
  ],
  camps: [{ id: "blue-camp-1", kind: "camp", at: [440, 700] }],
  neutral: [{ id: "tyrant", kind: "tyrant", at: [480, 560] }]
};

test("the field's fog is a sheet of its own over the ground, so the ground is not painted again as the eyes move", () => {
  const html = mapSvg(RELIEF, "blue", { marks: false });
  const ground = html.match(/<svg class="sim-map__svg"[\s\S]*?<\/svg>/)[0];
  const fog = html.match(/<svg class="sim-map__fog"[\s\S]*?<\/svg>/)[0];
  assert.doesNotMatch(ground, /sim-eyes|sim-fog/);
  assert.match(fog, /class="sim-eyes"/);
  assert.match(fog, /class="sim-fog"/);
  // the minimap keeps one sheet, flat colours, its own eyes
  const mini = mapSvg(RELIEF, "blue", { mini: true });
  assert.equal(mini.match(/<svg/g).length, 1);
  assert.match(mini, /class="sim-mini-eyes"/);
  assert.doesNotMatch(mini, /url\(#sim-t-/);
});

test("a wall stands on its true outline: its foot is where the bots stop, its top rises up the screen", () => {
  const lift = side =>
    Number(
      mapSvg(RELIEF, side, { marks: false }).match(
        /class="sim-wall" transform="translate\(0 (-?[\d.]+)\)"/
      )[1]
    );
  // the red side sees the map turned half a turn: its "up the screen" is down the map
  assert.ok(lift("blue") < 0);
  assert.ok(lift("red") > 0);
  const svg = mapSvg(RELIEF, "blue", { marks: false });
  // the foot is the wall's own outline, not moved onto the open ground
  assert.match(svg, /class="sim-wall-face" points="300,500 340,500 340,540"/);
  assert.doesNotMatch(svg, /class="sim-wall-face" transform/);
  // the game's walls are pale rocks with moss on top, not trees
  assert.match(svg, /class="sim-wall" [^>]*fill="url\(#sim-t-rock\)"/);
  assert.match(svg, /id="sim-t-rock"/);
  assert.doesNotMatch(svg, /sim-t-canopy/);
  // the treetops ride on the raised top
  assert.match(svg, /<g transform="translate\(0 -[\d.]+\)"><path class="sim-crowns"/);
  // and nothing of the wall is painted past its true outline: the lifted top is cut to it
  assert.match(
    svg,
    /<clipPath id="sim-t-walls"><polygon points="300,500 340,500 340,540"><\/polygon><\/clipPath>/
  );
  const cut = svg.indexOf('<g class="sim-walls" clip-path="url(#sim-t-walls)">');
  assert.ok(
    cut >= 0 && cut < svg.indexOf('class="sim-wall"') && cut < svg.indexOf('class="sim-crowns"')
  );
});

test("a bush is tall grass you walk into: flat on the ground, no face, no shadow, blades inside", () => {
  const svg = mapSvg(RELIEF, "blue", { marks: false });
  assert.match(svg, /class="sim-bush" points="500,300 540,300 540,340"/);
  assert.doesNotMatch(svg, /sim-bush-face|sim-bush-shadow|sim-bush-sides/);
  assert.match(svg, /class="sim-tufts"/);
});

test("the river is shallow, as in the game: its bed shows through the water", () => {
  const svg = mapSvg(RELIEF, "blue", { marks: false });
  assert.match(svg, /id="sim-t-bed"/);
  assert.match(svg, /class="sim-river-bed" [^>]*fill="url\(#sim-t-bed\)"/);
  assert.match(svg, /class="sim-river" [^>]*fill-opacity="0\.\d+"/);
});

test("the ground has its matter: grass, paved lanes, water, the objectives' pits and the camps' clearings", () => {
  const svg = mapSvg(RELIEF, "blue", { marks: false });
  for (const id of ["sim-t-grass", "sim-t-stone", "sim-t-forest", "sim-t-ripple"]) {
    assert.match(svg, new RegExp(`id="${id}"`), id);
  }
  assert.match(svg, /class="sim-pit" [^>]*cx="480" cy="560"/);
  assert.match(svg, /class="sim-clearing" [^>]*cx="440" cy="700"/);
  // over a picture of the map, none of it
  assert.doesNotMatch(
    mapSvg(RELIEF, "blue", { image: "/m.png" }),
    /sim-t-grass|sim-pit|sim-wall-face/
  );
});

test("the finish of the field: rocky cliffs, treetops and tufts over the edges, curbs, foam, glints, the fountains' glow", () => {
  const svg = mapSvg(RELIEF, "blue", { marks: false });
  assert.match(svg, /class="sim-wall-sides" [^>]*fill="url\(#sim-t-cliff\)"/);
  for (const id of [
    "sim-t-cliff",
    "sim-t-glint",
    "sim-t-tufts",
    "sim-t-verge",
    "sim-t-patches",
    "sim-t-fountain-blue"
  ]) {
    assert.match(svg, new RegExp(`id="${id}"`), id);
  }
  assert.equal((svg.match(/class="sim-crowns"/g) ?? []).length, 1, "all the treetops in one path");
  assert.equal((svg.match(/class="sim-tufts"/g) ?? []).length, 1, "all the tufts in one path");
  assert.ok(
    svg.indexOf('class="sim-tufts"') > svg.lastIndexOf('class="sim-bush"'),
    "the tufts over the bushes"
  );
  // the crowns sit over the wall's top, so their round edge breaks its outline
  assert.ok(svg.lastIndexOf('class="sim-crowns"') > svg.indexOf('class="sim-wall"'));
  assert.match(svg, /class="sim-lane-curb"/);
  assert.ok(
    svg.indexOf("sim-lane-curb") < svg.indexOf('class="sim-lane"'),
    "the paving covers the curbs' middle"
  );
  assert.match(svg, /class="sim-foam"/);
  assert.match(svg, /class="sim-fountain" [^>]*fill="url\(#sim-t-fountain-blue\)"/);
});

// the relative lightness of a #rrggbb colour (0 black .. 1 white)
const lightness = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test("as in the game: light grass, a low stone wall round the field, the blue-flowered woods beyond", () => {
  const svg = mapSvg(RELIEF, "blue", { marks: false });
  const grass = svg.match(/<pattern id="sim-t-grass"[^>]*><rect [^>]*fill="(#[0-9a-f]{6})"/)[1];
  assert.ok(lightness(grass) > 0.4, `${grass} is a light green`);
  assert.match(svg, /class="sim-rim" points="160,160 864,160 864,864 160,864"/);
  // the wall stands outside the field: drawn first, the ground covers its inner half
  assert.ok(svg.indexOf('class="sim-rim"') < svg.indexOf('class="sim-ground"'));
  assert.match(
    svg.match(/<pattern id="sim-t-forest"[\s\S]*?<\/pattern>/)[0],
    /class="sim-t-bloom"/
  );
});

test("each base is a wide paved place in its corner of the field, cut to the field", () => {
  const svg = mapSvg(RELIEF, "blue", { marks: false });
  assert.match(
    svg,
    /<clipPath id="sim-t-field"><polygon points="160,160 864,160 864,864 160,864">/
  );
  const plazas = [
    ...svg.matchAll(/class="sim-plaza" [^>]*r="(\d+)"[^>]*clip-path="url\(#sim-t-field\)"/g)
  ];
  assert.equal(plazas.length, 2);
  for (const [, r] of plazas) {
    assert.ok(Number(r) >= 120, `${r} wide`);
  }
});

test("the lanes are wide pale flagstones, not narrow cobbled paths", () => {
  const svg = mapSvg(RELIEF, "blue", { marks: false });
  const width = Number(svg.match(/class="sim-lane" [^>]*stroke-width="(\d+)"/)[1]);
  assert.ok(width >= 40, `${width} wide`);
  const stone = svg.match(/<pattern id="sim-t-stone"[^>]*><rect [^>]*fill="(#[0-9a-f]{6})"/)[1];
  assert.ok(lightness(stone) > 0.6, `${stone} pale`);
});

test("the river is a bright turquoise between rocky banks", () => {
  const svg = mapSvg(RELIEF, "blue", { marks: false });
  assert.match(
    svg,
    /class="sim-river-rocks" [^>]*stroke-dasharray="[^"]+"[^>]*stroke-linecap="round"/
  );
  const water = svg.match(/class="sim-river" [^>]*fill="(#[0-9a-f]{6})"/)[1];
  assert.ok(lightness(water) > 0.4, `${water} bright`);
});

test("the buffs' camps and the great monsters' pits stand on stone platforms", () => {
  const svg = mapSvg(RELIEF, "blue", { marks: false });
  assert.match(svg, /class="sim-clearing" [^>]*fill="url\(#sim-t-platform\)"/);
  assert.match(
    svg,
    /class="sim-platform" [^>]*cx="480" cy="560"[^>]*fill="url\(#sim-t-platform\)"/
  );
  assert.ok(
    svg.indexOf('class="sim-platform"') < svg.indexOf('class="sim-pit"'),
    "the pit sunk into its platform"
  );
});

test("the eyes cut the fog with soft edges", () => {
  assert.match(
    eyesMarkup([{ at: [10.4, 20.6], radius: 95 }]),
    /<circle cx="10" cy="21" r="95" fill="url\(#sim-eye\)">/
  );
  assert.match(mapSvg(RELIEF, "blue", { marks: false }), /<radialGradient id="sim-eye"/);
});
