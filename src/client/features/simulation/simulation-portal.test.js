// The Space Sprite's teleport portal on the play view: the circle on the ground lit while open, the purple button only
// in the open circle, its three lanes.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";

installFakeDom({ pathname: "/simulation" });
const { bindPortal, paintPortal, portalRingSvg, portalToolsHtml, togglePortalLanes } =
  await import("./simulation-portal.js");

// stand-ins of the four elements bindPortal keeps (the fake DOM has no selectors)
const element = () => {
  const classes = new Set();
  const attributes = {};
  return {
    hidden: true,
    classList: {
      contains: name => classes.has(name),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name))
    },
    getAttribute: name => attributes[name] ?? null,
    setAttribute: (name, v) => {
      attributes[name] = v;
    }
  };
};
const board = () => {
  const parts = { box: element(), lanes: element(), go: element(), ring: element() };
  const layer = {
    querySelector: selector =>
      selector === "[data-portal-tools]"
        ? box
        : selector === ".sim-map [data-portal]"
          ? parts.ring
          : null
  };
  const box = {
    ...parts.box,
    querySelector: s => (s === ".sim-portal__lanes" ? parts.lanes : parts.go)
  };
  const run = {};
  bindPortal(run, layer);
  return { run };
};
const alive = { alive: true };

describe("the Sprite portal on the play view", () => {
  test("the circle sits where the map puts it; none on a map without one", () => {
    assert.match(portalRingSvg({ at: [222.4, 221.6], radius: 24 }), /cx="222" cy="222" r="24"/);
    assert.equal(portalRingSvg(null), "");
  });

  test("three lanes, clash, mid and farm, each sending its lane", () => {
    const html = portalToolsHtml();
    assert.deepEqual(
      [...html.matchAll(/data-lane="(\w+)"/g)].map(m => m[1]),
      ["top", "mid", "bottom"]
    );
    assert.match(html, /data-sim="portal-menu"/);
  });

  test("hidden until the player stands alive in his open portal, the circle lit while open", () => {
    const { run } = board();
    paintPortal(run, { portal: { open: false, here: true } }, alive);
    assert.equal(run.portal.box.hidden, true);
    assert.equal(run.portal.ring.classList.contains("is-open"), false);
    paintPortal(run, { portal: { open: true, here: false } }, alive);
    assert.equal(run.portal.box.hidden, true);
    assert.equal(run.portal.ring.classList.contains("is-open"), true);
    paintPortal(run, { portal: { open: true, here: true } }, alive);
    assert.equal(run.portal.box.hidden, false);
    paintPortal(run, { portal: { open: true, here: true } }, { alive: false });
    assert.equal(run.portal.box.hidden, true);
  });

  test("the button opens the lanes; leaving the circle closes them", () => {
    const { run } = board();
    paintPortal(run, { portal: { open: true, here: true } }, alive);
    togglePortalLanes(run);
    assert.equal(run.portal.lanes.hidden, false);
    assert.equal(run.portal.go.getAttribute("aria-expanded"), "true");
    paintPortal(run, { portal: { open: true, here: false } }, alive);
    assert.equal(run.portal.lanes.hidden, true);
  });
});
