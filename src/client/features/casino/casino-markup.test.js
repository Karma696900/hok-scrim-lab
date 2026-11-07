// The /casino pages draw what the roulette holds: five lanes for everyone, the controls only for its creator, and a
// page that says so when the roulette is gone (spec 2026-11-07 casino).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";
import { matchRoute } from "../../../shared/routes.js";

installFakeDom({ pathname: "/casino" });
const { landingMarkup, missingMarkup, rollMarkup } = await import("./casino-markup.js");
const { escapeHtml } = await import("../../lib/escape.js");

const view = { esc: escapeHtml };
const heroes = new Map(
  ["a", "b", "c", "d", "e", "f"].map(id => [
    id,
    { id, name: `Hero ${id}`, displayName: `Hero ${id}`, image: "" }
  ])
);
const state = (result = { clash: "a", jungle: "b", mid: "c", farm: "d", roam: "e" }) => ({
  id: "Ab3dE5gH9k",
  version: 3,
  pools: { clash: ["a"], jungle: ["b"], mid: ["c"], farm: ["d"], roam: ["e"] },
  banned: ["f"],
  result,
  drawn: ["mid"],
  history: [{ at: 1, kind: "respin", lanes: ["mid"], result }],
  updatedAt: 1
});
const count = (html, pattern) => (html.match(pattern) ?? []).length;

describe("the casino routes", () => {
  test("/casino is indexed, /casino/<id> is not and carries the id", () => {
    const landing = matchRoute("/casino");
    assert.equal(landing.view, "casino");
    assert.equal(landing.route.index, true);
    const roll = matchRoute("/casino/Ab3dE5gH9k");
    assert.equal(roll.view, "casino-roll");
    assert.equal(roll.casinoId, "Ab3dE5gH9k");
    assert.equal(roll.route.index, false);
    assert.equal(matchRoute("/casino/short").view, "not-found");
  });
});

describe("the casino markup", () => {
  test("the landing offers to create a roulette", () => {
    assert.match(landingMarkup(view), /data-action="casino-create"/);
  });

  test("a spectator sees five heroes and no control", () => {
    const html = rollMarkup(view, state(), heroes, { control: false });
    assert.equal(count(html, /class="casino-reel/g), 5);
    for (const id of ["a", "b", "c", "d", "e"]) {
      assert.match(html, new RegExp(`Hero ${id}`));
    }
    for (const action of ["casino-spin", "casino-respin", "casino-ban", "casino-unban"]) {
      assert.doesNotMatch(html, new RegExp(`data-action="${action}"`));
    }
    assert.doesNotMatch(html, /name="casino-lane"/);
    assert.match(html, /data-action="casino-copy-link"/);
  });

  test("the creator sees spin, the lane ticks and Banned buttons", () => {
    const html = rollMarkup(view, state(), heroes, { control: true });
    assert.match(html, /data-action="casino-spin"/);
    assert.match(html, /data-action="casino-respin"/);
    assert.equal(count(html, /name="casino-lane"/g), 5);
    assert.equal(count(html, /data-action="casino-ban"/g), 5);
    assert.match(html, /data-action="casino-unban" data-hero="f"/);
    assert.match(html, /data-action="casino-copy-control"/);
  });

  test("an empty lane says so, and has no Banned button", () => {
    const html = rollMarkup(
      view,
      state({ clash: "a", jungle: "b", mid: "c", farm: "d", roam: null }),
      heroes,
      { control: true }
    );
    assert.match(html, /No hero left in this pool/);
    assert.equal(count(html, /data-action="casino-ban"/g), 4);
  });

  test("a roulette not spun yet invites the first spin", () => {
    const fresh = { ...state(), result: {}, history: [], drawn: [] };
    const html = rollMarkup(view, fresh, heroes, { control: false });
    assert.equal(count(html, /class="casino-reel/g), 5);
    assert.match(html, /Not spun yet/);
  });

  test("hero names are escaped", () => {
    const evil = new Map(heroes);
    evil.set("a", { id: "a", name: "<img src=x onerror=alert(1)>", image: "" });
    const html = rollMarkup(view, state(), evil, { control: false });
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x/);
  });

  test("the missing roulette offers to create one", () => {
    const html = missingMarkup(view);
    assert.match(html, /This roulette does not exist or has expired/);
    assert.match(html, /data-action="casino-create"/);
  });

  test("the roulette carries its version, so a browser check knows a new result is painted", () => {
    assert.match(
      rollMarkup(view, state(), heroes, { control: false }),
      /<section class="casino" data-version="3">/
    );
  });
});
