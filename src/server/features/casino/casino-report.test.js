// The basket's PDF (owner, 2026-11-07): the compositions kept from the roulette, one block each, in the style of the
// series export; what the request may send.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseBasket, renderBasketHtml, BASKET_MAX } from "./casino-report.js";

const heroes = new Map(
  ["h01", "h02", "h03", "h04", "h05"].map(id => [
    id,
    { id, name: `Hero ${id}`, displayName: `Hero ${id}` }
  ])
);
const known = new Set(heroes.keys());
const full = { clash: "h01", jungle: "h02", mid: "h03", farm: "h04", roam: "h05" };

describe("the basket's request", () => {
  test("keeps the name and the five lanes, drops unknown heroes", () => {
    const [one] = parseBasket(
      { compositions: [{ name: "  Dive  ", result: { ...full, mid: "nope" } }] },
      known
    );
    assert.equal(one.name, "Dive");
    assert.deepEqual(one.result, { ...full, mid: null });
  });

  test("names a nameless composition by its place", () => {
    const list = parseBasket(
      { compositions: [{ result: full }, { name: "", result: full }] },
      known
    );
    assert.deepEqual(
      list.map(item => item.name),
      ["", ""]
    );
  });

  test("refuses an empty basket, a basket over the limit and a too long name", () => {
    assert.throws(() => parseBasket({ compositions: [] }, known), { code: "invalid_basket" });
    assert.throws(
      () =>
        parseBasket(
          { compositions: Array.from({ length: BASKET_MAX + 1 }, () => ({ result: full })) },
          known
        ),
      { code: "invalid_basket" }
    );
    assert.throws(
      () => parseBasket({ compositions: [{ name: "x".repeat(81), result: full }] }, known),
      {
        code: "invalid_basket"
      }
    );
    assert.throws(() => parseBasket({ compositions: "no" }, known), { code: "invalid_basket" });
  });

  test("the limit is 50", () => {
    assert.equal(BASKET_MAX, 50);
  });
});

describe("the basket's PDF page", () => {
  const html = renderBasketHtml({
    compositions: [
      { name: "<b>Dive</b>", result: full },
      { name: "", result: { ...full, roam: null } }
    ],
    heroById: heroes,
    portraitPath: id => (id === "h01" ? "/portraits/h01" : null),
    generatedAt: "2026-11-07 18:00 UTC",
    language: "en"
  });

  test("one block per composition, its name escaped, a nameless one numbered", () => {
    assert.equal((html.match(/class="team"/g) ?? []).length, 2);
    assert.match(html, /&lt;b&gt;Dive&lt;\/b&gt;/);
    assert.match(html, /Composition 2/);
  });

  test("each lane shows its icon on the hero's square, the portrait when cached", () => {
    assert.equal((html.match(/src="\/icons\/lane-/g) ?? []).length, 10);
    assert.match(html, /src="\/portraits\/h01"/);
    assert.match(html, /Hero h05/);
    assert.match(html, /No hero/);
  });

  test("the cover says what the file is", () => {
    assert.match(html, /Composition roulette/);
    assert.match(html, /2026-11-07 18:00 UTC/);
  });
});
