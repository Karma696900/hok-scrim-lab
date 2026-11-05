// The dark sweep and the seconds left of what recharges on the screen (the summoner spell, Recall, Recovery).
import assert from "node:assert/strict";
import { test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";

installFakeDom({ pathname: "/simulation" });
const cooldownApi = await import("./simulation-cooldown.js");
const { coolState } = cooldownApi;

test("a button ready shows no sweep and no seconds", () => {
  assert.deepEqual(coolState(null, 0), { left: 0, full: 0, share: 0, label: "" });
});

test("a button that just went down remembers its whole cooldown, and the sweep shrinks with it", () => {
  const first = coolState(null, 8);
  assert.deepEqual(first, { left: 8, full: 8, share: 1, label: "8" });
  const later = coolState(first, 2.4);
  assert.equal(later.full, 8);
  assert.equal(later.share, 0.3);
  assert.equal(later.label, "3", "the seconds left, rounded up");
});

test("a cooldown that grows again (a new cast) starts a new sweep", () => {
  const state = coolState(coolState(null, 8), 1);
  assert.equal(coolState(state, 6).full, 6);
});

test("the last second shows its tenths", () => {
  assert.equal(coolState(null, 0.7).label, "0.7");
});

// a spell button as paintSpellCooldown sees it: its classes, its sweep and its seconds
function fakeSpell() {
  const classes = new Set();
  const props = new Map();
  return {
    classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
    style: { setProperty: (name, value) => props.set(name, value) },
    time: { hidden: true, textContent: "" },
    classes,
    props
  };
}

test("the spell goes down once used: a sweep and the seconds, then nothing once ready again", () => {
  const { paintSpellCooldown } = cooldownApi;
  const button = fakeSpell();
  const run = {};
  paintSpellCooldown(run, button, button.time, { alive: true, spellLeft: 120 });
  assert.ok(button.classes.has("is-cooling"));
  assert.equal(button.props.get("--sweep"), "1");
  assert.equal(button.time.textContent, "120");
  assert.equal(button.time.hidden, false);
  paintSpellCooldown(run, button, button.time, { alive: true, spellLeft: 30 });
  assert.equal(
    button.props.get("--sweep"),
    "0.25",
    "the sweep is the share left of the whole cooldown"
  );
  paintSpellCooldown(run, button, button.time, { alive: true, spellLeft: 0 });
  assert.ok(!button.classes.has("is-cooling"));
  assert.equal(button.time.hidden, true);
});

test("a spell given back early (a reset) shows ready at once; a dead hero's spell shows no seconds", () => {
  const { paintSpellCooldown } = cooldownApi;
  const button = fakeSpell();
  const run = {};
  paintSpellCooldown(run, button, button.time, { alive: true, spellLeft: 60 });
  paintSpellCooldown(run, button, button.time, { alive: true, spellLeft: 0 });
  assert.ok(!button.classes.has("is-cooling"));
  paintSpellCooldown(run, button, button.time, { alive: false, spellLeft: 40 });
  assert.ok(!button.classes.has("is-cooling"));
  assert.equal(button.time.hidden, true);
});
