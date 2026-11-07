// The hero picker (owner, 2026-11-07: "tous les listes déroulantes avec le nom de champions, il faut vraiment remplacer
// toujours par leurs avatars"): a button with the chosen hero's avatar, a panel of avatars with a search and the
// lanes, and a hidden field that keeps the id and name of the list it replaces, so that forms and handlers stay.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { installFakeDom } from "../../testing/fake-dom.js";

installFakeDom({ pathname: "/" });
const { heroPicker, heroPickerPanel, pickInto } = await import("./hero-picker.js");

const heroes = [
  { id: "a", name: "Alpha", lanes: ["Mid Lane"], image: "" },
  {
    id: "b",
    name: "Bravo",
    displayName: "Brávo Prime",
    lanes: ["Jungle", "Clash Lane"],
    image: ""
  },
  { id: "c", name: "<i>Charlie</i>", lanes: ["Roamer"], image: "" }
];
const picks = html => [...html.matchAll(/data-pick="([^"]*)"/g)].map(match => match[1]);

describe("the hero picker", () => {
  test("keeps the id, the name and the value of the list it replaces, in a hidden field", () => {
    const html = heroPicker({ id: "lab-hero", name: "heroId", value: "b", heroes, label: "Hero" });
    assert.match(html, /<input type="hidden" id="lab-hero" name="heroId" value="b">/);
    assert.match(html, /data-action="hero-picker"/);
    assert.match(html, /aria-haspopup="true"/);
    assert.doesNotMatch(html, /<select/);
  });

  test("its button shows the chosen hero, or what an empty choice means", () => {
    assert.match(heroPicker({ id: "x", value: "b", heroes, label: "Hero" }), /Brávo Prime/);
    const none = heroPicker({ id: "x", value: "", heroes, empty: "All heroes", label: "Hero" });
    assert.match(none, /All heroes/);
    assert.match(none, /value=""/);
  });

  test("the panel lists every hero as an avatar, the empty choice first, the chosen one pressed", () => {
    const html = heroPickerPanel({ heroes, empty: "No hero" }, { value: "a" });
    assert.deepEqual(picks(html), ["", "a", "b", "c"]);
    assert.match(html, /data-pick="a"[^>]*aria-pressed="true"/);
    assert.match(html, /data-pick="b"[^>]*aria-pressed="false"/);
    assert.match(html, /type="search"/);
    assert.match(html, /data-pick-lane="Jungle"/);
  });

  test("a required choice has no empty avatar", () => {
    assert.deepEqual(picks(heroPickerPanel({ heroes }, {})), ["a", "b", "c"]);
  });

  test("the search keeps the names that match, without accents or case; the lane keeps that lane", () => {
    assert.deepEqual(picks(heroPickerPanel({ heroes }, { query: "bravo" })), ["b"]);
    assert.deepEqual(picks(heroPickerPanel({ heroes }, { query: "PRIME" })), ["b"]);
    assert.deepEqual(picks(heroPickerPanel({ heroes }, { lane: "Clash Lane" })), ["b"]);
    assert.match(heroPickerPanel({ heroes }, { query: "zzz" }), /hero-pick__none/);
  });

  test("a caption shows under a hero when the page gives one; names are escaped", () => {
    const html = heroPickerPanel({ heroes, captions: { a: "3 combos" } }, {});
    assert.match(html, /<small>3 combos<\/small>/);
    assert.doesNotMatch(html, /<i>Charlie<\/i>/);
  });

  test("a pick fills the hidden field, redraws the button and tells the page with a change event", () => {
    const events = [];
    const input = { value: "", dispatchEvent: event => events.push(event) };
    const button = {
      innerHTML: "",
      attributes: {},
      setAttribute(key, value) {
        this.attributes[key] = value;
      }
    };
    const picker = {
      querySelector: selector => (selector.startsWith("input") ? input : button)
    };
    pickInto(picker, "c", { heroes, label: "Hero" });
    assert.equal(input.value, "c");
    assert.match(button.innerHTML, /&lt;i&gt;Charlie/);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "change");
    assert.equal(events[0].bubbles, true);
  });
});
