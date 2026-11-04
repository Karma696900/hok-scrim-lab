// The edges of the field's shapes (simulation-edges.js): the round treetops and grass tufts that spill over the
// outline of the walls and the bushes, the curb stones and the grass of the lanes' verges, the foam along the banks.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bankFoam, crownsAlong, crownsMarks, laneTrim, tuftsWithin } from "./simulation-edges.js";

const SQUARE = [
  [100, 100],
  [200, 100],
  [200, 200],
  [100, 200]
];

function outlineGap([x, y]) {
  // distance to the square's outline
  const inside = x >= 100 && x <= 200 && y >= 100 && y <= 200;
  const dx = Math.max(100 - x, 0, x - 200);
  const dy = Math.max(100 - y, 0, y - 200);
  return inside ? Math.min(x - 100, 200 - x, y - 100, 200 - y) : Math.hypot(dx, dy);
}

test("crowns line the whole outline, one every few pixels, each on the edge", () => {
  const crowns = crownsAlong(SQUARE, { every: 16, size: 7 });
  // 400 px of outline, one every 16 px
  assert.ok(crowns.length >= 22 && crowns.length <= 28, `${crowns.length} crowns`);
  for (const { x, y, r } of crowns) {
    assert.ok(outlineGap([x, y]) <= 4, `${x},${y} on the edge`);
    assert.ok(r >= 7 * 0.7 && r <= 7 * 1.3, `${r} near the size`);
  }
});

test("held inside, the crowns never spill over the outline onto the open ground, whatever way it turns", () => {
  for (const shape of [SQUARE, [...SQUARE].reverse()]) {
    for (const { x, y, r } of crownsAlong(shape, { every: 8, size: 4, inside: true })) {
      const inside = x > 100 && x < 200 && y > 100 && y < 200;
      assert.ok(inside && outlineGap([x, y]) >= r - 0.2, `${x},${y} r ${r} within the outline`);
    }
  }
});

test("tufts fill the inside of a bush, a little away from its edge", () => {
  const tufts = tuftsWithin(SQUARE, { every: 10, size: 1.6 });
  // 100 x 100, one every 10 px
  assert.ok(tufts.length >= 70 && tufts.length <= 110, `${tufts.length} tufts`);
  for (const { x, y } of tufts) {
    assert.ok(x > 100 && x < 200 && y > 100 && y < 200 && outlineGap([x, y]) >= 3, `${x},${y}`);
  }
  assert.deepEqual(tufts, tuftsWithin(SQUARE, { every: 10, size: 1.6 }));
});

test("the same crowns at every game", () => {
  assert.deepEqual(
    crownsAlong(SQUARE, { every: 16, size: 7 }),
    crownsAlong(SQUARE, { every: 16, size: 7 })
  );
});

test("all the treetops are two paths, the shade and its lit side, however many there are", () => {
  const crowns = crownsAlong(SQUARE, { every: 4, size: 3 });
  const svg = crownsMarks(crowns, { shade: "#2e5426", light: "#3f6c31" });
  assert.equal((svg.match(/<path /g) ?? []).length, 2);
  assert.match(svg, /class="sim-crowns" [^>]*fill="#2e5426"/);
  assert.match(svg, /fill="#3f6c31"/);
  // one round arc pair per crown
  assert.equal((svg.match(/a/g) ?? []).length >= crowns.length * 4, true);
});

test("the tall grass's edge is tufts of blades standing up the screen, in one path", () => {
  const crowns = crownsAlong(SQUARE, { every: 6, size: 2 });
  const blue = crownsMarks(crowns, { light: "#7ab94f", tuft: true });
  assert.equal((blue.match(/<path /g) ?? []).length, 1);
  assert.match(blue, /class="sim-tufts"/);
  // the end of the first blade, from its foot
  const rise = svg =>
    Number(svg.match(/ d="M[\d.]+ [\d.]+q-?[\d.]+ -?[\d.]+ -?[\d.]+ (-?[\d.]+)/)[1]);
  assert.ok(rise(blue) < 0, "up the map for blue");
  const red = crownsMarks(crowns, { light: "#7ab94f", tuft: true, dir: -1 });
  assert.ok(rise(red) > 0, "down the map for red, who sees it turned");
});

test("the lanes get curb stones on both verges and grass spilling over them, in a band along each edge", () => {
  const lanes = {
    mid: [
      [0, 0],
      [100, 100]
    ]
  };
  const { defs, curbs, verges } = laneTrim(lanes);
  assert.match(curbs, /<polyline class="sim-lane-curb" points="0,0 100,100"[^>]*stroke-dasharray=/);
  // the band: everything under a wide stroke, minus the paved middle
  assert.match(defs, /<mask id="sim-t-verge"/);
  // wider than the paving by a few pixels on each side
  assert.match(defs, /stroke="#fff"[^>]*stroke-width="5\d"|stroke-width="5\d"[^>]*stroke="#fff"/);
  assert.match(defs, /stroke="#000"/);
  assert.match(verges, /mask="url\(#sim-t-verge\)"/);
  assert.match(verges, /fill="url\(#sim-t-tufts\)"/);
});

test("foam runs along each bank, inside the water only", () => {
  const foam = bankFoam(SQUARE, 2);
  assert.match(foam, /clip-path="url\(#sim-t-river-2\)"/);
  assert.match(foam, /class="sim-foam"/);
  assert.match(foam, /stroke-dasharray=/);
});
