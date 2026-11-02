// The skills of the player's hero, shown in an arc around the attack as in the game: the AI casts them, the arc shows
// how long each one has left to recharge (a dark sweep and the seconds) and flashes when the AI casts it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";

installFakeDom({ pathname: "/simulation" });
const cooldownApi = await import("./simulation-skills.js");
const { arcSpots, coolState } = cooldownApi;

test("a skill ready shows no sweep and no seconds", () => {
  assert.deepEqual(coolState(null, 0), { left: 0, full: 0, share: 0, label: "" });
});

test("a skill that just went down remembers its whole cooldown, and the sweep shrinks with it", () => {
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

test("the skills sit where the game puts them, in screen widths from the attack: left of it, up-left, then higher", () => {
  // measured on the owner's captures: 0.215 W at 181°, 0.185 W at 152°, 0.17 W at 124° (up is positive)
  const [first, second, ult] = arcSpots(3);
  const near = (spot, radius, degrees) =>
    Math.abs(Math.hypot(spot.x, spot.y) - radius) < 0.003 &&
    Math.abs((Math.atan2(spot.y, spot.x) * 180) / Math.PI - degrees) < 1;
  assert.ok(near(first, 0.215, -179), "the first on the left, a hair low");
  assert.ok(near(second, 0.185, 152), "the second up-left");
  assert.ok(near(ult, 0.17, 124), "the ultimate higher");
  for (const count of [1, 2, 3, 4]) {
    const spots = arcSpots(count);
    assert.equal(spots.length, count);
    for (const spot of spots) {
      assert.ok(
        Math.hypot(spot.x, spot.y) >= 0.078,
        "clear of the attack button (0.095 W) and itself (0.06 W)"
      );
    }
    for (let i = 1; i < count; i += 1) {
      const gap = Math.hypot(spots[i].x - spots[i - 1].x, spots[i].y - spots[i - 1].y);
      assert.ok(gap >= 0.07, `the skills do not overlap (${gap.toFixed(3)} W)`);
    }
    assert.ok(spots.at(-1).x < -0.06, "none straight above the attack, where the tower button is");
  }
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
