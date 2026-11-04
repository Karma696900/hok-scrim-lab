// The dots that stand on the tilted map: where the perspective draws a point of the map, and how large, and the dots
// of the towers, the crystals, the camps and the objectives.
import assert from "node:assert/strict";
import { test } from "node:test";
import { project, spotsHtml } from "./simulation-stand.js";

const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} ≠ ${expected}`);

test("the point the camera looks at stays where it is, at its size", () => {
  const at = project({ dx: 0, dy: 0, tilt: 40, depth: 900 });
  near(at.x, 0, "x");
  near(at.y, 0, "y");
  near(at.scale, 1, "scale");
});

test("a point farther up the map is drawn nearer the middle and smaller", () => {
  const at = project({ dx: 100, dy: -300, tilt: 40, depth: 900 });
  assert.ok(at.scale < 1, "smaller far away");
  assert.ok(at.x > 0 && at.x < 100, "pulled toward the middle");
  assert.ok(at.y < 0 && at.y > -300, "the tilt shortens the distance");
  // CSS rotateX then perspective: z = dy sin(tilt), scale = depth / (depth - z)
  const rad = (40 * Math.PI) / 180;
  const scale = 900 / (900 - -300 * Math.sin(rad));
  near(at.scale, scale, "scale");
  near(at.y, -300 * Math.cos(rad) * scale, "y");
});

test("a point nearer the bottom is drawn larger", () => {
  assert.ok(project({ dx: 0, dy: 200, tilt: 40, depth: 900 }).scale > 1);
});

test("a point behind the camera is not drawn", () => {
  assert.equal(project({ dx: 0, dy: 2000, tilt: 40, depth: 900 }), null);
});

const map = {
  towers: [{ id: "blue-mid-1", side: "blue", at: [420, 600] }],
  camps: [{ id: "blue-red", kind: "red-buff", at: [380, 640] }],
  neutral: [{ id: "tyrant", kind: "tyrant", at: [480, 560] }],
  bases: {
    blue: { crystal: [200, 820], fountain: [160, 860] },
    red: { crystal: [820, 200], fountain: [860, 160] }
  }
};

test("towers, crystals, camps and objectives are dots of the field, with their point and no inline style", () => {
  const html = spotsHtml(map);
  assert.match(
    html,
    /class="sim-spot sim-spot--tower sim-spot--blue sim-spot--piece" data-tower="blue-mid-1" data-at="420,600"/
  );
  assert.match(html, /data-crystal="blue" data-at="200,820"/);
  assert.match(html, /data-crystal="red"/);
  assert.match(html, /class="sim-spot sim-spot--camp sim-spot--red-buff" data-camp="blue-red"/);
  assert.match(html, /class="sim-spot sim-spot--objective sim-spot--tyrant" data-camp="tyrant"/);
  assert.equal((html.match(/<svg/g) ?? []).length, 5, "each dot shows its icon");
  assert.doesNotMatch(html, /style=/);
});

test("towers and crystals stand up, drawn in their side's colour, their foot on their point", () => {
  const html = spotsHtml(map);
  const tower = html.match(/<span class="sim-spot sim-spot--tower[\s\S]*?<\/span>/)[0];
  assert.match(tower, /<svg class="sim-figure sim-figure--tower"/);
  assert.match(tower, /#4d8df0/i, "blue");
  const red = html.match(
    /<span class="sim-spot sim-spot--crystal sim-spot--red[\s\S]*?<\/span>/
  )[0];
  assert.match(red, /<svg class="sim-figure sim-figure--crystal"/);
  assert.match(red, /#e5573f/i, "red");
  assert.match(html, /sim-spot--crystal sim-spot--blue sim-spot--piece/);
  // whole while it stands, its rubble once fallen (the stylesheet shows one or the other)
  assert.match(tower, /class="sim-figure__whole"/);
  assert.match(tower, /class="sim-figure__rubble"/);
  assert.match(tower, /class="sim-figure__glow"/);
});

// a 1-pixel WebP picture, as the bots server sends the monsters' pictures
const PIXEL = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
const art = Object.fromEntries(
  ["boar", "boarling", "tyrant", "shadow-tyrant"].map(kind => [`monster-${kind}`, PIXEL])
);
const withMonsters = {
  ...map,
  camps: [
    {
      id: "blue-camp-2",
      kind: "camp",
      at: [490, 636],
      monsters: ["boar", "boarling", "boarling", "boarling"]
    }
  ],
  neutral: [{ id: "tyrant", kind: "tyrant", at: [480, 560], monsters: ["tyrant"] }]
};

test("a camp whose monsters have their pictures shows one dot a monster, with its picture, and no icon", () => {
  const html = spotsHtml(withMonsters, art);
  const camp =
    html.match(
      /<span class="sim-spot sim-spot--camp[^"]*" data-camp="blue-camp-2"[^>]*>.*?<\/span><\/span>/
    )?.[0] ?? "";
  assert.match(camp, /sim-spot--monsters/);
  assert.match(camp, /data-count="4"/);
  assert.equal((camp.match(/class="sim-monster sim-monster--boar"/g) ?? []).length, 1);
  assert.equal((camp.match(/class="sim-monster sim-monster--boarling"/g) ?? []).length, 3);
  assert.equal((camp.match(/<img alt="" src="data:image\/webp;base64,/g) ?? []).length, 4);
  assert.doesNotMatch(camp, /<svg/);
  assert.doesNotMatch(html, /style=/);
});

test("the Tyrant carries its shadow picture too, shown once it turns into the Shadow Tyrant", () => {
  const html = spotsHtml(withMonsters, art);
  assert.match(
    html,
    /data-camp="tyrant"[^>]*><span class="sim-monster sim-monster--tyrant"><img alt="" src="[^"]+"><img class="sim-monster__shadow" alt="" src="[^"]+">/
  );
});

test("without a picture for each of its monsters (an older server, a doubtful address), a camp keeps its icon", () => {
  const html = spotsHtml(withMonsters, {
    "monster-boar": PIXEL,
    "monster-boarling": "javascript:alert(1)"
  });
  assert.doesNotMatch(html, /sim-monster/);
  assert.doesNotMatch(html, /javascript/);
  assert.equal((spotsHtml(withMonsters).match(/<svg/g) ?? []).length, 5);
});
