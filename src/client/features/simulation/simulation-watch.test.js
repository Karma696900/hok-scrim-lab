// The spectator mode of the Game Simulation: the set-up without side, role and difficulty, the board with the
// speed and view switches and the two teams, and the end box that names the winner without any grade.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";

installFakeDom({ pathname: "/simulation" });
const { pageHtml } = await import("./simulation-setup.js");
const { watchBoardHtml, watchEndHtml } = await import("./simulation-watch.js");

const heroes = [
  { id: "105", name: "Lian Po", lanes: ["Clash Lane"], image: "" },
  { id: "131", name: "Li Bai", lanes: ["Jungle"], image: "" }
];
const setup = extra => ({
  heroes,
  signedIn: false,
  mode: "play",
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
  towers: [],
  camps: [],
  neutral: []
};
const ROLES = ["clash", "jungle", "mid", "farm", "roam"];
const start = {
  type: "start",
  mode: "watch",
  map,
  heroes: ["blue", "red"].flatMap(side =>
    ROLES.map((role, index) => ({
      id: `${side}-${role}`,
      heroId: index % 2 ? "131" : "105",
      side,
      role
    }))
  ),
  speeds: [0, 1, 2, 4, 8, 16],
  views: ["all", "blue", "red"],
  speed: 1,
  view: "all"
};

describe("the spectator mode", () => {
  test("the set-up offers to play or to watch; watching needs no side, role or difficulty", () => {
    const playing = pageHtml(setup());
    assert.match(playing, /data-act="mode" data-value="play" aria-pressed="true"/);
    assert.match(playing, /data-act="side"/);
    const watching = pageHtml(setup({ mode: "watch", handPicked: true, pool: ["105"] }));
    assert.match(watching, /data-act="mode" data-value="watch" aria-pressed="true"/);
    for (const act of ["side", "lane", "difficulty"]) {
      assert.doesNotMatch(watching, new RegExp(`data-act="${act}"`), act);
    }
    assert.doesNotMatch(watching, /is-mine/);
    assert.match(watching, /data-act="heroes"/);
    assert.match(watching, /Watch the game/);
  });

  test("the board: a switch for each speed and each view, the ten heroes, nothing to play", () => {
    const html = watchBoardHtml({ start, heroes });
    for (const speed of start.speeds) {
      assert.match(
        html,
        new RegExp(`data-sim="speed" data-value="${speed}" aria-pressed="${speed === 1}"`)
      );
    }
    for (const view of start.views) {
      assert.match(
        html,
        new RegExp(`data-sim="view" data-value="${view}" aria-pressed="${view === "all"}"`)
      );
    }
    assert.equal(html.match(/data-hero="/g).length, 10);
    assert.match(html, /data-sim="leave"/);
    for (const part of [
      "sim-decision",
      "sim-call",
      "sim-spell",
      "sim-skill",
      "sim-stick",
      "sim-strike"
    ]) {
      assert.doesNotMatch(html, new RegExp(part), part);
    }
  });

  test("the end names the winner, the length and the kills, and gives no grade", () => {
    const html = watchEndHtml({ winner: "red", duration: 1394, kills: { blue: 12, red: 19 } });
    assert.match(html, /Red wins/);
    assert.match(html, /23:14/);
    assert.match(html, />12</);
    assert.match(html, />19</);
    assert.doesNotMatch(html, /Macro grade|sim-grade--/);
    assert.match(
      watchEndHtml({ winner: null, duration: 3600, kills: { blue: 0, red: 0 } }),
      /No winner/
    );
  });
});
