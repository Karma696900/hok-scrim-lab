// The basket (owner, 2026-11-07): compositions kept from any roulette, in this browser, at most 50; renamed, removed,
// shown in a side panel and sent for one PDF.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";

installFakeDom({ pathname: "/casino/Ab3dE5gH9k" });
const {
  addToBasket,
  basketMarkup,
  clearBasket,
  readBasket,
  removeFromBasket,
  renameInBasket,
  BASKET_MAX,
  basketRequest
} = await import("./casino-basket.js");
const { escapeHtml } = await import("../../lib/escape.js");

const view = { esc: escapeHtml };
const result = { clash: "a", jungle: "b", mid: "c", farm: "d", roam: "e" };
const heroes = new Map(
  ["a", "b", "c", "d", "e"].map(id => [id, { id, name: `Hero ${id}`, image: "" }])
);

describe("the basket", () => {
  beforeEach(() => clearBasket());

  test("keeps a composition, newest last, and survives a new read", () => {
    assert.equal(addToBasket(result, 1).ok, true);
    assert.equal(addToBasket({ ...result, mid: "x" }, 2).ok, true);
    const kept = readBasket();
    assert.equal(kept.length, 2);
    assert.deepEqual(kept[0].result, result);
    assert.equal(kept[1].result.mid, "x");
    assert.equal(kept[0].name, "");
  });

  test("refuses a composition with no hero, and the 51st", () => {
    assert.equal(
      addToBasket({ clash: null, jungle: null, mid: null, farm: null, roam: null }).ok,
      false
    );
    for (let i = 0; i < BASKET_MAX; i += 1) {
      assert.equal(addToBasket(result, i).ok, true);
    }
    assert.deepEqual(addToBasket(result), { ok: false, reason: "full" });
    assert.equal(BASKET_MAX, 50);
  });

  test("renames and removes one composition", () => {
    addToBasket(result, 1);
    addToBasket(result, 2);
    const [first, second] = readBasket();
    renameInBasket(first.id, "  Dive comp  ");
    removeFromBasket(second.id);
    assert.deepEqual(
      readBasket().map(item => item.name),
      ["Dive comp"]
    );
  });

  test("the request for the PDF sends the names and the lanes only", () => {
    addToBasket(result, 1);
    renameInBasket(readBasket()[0].id, "Dive");
    assert.deepEqual(basketRequest(readBasket()), { compositions: [{ name: "Dive", result }] });
  });

  test("the panel lists each composition with its five avatars, a name field and a remove button", () => {
    addToBasket(result, 1);
    addToBasket(result, 2);
    const html = basketMarkup(view, readBasket(), heroes);
    assert.equal((html.match(/class="casino-basket__item"/g) ?? []).length, 2);
    assert.equal((html.match(/class="casino-basket__hero"/g) ?? []).length, 10);
    assert.equal((html.match(/data-action="casino-basket-remove"/g) ?? []).length, 2);
    assert.equal((html.match(/name="casino-basket-name"/g) ?? []).length, 2);
    assert.match(html, /placeholder="Composition 1"/);
    assert.match(html, /data-action="casino-basket-pdf"/);
  });

  test("an empty basket says how to fill it and offers no download", () => {
    const html = basketMarkup(view, [], heroes);
    assert.match(html, /Add a composition from a roulette/);
    assert.doesNotMatch(html, /data-action="casino-basket-pdf"/);
  });
});
