// Every public page is aimed at what players type: "hok tier list", "hok items", "hok training"...
// Its title names HOK and Honor of Kings, sections of a page have their own title, a hero page
// says what it holds, and the sitemap lists every page that can be found.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { matchRoute, routeTexts } from "../../../shared/routes.js";
import { heroTitleKey } from "../../../shared/hero-title.js";

const SEARCHED = [
  "/",
  "/heroes",
  "/tier-list",
  "/tier-list/jungle",
  "/tier-lists",
  "/scrims",
  "/training",
  "/training/reflex",
  "/training/scenarios",
  "/teams",
  "/find",
  "/build-lab",
  "/items",
  "/arcana",
  "/spells",
  "/popular",
  "/popular/heroes",
  "/simulation"
];

describe("the titles of the public pages", () => {
  test("each names HOK and Honor of Kings, and has a description", () => {
    for (const address of SEARCHED) {
      const { title, description } = routeTexts(matchRoute(address));
      assert.match(title, /\bHOK\b/, `${address}: ${title}`);
      assert.match(title, /Honor of Kings/, `${address}: ${title}`);
      assert.ok(description.length > 60, `${address}: a real description`);
    }
  });

  test("a section of a page has its own title", () => {
    const titleOf = address => routeTexts(matchRoute(address)).title;
    assert.notEqual(titleOf("/popular/heroes"), titleOf("/popular"));
    assert.notEqual(titleOf("/training/reflex"), titleOf("/training"));
    assert.notEqual(titleOf("/training/scenarios"), titleOf("/training"));
    assert.equal(titleOf("/training/notebook"), titleOf("/training"), "the notebook is private");
  });

  test("a hero title only promises what the page holds", () => {
    assert.match(heroTitleKey({ build: true, games: true }), /build, skills and counters/);
    assert.match(heroTitleKey({ build: true, games: false }), /build and skills/);
    assert.doesNotMatch(heroTitleKey({ build: false, games: true }), /build/);
    assert.doesNotMatch(heroTitleKey({ build: false, games: false }), /build|counters/);
    for (const build of [true, false]) {
      for (const games of [true, false]) {
        assert.match(heroTitleKey({ build, games }), /HOK Honor of Kings/);
      }
    }
  });
});
