// The Healing Dews on the board: a drop per Dew of the view, pale while it grows back, hidden once its tower fell.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";

installFakeDom({ pathname: "/simulation" });
const made = [];
// stand-in elements that keep their classes and attributes (the fake DOM's do not)
globalThis.document.createElement = () => {
  const classes = new Set();
  const element = {
    hidden: false,
    style: {},
    dataset: {},
    parentElement: null,
    className: "",
    classList: {
      contains: name => classes.has(name),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name))
    },
    setAttribute() {},
    toggleAttribute(name, on) {
      if (name === "hidden") {
        element.hidden = on;
      }
    }
  };
  made.push(element);
  return element;
};
const { paintDews } = await import("./simulation-dew.js");

const run = () => ({ side: "blue", layerOf: { dots: { append() {} } } });
const dew = (id, ready) => ({ id, at: [300, 700], ready });

describe("the Healing Dews on the board", () => {
  test("one drop per Dew of the view, made once", () => {
    const r = run();
    paintDews(r, { dews: [dew("a", true), dew("b", true)] });
    paintDews(r, { dews: [dew("a", true), dew("b", true)] });
    assert.equal(r.dews.size, 2);
  });

  test("pale while it grows back, full once out", () => {
    const r = run();
    paintDews(r, { dews: [dew("a", false)] });
    const drop = r.dews.get("a");
    assert.equal(drop.classList.contains("is-growing"), true);
    paintDews(r, { dews: [dew("a", true)] });
    assert.equal(drop.classList.contains("is-growing"), false);
  });

  test("hidden once the view no longer lists it (its tower fell); a view without Dews is fine", () => {
    const r = run();
    paintDews(r, { dews: [dew("a", true)] });
    paintDews(r, { dews: [] });
    assert.equal(r.dews.get("a").hidden, true);
    assert.doesNotThrow(() => paintDews(run(), {}));
  });
});
