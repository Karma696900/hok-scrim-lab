// The Game Simulation page: the set-up screen a visitor sees first, the route that indexes it, the map
// turned for the red side, the decision box that never says which choice is good, and the grade alone.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";
import { matchRoute } from "../../../shared/routes.js";
import { ROUTES } from "../../../shared/routes-table.js";

installFakeDom({ pathname: "/simulation" });
const { pageHtml } = await import("./simulation-setup.js");
const { mapSvg, placeOnBoard } = await import("./simulation-map.js");
const { decisionHtml, gradeHtml } = await import("./simulation-popups.js");
const { addressHooks, clock } = await import("./simulation-shared.js");

const heroes = [
  { id: "105", name: "Lian Po", lanes: ["Clash Lane"], image: "" },
  { id: "131", name: "Li Bai", lanes: ["Jungle"], image: "" }
];
const setup = extra => ({
  heroes,
  signedIn: false,
  side: "blue",
  lane: "Jungle",
  difficulty: "normal",
  handPicked: false,
  fixed: {},
  pool: null,
  history: null,
  starting: false,
  problem: "",
  ...extra
});

describe("the set-up screen", () => {
  test("a title, an introduction and every choice of the game", () => {
    const html = pageHtml(setup());
    assert.match(html, /<h1>Game Simulation<\/h1>/);
    assert.match(html, /Play a whole Honor of Kings match as one hero/);
    for (const act of ["side", "lane", "difficulty", "heroes"]) {
      assert.match(html, new RegExp(`data-act="${act}"`), act);
    }
    assert.equal(html.match(/data-act="lane"/g).length, 5, "the five roles");
    assert.equal(html.match(/data-act="difficulty"/g).length, 3, "easy, normal, hard");
    assert.match(html, /data-act="start"/);
    assert.match(html, /Sign in to keep your games/);
    assert.doesNotMatch(html, /style=/, "no style attribute (content policy)");
  });

  test("heroes chosen by hand: ten slots, the player's marked, a slot left on Random is drawn", () => {
    const html = pageHtml(setup({ handPicked: true, pool: ["105", "131"] }));
    assert.equal(html.match(/data-slot="/g).length, 10);
    assert.match(html, /sim-slot is-mine/);
    assert.match(html, /<option value="131">Li Bai<\/option>/);
    assert.doesNotMatch(
      html.match(/data-slot="blue:Clash Lane">[\s\S]*?<\/select>/)[0],
      /Li Bai/,
      "a slot lists the heroes of its lane only"
    );
  });

  test("a signed-in player sees his last games with grade, difficulty and hero", () => {
    const history = [
      {
        heroId: "131",
        side: "red",
        lane: "Jungle",
        difficulty: "hard",
        grade: "SS",
        playedAt: Date.UTC(2026, 9, 31, 20)
      }
    ];
    const html = pageHtml(setup({ signedIn: true, history }));
    assert.match(html, /Li Bai/);
    assert.match(html, /sim-grade--ss">SS</);
    assert.match(html, /Hard/);
  });
});

describe("the route", () => {
  test("/simulation is its own indexable page whose title names HOK and Honor of Kings", () => {
    assert.equal(matchRoute("/simulation").view, "simulation");
    const route = ROUTES.find(entry => entry.view === "simulation");
    assert.equal(route.index, true);
    assert.match(route.title, /HOK/);
    assert.match(route.title, /Honor of Kings/);
  });
});

describe("the board", () => {
  // a small map of the same shape as the one the bots server sends (its real map is in the private repository)
  const map = {
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
        [270, 754],
        [270, 270],
        [754, 270]
      ]
    },
    river: [
      [
        [400, 600],
        [600, 400],
        [620, 420],
        [420, 620]
      ]
    ],
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
    towers: [{ id: "blue-mid-1", side: "blue", at: [420, 600] }],
    camps: [{ id: "blue-red-buff", kind: "red-buff", at: [380, 640] }],
    neutral: [{ id: "tyrant", kind: "tyrant", at: [480, 560] }]
  };

  test("the red side sees the map turned half a turn, its base at the bottom", () => {
    assert.doesNotMatch(mapSvg(map, "blue"), /rotate\(180/);
    assert.match(mapSvg(map, "red"), /class="sim-world" transform="rotate\(180 512 512\)"/);
    const [, blueY] = placeOnBoard(map.bases.blue.fountain, "blue");
    const [, redY] = placeOnBoard(map.bases.red.fountain, "red");
    assert.ok(blueY > 50 && redY > 50, "each side's own fountain is in the lower half");
  });

  test("the board is framed on the field (with its walls and fountains), not on the whole picture", () => {
    assert.match(mapSvg(map, "blue"), /viewBox="150 150 724 724"/);
    assert.deepEqual(placeOnBoard([150, 150], "blue"), [0, 0]);
    assert.deepEqual(placeOnBoard([874, 874], "blue"), [100, 100]);
    assert.deepEqual(placeOnBoard([150, 150], "red"), [100, 100]);
    for (const side of ["blue", "red"]) {
      for (const point of [...map.bounds, map.bases.blue.fountain, map.bases.red.fountain]) {
        assert.ok(placeOnBoard(point, side).every(share => share >= 0 && share <= 100));
      }
    }
  });

  test("with the picture of the map, the board shows it and keeps the vector for the bots alone", () => {
    const drawn = mapSvg(map, "red", { image: "/training-maps/abc" });
    // inside the world, so that it turns with it for the red side
    assert.match(
      drawn,
      /<g class="sim-world"[^>]*>\s*<image class="sim-picture" href="\/training-maps\/abc" x="0" y="0" width="1024" height="1024"/
    );
    assert.doesNotMatch(drawn, /sim-wall|sim-bush|sim-river|sim-ground|sim-lane/);
    // towers, camps and the fog still change during the game
    assert.match(drawn, /data-tower=/);
    assert.match(drawn, /class="sim-fog"/);
    // ?debug=map: the vector drawn over the picture, as outlines
    const debug = mapSvg(map, "blue", { image: "/training-maps/abc", debug: true });
    assert.match(debug, /<polygon class="sim-wall sim-debug"/);
    assert.match(debug, /<polygon class="sim-bush sim-debug"/);
    // no picture: the vector is the board, as before
    assert.match(mapSvg(map, "blue"), /<polygon class="sim-wall" /);
    assert.doesNotMatch(mapSvg(map, "blue"), /<image/);
  });

  test("the decision box lists four choices and stay, and never which are good", () => {
    const option = (id, label, params = {}) => ({ id, label, params });
    const html = decisionHtml(
      {
        options: [
          option("a", "Go to the {lane}", { lane: "Mid lane" }),
          option("b", "Join {hero}", { hero: "105" }),
          option("c", "Fall back to your tower"),
          option("d", "Go back to base")
        ],
        stay: option("stay", "Stay where I am"),
        waiting: false
      },
      heroes
    );
    assert.equal(html.match(/data-sim="choose"/g).length, 5);
    assert.match(html, /Go to the Mid lane/);
    assert.match(html, /Join Lian Po/);
    assert.doesNotMatch(html, /good|wrong|correct/i);
  });

  test("the end shows the macro grade alone, and the pause when there was one", () => {
    const html = gradeHtml({ letter: "A", score: 84, paused: false }, { signedIn: false });
    assert.match(html, /Macro grade: <b class="sim-grade sim-grade--a">A<\/b>/);
    assert.doesNotMatch(html, /84/, "no score, no detail");
    assert.doesNotMatch(html, /paused/);
    assert.match(gradeHtml({ letter: "S", paused: true }, { signedIn: true }), /was paused/);
  });

  test("the test hooks of the address are bounded, and the clock reads mm:ss", () => {
    assert.deepEqual(addressHooks("?limit=5"), { limit: 60, debug: false });
    assert.deepEqual(addressHooks(""), { limit: 3600, debug: false });
    assert.equal(addressHooks("?debug=map").debug, true);
    assert.equal(clock(125.4), "02:05");
  });
});
