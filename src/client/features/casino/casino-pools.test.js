// The creator's pool editor: one column per lane with every hero of that lane, ticked when it is in the pool.
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

describe("the pool editor", () => {
  test("a hero is listed in each of its lanes, ticked when it is in that pool", () => {
    const html = poolsMarkup(view, heroes, {
      clash: [],
      jungle: [],
      mid: ["a"],
      farm: [],
      roam: ["a"]
    });
    const boxes = [
      ...html.matchAll(
        /<input type="checkbox" name="casino-pool" data-lane="(\w+)" value="(\w+)"( checked)?>/g
      )
    ];
    assert.deepEqual(
      boxes.map(([, lane, id, checked]) => `${lane}:${id}:${Boolean(checked)}`).sort(),
      ["clash:c:false", "mid:a:true", "mid:b:false", "roam:a:true"]
    );
    for (const lane of ["clash", "jungle", "mid", "farm", "roam"]) {
      assert.match(html, new RegExp(`data-action="casino-pool-all" data-lane="${lane}"`));
      assert.match(html, new RegExp(`data-action="casino-pool-none" data-lane="${lane}"`));
    }
    assert.match(html, /data-action="casino-pools-save"/);
    assert.match(html, /type="search"/);
  });

  test("what is ticked is read back lane by lane", () => {
    const box = (lane, value, checked) => ({ dataset: { lane }, value, checked });
    const form = {
      querySelectorAll: () => [
        box("mid", "a", true),
        box("mid", "b", false),
        box("roam", "a", true),
        box("clash", "c", true)
      ]
    };
    assert.deepEqual(readPools(form), {
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
