// A watched game seen through one hero's eyes: the spectator taps a hero and gets the screen of a game by hand (the
// tilted field following that hero, its team's fog, the minimap, its team's cards, the score), with nothing to press
// but the speed and the way back to the whole map.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";

installFakeDom({ pathname: "/simulation" });
const { followBoardHtml } = await import("./simulation-follow.js");
const { watchBoardHtml } = await import("./simulation-watch.js");

const heroes = [
  { id: "105", name: "Lian Po", lanes: ["Clash Lane"], image: "" },
  { id: "131", name: "Li Bai", lanes: ["Jungle"], image: "" }
];
const map = {
  bounds: [
    [0, 0],
    [1024, 0],
    [1024, 1024]
  ],
  river: [],
  lanes: {},
  walls: [],
  bushes: [],
  bases: {
    blue: { crystal: [200, 800], fountain: [160, 860] },
    red: { crystal: [800, 200], fountain: [860, 160] }
  },
  towers: [{ id: "blue-mid-1", side: "blue", at: [420, 600] }],
  camps: [],
  neutral: []
};
const ROLES = ["clash", "jungle", "mid", "farm", "roam"];
const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
const start = {
  type: "start",
  mode: "watch",
  map,
  heroes: ["blue", "red"].flatMap(side =>
    ROLES.map((role, index) => ({
      id: `${side}-${role}`,
      heroId: index % 2 ? "131" : "105",
      side,
      role,
      lane: LANES[index],
      spell: "flash",
      reach: 120,
      speed: 380,
      sight: 300
    }))
  ),
  speeds: [0, 1, 2, 4, 8, 16],
  views: ["all", "blue", "red"],
  speed: 1,
  view: "all"
};

describe("watching through one hero's eyes", () => {
  test("each hero of the two teams is a button that follows it", () => {
    const html = watchBoardHtml({ start, heroes });
    assert.equal(html.match(/data-sim="follow" data-hero="/g).length, 10);
    assert.match(html, /data-sim="follow" data-hero="red-mid"/);
  });

  test("the hero's screen: the tilted field and its standing dots, the minimap, its team's cards, the score", () => {
    const html = followBoardHtml({ start, heroes, follow: "red-mid", speed: 4 });
    assert.match(html, /sim-game sim-game--play sim-game--follow/);
    assert.match(html, /<div class="sim-dots" data-stand>/);
    assert.match(html, /class="sim-mini"/);
    assert.match(html, /class="sim-map sim-map--red"/);
    // its own team, the hero first and marked as the one followed
    const cards = [...html.matchAll(/data-card="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(cards, ["red-mid", "red-clash", "red-jungle", "red-farm", "red-roam"]);
    assert.match(html, /class="sim-card is-me" data-card="red-mid"/);
    assert.match(html, /class="sim-clock"/);
    assert.match(html, /data-sim="scoreboard"/);
    assert.match(html, /data-reach/);
  });

  test("nothing to press but the speed and the way back to the whole map", () => {
    const html = followBoardHtml({ start, heroes, follow: "blue-jungle", speed: 4 });
    for (const speed of start.speeds) {
      assert.match(
        html,
        new RegExp(`data-sim="speed" data-value="${speed}" aria-pressed="${speed === 4}"`)
      );
    }
    assert.match(html, /data-sim="overview"/);
    assert.match(html, /data-sim="leave"/);
    for (const part of [
      "data-stick",
      "sim-strike",
      "sim-spell",
      "sim-call",
      "sim-tools",
      'data-sim="pause"'
    ]) {
      assert.doesNotMatch(html, new RegExp(part), part);
    }
  });

  test("an unknown hero gives no screen (the whole map stays)", () => {
    assert.equal(followBoardHtml({ start, heroes, follow: "nobody", speed: 1 }), null);
  });
});
