// The tiers of the tier lists and of the official ratings: the six names, the name a colour is chosen
// from, and the board the two pages are drawn on (the same one, so that they cannot look different).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { OFFICIAL_TIERS } from "./official.js";
import { WEB } from "../../platform/http/web-root.js";
import { TIERS, tierKey } from "../../../shared/tier-names.js";
import { clientStyles } from "../../../testing/sources.js";

const client = file => readFileSync(path.join(WEB.client, file), "utf8");
/** A page is cut into files named after it (tier-list-view.js, tier-list-markup.js…): its source is all of them. */
const pageSource = (folder, prefix) =>
  readdirSync(path.join(WEB.client, folder))
    .filter(name => name.startsWith(prefix) && name.endsWith(".js") && !/\.(test|e2e)\./.test(name))
    .map(name => client(`${folder}/${name}`))
    .join("\n");
const TIER_LISTS = () => pageSource("features/tier-lists", "tier-list-");
const RATINGS = () => pageSource("features/ratings", "rating-editor");

describe("the tiers", () => {
  test("six names, best first; the official ratings use the very same list", () => {
    assert.deepEqual([...TIERS], ["SS", "S", "A", "B", "C", "D"]);
    assert.ok(Object.isFrozen(TIERS), "nobody can reorder them for everybody else");
    assert.equal(OFFICIAL_TIERS, TIERS);
  });

  test("the name a colour is chosen from: one of the six, whatever its case and its spaces", () => {
    for (const name of TIERS) {
      assert.equal(tierKey(name), name);
      assert.equal(tierKey(name.toLowerCase()), name);
      assert.equal(tierKey(`  ${name} `), name);
    }
    assert.equal(tierKey("ss"), "SS");
  });

  test("any other name has no colour of its own (it takes the colour of its place)", () => {
    for (const name of [
      "",
      " ",
      "S+",
      "SSS",
      "E",
      "Top",
      "T1",
      "Unranked",
      "S A",
      "ß",
      "ſ",
      "ＳＳ"
    ]) {
      assert.equal(tierKey(name), "", JSON.stringify(name));
    }
    for (const notAName of [null, undefined, 7, {}, ["S"]]) {
      assert.equal(tierKey(notAName), "");
    }
  });
});

describe("one board for the tier lists and the ratings", () => {
  test("both pages draw their rows and their portraits with the same helpers", () => {
    for (const [page, source] of [
      ["tier lists", TIER_LISTS()],
      ["ratings", RATINGS()]
    ]) {
      assert.match(source, /from "\.\.\/\.\.\/domain\/tier-labels\.js"/, page);
      assert.match(source, /tierRow\(/, `${page} draws a row`);
      assert.doesNotMatch(source, /class="tier-row|class="tier-label|class="tier-drop/, page);
    }
    assert.match(TIER_LISTS(), /tierPortrait\(/);
    assert.match(RATINGS(), /tierPortrait\(/);
  });

  test("a new tier list starts with the six tiers, SS first, as the ratings do", () => {
    assert.match(TIER_LISTS(), /tiers: TIERS\.map\(/);
  });

  test("a tier has the same colour on the board and on the rating of a hero", () => {
    const styles = clientStyles();
    const colours = pattern =>
      Object.fromEntries(
        [...styles.matchAll(pattern)].map(match => [match[1], match[2].replace(/\s+/g, "")])
      );
    const board = colours(/\.tier-row\[data-tier="(\w+)"\]\s*\{\s*--tc:\s*(var\(--tier-\w+\))/g);
    const rating = colours(
      /\.hero-rating\[data-tier="(\w+)"\]\s*\{\s*--tc:\s*(var\(--tier-\w+\))/g
    );
    assert.deepEqual(Object.keys(board), [...TIERS], "every tier has a colour on the board");
    assert.deepEqual(board, rating);
  });
});
