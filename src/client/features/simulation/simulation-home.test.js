// The Recall and Recovery buttons of the player (simulation-home.js): a ring fills while the hero heads home, the
// Recovery glows while it gives health back and then cools down as the spell does.
import assert from "node:assert/strict";
import { test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";

installFakeDom({ pathname: "/simulation" });
const { homeToolsHtml, paintHome, spellArtHtml } = await import("./simulation-home.js");

// a button as paintHome sees it: its classes, its custom properties, its seconds
function fakeButton() {
  const classes = new Set();
  const props = new Map();
  return {
    element: {
      classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
      style: { setProperty: (name, value) => props.set(name, value) },
      disabled: false
    },
    time: { hidden: true, textContent: "" },
    state: null,
    classes,
    props
  };
}

const board = () => ({ home: { recall: fakeButton(), recover: fakeButton() } });

test("the two buttons sit in the tools row, Recall first, both pressable", () => {
  const html = homeToolsHtml();
  assert.ok(html.indexOf('data-sim="recall"') < html.indexOf('data-sim="recover"'));
  assert.equal(html.match(/<button type="button"/g).length, 2);
  assert.match(html, /aria-label="Recall"/);
  assert.match(html, /aria-label="Recovery"/);
});

test("the buttons wear the game's icons the bots server sends, and keep their glyph without them", () => {
  const art = {
    "ui-recall": "data:image/webp;base64,UkVD",
    "ui-recover": "data:image/webp;base64,SEVB"
  };
  const html = homeToolsHtml(art);
  assert.match(html, /<img class="sim-home__art" src="data:image\/webp;base64,UkVD" alt="">/);
  assert.match(html, /<img class="sim-home__art" src="data:image\/webp;base64,SEVB" alt="">/);
  assert.doesNotMatch(html, /<svg/, "no glyph under a picture");
  assert.match(homeToolsHtml({}), /<svg/);
  assert.doesNotMatch(
    homeToolsHtml({ "ui-recall": "javascript:alert(1)" }),
    /javascript:/,
    "only data pictures"
  );
});

test("the spell's button finds its picture in the catalogue, Punish under the name Smite", () => {
  const catalog = {
    spells: [
      { id: 2, name: "Flash", imageId: 41 },
      { id: 7, name: "Smite", imageId: 47 },
      { id: 4, name: "Heal", imageId: null }
    ]
  };
  assert.match(
    spellArtHtml(catalog, "flash"),
    /<img class="sim-spell__art" src="\/catalog-images\/41\?[^>]*alt=""/
  );
  assert.match(spellArtHtml(catalog, "punish"), /47/);
  assert.equal(spellArtHtml(catalog, "heal"), "", "no picture in the catalogue: the glyph stays");
  assert.equal(spellArtHtml(catalog, "stun"), "");
  assert.equal(spellArtHtml(null, "flash"), "");
});

test("while recalling the ring fills and the seconds count down; it empties when the recall stops", () => {
  const run = board();
  const { recall } = run.home;
  paintHome(run, { alive: true, recallLeft: 8 });
  assert.ok(recall.classes.has("is-recalling"));
  assert.equal(recall.props.get("--fill"), "0");
  assert.equal(recall.time.textContent, "8");
  paintHome(run, { alive: true, recallLeft: 2 });
  assert.equal(recall.props.get("--fill"), "0.75", "three quarters of the 8 s gone");
  assert.equal(recall.time.textContent, "2");
  paintHome(run, { alive: true, recallLeft: 0 });
  assert.ok(!recall.classes.has("is-recalling"));
  assert.equal(recall.props.get("--fill"), "0");
  assert.equal(recall.time.hidden, true);
});

test("the Recovery glows while it heals, then shows its cooldown and cannot be pressed", () => {
  const run = board();
  const { recover } = run.home;
  paintHome(run, { alive: true, recovering: true, recoveryLeft: 118 });
  assert.ok(recover.classes.has("is-recovering"));
  assert.ok(!recover.classes.has("is-cooling"), "no sweep while it heals");
  assert.equal(recover.element.disabled, true);
  paintHome(run, { alive: true, recovering: false, recoveryLeft: 100 });
  assert.ok(!recover.classes.has("is-recovering"));
  assert.ok(recover.classes.has("is-cooling"));
  assert.equal(recover.time.textContent, "100");
  assert.equal(recover.element.disabled, true);
  paintHome(run, { alive: true, recovering: false, recoveryLeft: 0 });
  assert.ok(!recover.classes.has("is-cooling"));
  assert.equal(recover.element.disabled, false);
});

test("a dead hero's buttons are off and show no seconds", () => {
  const run = board();
  paintHome(run, { alive: false, recallLeft: 5, recoveryLeft: 60 });
  assert.equal(run.home.recall.element.disabled, true);
  assert.equal(run.home.recover.element.disabled, true);
  assert.equal(run.home.recall.time.hidden, true);
  assert.equal(run.home.recover.time.hidden, true);
});
