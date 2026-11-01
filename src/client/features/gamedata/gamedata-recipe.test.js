// The recipe of an item on the public /items page: its level, what it is built from (with the price of each part
// and the gold it still costs to put them together), and the items it goes into. Nothing is invented: an item
// with no recipe and that nothing is built from shows no recipe at all.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";

installFakeDom({ pathname: "/items" });
const { escapeHtml } = await import("../../lib/escape.js");
const { recipe, tierLabel } = await import("./gamedata-recipe.js");

const items = [
  { id: 1, name: "Spell Tome", tier: "basic", price: 300, components: [], imageId: null },
  {
    id: 2,
    name: "Grand Staff",
    tier: "intermediate",
    price: 820,
    components: [1, 1],
    imageId: null
  },
  { id: 3, name: "Rod of Ages", tier: "final", price: 2100, components: [2, 4], imageId: null },
  { id: 4, name: "Codex", tier: "intermediate", price: 800, components: [], imageId: null },
  { id: 5, name: "Lone Ring", tier: null, price: 500, components: [], imageId: null }
];
const view = { catalog: { items }, esc: escapeHtml, all: () => items };
const byId = id => items.find(item => item.id === id);

describe("the recipe of an item", () => {
  test("four levels, each with a name", () => {
    for (const tier of ["basic", "intermediate", "final", "enchanted"]) {
      assert.ok(tierLabel(tier) && tierLabel(tier) !== tier, tier);
    }
    assert.equal(tierLabel(null), "");
  });

  test("what it is built from, each part once per time it is needed, and the gold to put them together", () => {
    const html = recipe(view, byId(2));
    assert.equal(html.match(/data-pick="1"/g).length, 2, "the same part twice");
    assert.match(html, /300/);
    assert.match(html, /220/, "820 - 300 - 300 = 220 gold to combine");
    assert.match(html, /Spell Tome/);
  });

  test("what it goes into", () => {
    const html = recipe(view, byId(2));
    assert.match(html, /data-pick="3"/);
    assert.match(html, /Rod of Ages/);
    const tome = recipe(view, byId(1));
    assert.match(tome, /data-pick="2"/, "a small item lists the item it builds into");
    assert.doesNotMatch(tome, /data-pick="3"/, "only the items that take it directly");
  });

  test("a part the catalogue no longer has, or no price, does not invent a sum", () => {
    const html = recipe(view, {
      id: 9,
      name: "X",
      tier: "final",
      price: 1000,
      components: [4, 77]
    });
    assert.doesNotMatch(html, /data-pick="77"/);
    assert.doesNotMatch(html, /200/, "no sum when a part is missing");
  });

  test("an item with no recipe and that builds nothing shows nothing", () => {
    assert.equal(recipe(view, byId(5)), "");
  });
});
