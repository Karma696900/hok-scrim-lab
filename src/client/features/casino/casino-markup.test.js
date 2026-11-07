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
  test("the landing offers to create a roulette, in the site's stage", () => {
    const html = landingMarkup(view);
    assert.match(html, /class="btn btn--primary" data-action="casino-create"/);
    assert.match(html, /<header class="page-head cs-stage keep-dark/);
  });

  test("a spectator sees five heroes and spins on their own screen, but never bans (owner, 2026-11-07)", () => {
    const html = rollMarkup(view, state(), heroes, { control: false });
    assert.equal(count(html, /class="casino-reel/g), 5);
    for (const id of ["a", "b", "c", "d", "e"]) {
      assert.match(html, new RegExp(`Hero ${id}`));
    }
    assert.match(html, /data-action="casino-spin"/);
    assert.match(html, /data-action="casino-respin"/);
    assert.equal(count(html, /data-action="casino-lane-toggle"/g), 5);
    for (const action of ["casino-ban", "casino-unban", "casino-copy-control"]) {
      assert.doesNotMatch(html, new RegExp(`data-action="${action}"`));
    }
    assert.doesNotMatch(html, /casino-local/, "no banner before the spectator spins");
    assert.match(html, /data-action="casino-copy-link"/);
    assert.match(html, /data-action="casino-basket-add"/, "a spectator fills its own basket too");
  });

  test("a spectator who spun is told it is only on their screen, with the way back to the live roulette", () => {
    const html = rollMarkup(view, state(), heroes, {
      control: false,
      local: { creatorSpun: false }
    });
    assert.match(html, /class="casino-local"/);
    assert.match(html, /Your spin — only on your screen/);
    assert.match(html, /data-action="casino-live"/);
    assert.doesNotMatch(html, /The creator spun/);
    const spun = rollMarkup(view, state(), heroes, {
      control: false,
      local: { creatorSpun: true }
    });
    assert.match(spun, /The creator spun/);
  });

  test("each lane is one square: the lane's icon, the hero over the whole square, then Respin and Banned (owner, 2026-11-07)", () => {
    const html = rollMarkup(view, state(), heroes, { control: true });
    const squares = [...html.matchAll(/<div class="casino-square">([\s\S]*?)<\/div>\s*<\/div>/g)];
    assert.equal(count(html, /class="casino-square"/g), 5);
    assert.equal(count(html, /class="casino-square__lane"/g), 5);
    assert.ok(squares.every(([, inside]) => /casino-reel/.test(inside)));
    assert.doesNotMatch(html, /casino-slot__lane/, "no lane row above the square any more");
  });

  test("the page opens with the site's stage, the share links and the basket", () => {
    const html = rollMarkup(view, state(), heroes, { control: true, basket: 3 });
    assert.match(html, /<header class="page-head cs-stage keep-dark/);
    assert.match(
      html,
      /data-action="casino-basket-open"[^>]*>[\s\S]*?<b class="casino-count">3<\/b>/
    );
    assert.match(html, /class="btn btn--primary" data-action="casino-spin"/);
  });

  test("the creator sees spin, a Respin toggle per lane and Banned buttons", () => {
    const html = rollMarkup(view, state(), heroes, { control: true });
    assert.match(html, /data-action="casino-spin"/);
    assert.match(html, /data-action="casino-respin"/);
    assert.equal(
      count(html, /data-action="casino-lane-toggle" data-lane="\w+" aria-pressed="false"/g),
      5
    );
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

  test("under each lane, everyone sees the heroes it can draw: the drawn one marked, a banned one greyed (owner, 2026-11-07)", () => {
    const pooled = {
      ...state(),
      pools: { clash: ["a", "f", "b"], jungle: ["b"], mid: ["c"], farm: ["d"], roam: ["e"] }
    };
    for (const control of [false, true]) {
      const html = rollMarkup(view, pooled, heroes, { control });
      const clash = html
        .split('<div class="casino-slot" data-lane="clash">')[1]
        .split('<div class="casino-slot"')[0];
      assert.deepEqual(
        [...clash.matchAll(/<li class="casino-option([^"]*)" data-hero="(\w+)"/g)].map(
          ([, kind, id]) => `${id}${kind}`
        ),
        ["a casino-option--drawn", "f casino-option--banned", "b"]
      );
      assert.match(clash, /title="Hero f \(Banned\)"/);
      assert.match(clash, /3 heroes/);
      assert.equal(count(html, /class="casino-slot__pool"/g), 5);
    }
  });

  test("an empty pool says so under its lane", () => {
    const html = rollMarkup(view, { ...state(), pools: { ...state().pools, farm: [] } }, heroes, {
      control: false
    });
    const farm = html
      .split('<div class="casino-slot" data-lane="farm">')[1]
      .split('<div class="casino-slot"')[0];
    assert.match(farm, /No hero in this pool/);
    assert.doesNotMatch(farm, /casino-option/);
  });

  test("the roulette carries its version, so a browser check knows a new result is painted", () => {
    assert.match(
      rollMarkup(view, state(), heroes, { control: false }),
      /<section class="casino casino--roll" data-version="3">/
    );
  });
});
