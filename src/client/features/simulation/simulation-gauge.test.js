// The gauge in place of mana: a bar of a colour, a bar turning from one colour to another, pips, none, and the mana
// of an older service that sends no gauge.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { gaugeOf, paintGauge } from "./simulation-gauge.js";

// the few parts of an element the painter touches
function element(tag) {
  const classes = new Set();
  const props = new Map();
  const node = {
    tag,
    hidden: false,
    children: [],
    dataset: {},
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c)
    },
    style: { setProperty: (k, v) => props.set(k, v), removeProperty: k => props.delete(k), props },
    get firstElementChild() {
      return node.children[0] ?? null;
    },
    replaceChildren: (...kids) => (node.children = kids),
    removeAttribute: name => delete node.dataset[name.replace(/^data-/, "")]
  };
  return node;
}
globalThis.document = { createElement: element };

const bar = () => {
  const node = element("span");
  node.replaceChildren(element("i"));
  return node;
};

describe("the gauge in place of mana", () => {
  test("a coloured bar: its length and its tone", () => {
    const node = bar();
    paintGauge(node, { gauge: { kind: "bar", share: 0.6, tone: "red" } });
    assert.equal(node.hidden, false);
    assert.equal(node.dataset.tone, "red");
    assert.equal(node.firstElementChild.style.props.get("--p"), "60");
  });

  test("Li Xin's bar turns to its second colour by its blend", () => {
    const node = bar();
    paintGauge(node, { gauge: { kind: "bar", share: 0.5, tone: "yellow", to: "red", blend: 0.5 } });
    assert.equal(node.dataset.to, "red");
    assert.equal(node.style.props.get("--blend"), "50");
    paintGauge(node, { gauge: { kind: "bar", share: 0.5, tone: "mana" } });
    assert.equal(node.dataset.to, undefined);
  });

  test("pips: one cell each, coloured when filled, back to a bar after", () => {
    const node = bar();
    paintGauge(node, { gauge: { kind: "pips", pips: ["green", "green", "", "", ""] } });
    assert.equal(node.classList.contains("is-pips"), true);
    assert.equal(node.children.length, 5);
    assert.deepEqual(
      node.children.map(pip => pip.dataset.tone ?? ""),
      ["green", "green", "", "", ""]
    );
    paintGauge(node, { gauge: { kind: "bar", share: 1, tone: "yellow" } });
    assert.equal(node.classList.contains("is-pips"), false);
    assert.equal(node.children[0].tag, "i");
  });

  test("an unknown tone is drawn grey, never written as it came", () => {
    const node = bar();
    paintGauge(node, { gauge: { kind: "bar", share: 1, tone: '"><img src=x>' } });
    assert.equal(node.dataset.tone, "grey");
  });

  test("no gauge (Arthur, Ata) hides the bar", () => {
    const node = bar();
    paintGauge(node, { gauge: null });
    assert.equal(node.hidden, true);
  });

  test("an older service without gauges: the mana, or nothing for a manaless hero", () => {
    assert.deepEqual(gaugeOf({ mana: 300, maxMana: 400 }), {
      kind: "bar",
      share: 0.75,
      tone: "mana"
    });
    assert.equal(gaugeOf({ mana: null, maxMana: null }), null);
  });
});
