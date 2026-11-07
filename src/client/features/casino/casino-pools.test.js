// The creator's pool editor (owner, 2026-11-07: avatars instead of a list): one row per lane with every hero of that
// lane as an avatar, pressed when it is in the pool; All and None per lane; a search that dims the others.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";

installFakeDom({ pathname: "/casino/Ab3dE5gH9k" });
const { poolsMarkup, readPools } = await import("./casino-pools.js");
const { escapeHtml } = await import("../../lib/escape.js");

const view = { esc: escapeHtml };
const heroes = [
  { id: "a", name: "Alpha", lanes: ["Mid Lane", "Roamer"] },
  { id: "b", name: "Bravo", lanes: ["Mid Lane"] },
  { id: "c", name: "Charlie", lanes: ["Clash Lane"] }
];
const pools = { clash: [], jungle: [], mid: ["a"], farm: [], roam: ["a"] };

describe("the pool editor", () => {
  test("a hero is an avatar in each of its lanes, pressed when it is in that pool", () => {
    const html = poolsMarkup(view, heroes, pools);
    const avatars = [
      ...html.matchAll(
        /data-action="casino-pool-toggle" data-lane="(\w+)" data-hero="(\w+)" aria-pressed="(true|false)"/g
      )
    ];
    assert.deepEqual(avatars.map(([, lane, id, pressed]) => `${lane}:${id}:${pressed}`).sort(), [
      "clash:c:false",
      "mid:a:true",
      "mid:b:false",
      "roam:a:true"
    ]);
    assert.doesNotMatch(html, /type="checkbox"/, "no list of ticks any more");
    assert.doesNotMatch(html, /<details/, "not folded");
    assert.doesNotMatch(html, /casino-pools-save/, "saved by itself");
    assert.match(html, /data-pools-status/);
  });

  test("each avatar shows the hero's portrait and says its name", () => {
    const html = poolsMarkup(view, heroes, pools);
    assert.match(html, /data-hero="a"[^>]*title="Alpha"/);
    assert.match(html, /<span class="visually-hidden">Alpha<\/span>/);
  });

  test("each lane has All and None, the count of its pool, and the search box is there", () => {
    const html = poolsMarkup(view, heroes, pools);
    for (const lane of ["clash", "jungle", "mid", "farm", "roam"]) {
      assert.match(html, new RegExp(`data-action="casino-pool-all" data-lane="${lane}"`));
      assert.match(html, new RegExp(`data-action="casino-pool-none" data-lane="${lane}"`));
    }
    assert.match(html, /data-pool-count="mid">1</);
    assert.match(html, /type="search"/);
  });

  test("what is pressed is read back lane by lane", () => {
    const avatar = (lane, hero, pressed) => ({
      dataset: { lane, hero },
      getAttribute: () => String(pressed)
    });
    const root = {
      querySelectorAll: () => [
        avatar("mid", "a", true),
        avatar("mid", "b", false),
        avatar("roam", "a", true),
        avatar("clash", "c", true)
      ]
    };
    assert.deepEqual(readPools(root), {
      clash: ["c"],
      jungle: [],
      mid: ["a"],
      farm: [],
      roam: ["a"]
    });
  });

  test("hero names are escaped", () => {
    const html = poolsMarkup(view, [{ id: "x", name: "<b>x</b>", lanes: ["Jungle"] }], {
      jungle: ["x"]
    });
    assert.doesNotMatch(html, /<b>x<\/b>/);
  });
});
