// The target's box at the top of the screen, as the game's "Show Target Info": the enemy hero the player locked, with
// its portrait, its name and its health, shown while it is alive and in sight.
import assert from "node:assert/strict";
import { test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";

installFakeDom({ pathname: "/simulation" });
const { targetHtml, targetInfo } = await import("./simulation-target.js");

const roster = [{ id: "105", name: "Arli" }];
const view = {
  heroes: [
    { id: "r1", heroId: "105", side: "red", alive: true, hp: 2400, maxHp: 3200, pos: [500, 500] },
    { id: "r2", heroId: "106", side: "red", alive: false, hp: 0, maxHp: 3000, pos: [400, 400] }
  ]
};

test("a locked enemy hero gives its name, its health and its share", () => {
  const info = targetInfo({ target: { kind: "hero", id: "r1" } }, view, roster);
  assert.deepEqual(info, {
    id: "r1",
    heroId: "105",
    name: "Arli",
    hp: 2400,
    maxHp: 3200,
    share: 75
  });
});

test("no target, a target that is not a hero, a dead one or one out of sight: no box", () => {
  assert.equal(targetInfo({ target: null }, view, roster), null);
  assert.equal(targetInfo({ target: { kind: "tower", id: "t1" } }, view, roster), null);
  assert.equal(targetInfo({ target: { kind: "hero", id: "r2" } }, view, roster), null);
  assert.equal(targetInfo({ target: { kind: "hero", id: "gone" } }, view, roster), null);
});

test("the box shows the health as numbers, and no style attribute", () => {
  const html = targetHtml(roster, targetInfo({ target: { kind: "hero", id: "r1" } }, view, roster));
  assert.match(html, /Arli/);
  assert.match(html, /2400 \/ 3200/);
  assert.match(html, /class="sim-bar sim-bar--hp/);
  assert.doesNotMatch(html, /style="/);
});
