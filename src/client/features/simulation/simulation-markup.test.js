// The Game Simulation page: the set-up screen a visitor sees first, the route that indexes it, the map
// turned for the red side, the joystick and the attack buttons of a game played by hand, and the grade alone.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";
import { matchRoute } from "../../../shared/routes.js";
import { ROUTES } from "../../../shared/routes-table.js";

installFakeDom({ pathname: "/simulation" });
const { pageHtml } = await import("./simulation-setup.js");
const { mapSvg, placeOnBoard } = await import("./simulation-map.js");
const { gradeHtml } = await import("./simulation-popups.js");
const { avatarsHtml, controlsHtml } = await import("./simulation-controls.js");
const { addressHooks, clock } = await import("./simulation-shared.js");
const { boardHtml } = await import("./simulation-board.js");
const { pauseHtml } = await import("./simulation-popups.js");

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

  test("the camera height, as in the game: close, normal or high, the player's choice pressed", () => {
    const html = pageHtml(setup({ camera: "close" }));
    assert.equal(html.match(/data-act="camera"/g).length, 3);
    assert.match(html, /Camera height/);
    assert.match(html, /data-act="camera" data-value="close" aria-pressed="true"/);
    assert.doesNotMatch(
      pageHtml(setup({ mode: "watch" })),
      /data-act="camera"/,
      "a watched game has its own view"
    );
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

  test("the hands of a game: a joystick, the attack, the minions and the towers, no decision box", () => {
    const html = controlsHtml();
    assert.match(html, /class="sim-stick" data-stick/);
    assert.match(html, /class="sim-stick__knob"/);
    for (const kind of ["auto", "minion", "tower"]) {
      assert.match(html, new RegExp(`data-sim="aim" data-kind="${kind}"`), kind);
    }
    assert.match(html, /aria-label="Attack \(Space\)"/);
    assert.doesNotMatch(html, /sim-decision|data-sim="choose"/);
    assert.doesNotMatch(html, /style="/, "no style attribute (content policy)");
  });

  test("each enemy in sight is a lock button, numbered, the locked one pressed", () => {
    const enemies = [
      { id: "red-1", heroId: "105" },
      { id: "red-2", heroId: "131" }
    ];
    const html = avatarsHtml(heroes, enemies, "red-2");
    assert.equal(html.match(/class="sim-avatar"/g).length, 2);
    assert.match(html, /data-kind="red-1" aria-pressed="false" aria-label="Target Lian Po \(1\)"/);
    assert.match(html, /data-kind="red-2" aria-pressed="true" aria-label="Target Li Bai \(2\)"/);
    assert.equal(avatarsHtml(heroes, [], null), "");
  });

  test("the end shows the macro grade alone, and the pause when there was one", () => {
    const html = gradeHtml({ letter: "A", score: 84, paused: false }, { signedIn: false });
    assert.match(html, /Macro grade: <b class="sim-grade sim-grade--a">A<\/b>/);
    assert.doesNotMatch(html, /84/, "no score, no detail");
    assert.doesNotMatch(html, /paused/);
    assert.match(gradeHtml({ letter: "S", paused: true }, { signedIn: true }), /was paused/);
  });

  test("the screen of the game: the minimap and the side's cards top left, the score top right, the skills shown but not pressed, no shop", () => {
    const at = [500, 500];
    const start = {
      map,
      me: {
        id: "blue-1",
        heroId: "105",
        side: "blue",
        lane: "Clash Lane",
        spell: "flash",
        skills: ["s1", "s2", "ult"],
        at
      },
      heroes: [
        { id: "blue-1", heroId: "105", side: "blue" },
        { id: "blue-2", heroId: "131", side: "blue" },
        { id: "red-1", heroId: "131", side: "red" }
      ],
      calls: [{ id: "regroup", label: "Regroup", icon: "users" }]
    };
    const html = boardHtml({ start, heroes });
    assert.match(html, /class="sim-game sim-game--play"/);
    assert.match(html, /<div class="sim-view">\s*<div class="sim-map sim-map--blue">/);
    assert.match(html, /class="sim-hud__left">\s*<div class="sim-mini"/);
    assert.equal(html.match(/class="sim-mini__svg"/g).length, 1, "one minimap");
    assert.match(
      html,
      /mask="url\(#sim-mini-fog\)"|id="sim-mini-fog"/,
      "the minimap has its own fog"
    );
    const cards = [...html.matchAll(/data-card="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(cards, ["blue-1", "blue-2"], "the player first, then the allies, no enemy");
    assert.match(html, /data-score="blue">0<\/b>.*data-score="red">0<\/b>/s);
    assert.match(html, /data-kda>0 \/ 0 \/ 0</);
    assert.match(html, /data-sim="scoreboard" aria-haspopup="dialog"/);
    assert.match(html, /class="sim-scores" role="dialog"[^>]*hidden/);
    assert.match(html, /data-farm="blue"/);
    assert.match(html, /data-sim="spell"[^>]*aria-label="Flash"/);
    assert.equal(html.match(/class="sim-call"/g).length, 1);
    // the AI casts the skills (owner, 2026-11-05): no skill buttons, no arc of skills on the screen
    assert.doesNotMatch(html, /sim-arc|data-skill=/, "no skills on the screen");
    assert.doesNotMatch(html, /sim-shop|data-sim="buy"/, "no shop");
    assert.doesNotMatch(html, /style="/, "no style attribute (content policy)");
    // the field's dots stand on a flat layer beside the tilted map; towers, crystals and camps are dots there too
    const field = html.match(/<div class="sim-view">[\s\S]*?<div class="sim-hud">/)?.[0] ?? "";
    const tilted = field.match(/<div class="sim-map[\s\S]*?<\/svg>/)?.[0] ?? "";
    assert.doesNotMatch(
      tilted,
      /data-tower=|data-camp=|data-crystal=/,
      "no structure drawn on the tilted map"
    );
    assert.match(field, /<\/div>\s*<div class="sim-dots">\s*<span class="sim-spot sim-spot--tower/);
    assert.match(
      field,
      /class="sim-spot sim-spot--crystal sim-spot--red sim-spot--piece" data-crystal="red"/
    );
    // the box of the locked enemy, top middle, empty and hidden until a hero is locked
    assert.match(html, /<div class="sim-target" data-target aria-live="polite" hidden><\/div>/);
    // the gold ring of the hero's attack reach lies on the ground: inside the tilted map, after the picture
    assert.match(
      field,
      /<\/svg>\s*<span class="sim-reach" data-reach aria-hidden="true"><\/span>\s*<\/div>/
    );
  });

  test("the pause box can resume or leave the game", () => {
    const html = pauseHtml();
    assert.match(html, /data-sim="resume"/);
    assert.match(html, /data-sim="leave"/);
  });

  test("the test hooks of the address are bounded, and the clock reads mm:ss", () => {
    assert.deepEqual(addressHooks("?limit=5"), { limit: 60, debug: false });
    assert.deepEqual(addressHooks(""), { limit: 3600, debug: false });
    assert.equal(addressHooks("?debug=map").debug, true);
    assert.equal(clock(125.4), "02:05");
  });
});
