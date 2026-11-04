// The ground of the field, drawn as the game draws its map, from the vector the bots server sends and with our own
// drawings only (no picture of the game: the site is open source). A light grass, wide lanes of pale flagstones that
// open into a paved place at each base, a low stone wall round the field with the blue-flowered woods beyond, a bright
// turquoise river between rocky banks, shallow over its sandy bed. The walls are pale rocks with moss on top, standing
// up with their face toward the camera (below them on the screen; the red side sees the map turned, so its faces go
// up the map); the bushes are tall grass on the ground. The camps and the great monsters' pits stand on stone
// platforms. The tiles are in simulation-tiles.js. The minimap keeps flat colours (simulation-map.js).

import { decorMarks } from "./simulation-decor.js";
import {
  bankFoam,
  crownsAlong,
  crownsMarks,
  laneTrim,
  LANE,
  tuftsWithin
} from "./simulation-edges.js";

export { terrainDefs } from "./simulation-tiles.js";

const points = list => list.map(([x, y]) => `${x},${y}`).join(" ");

// how high a wall stands, in map pixels (the bushes are tall grass you walk into: flat on the ground)
const WALL_HEIGHT = 7;

// how far a base's paved place reaches from its fountain, in map pixels
const PLAZA = 150;

/**
 * A raised wall: its foot on its true outline (where the bots stop), its top lifted `height` up the screen, and, in
 * one path, every side swept from the foot to the top: the face the camera sees. Drawn under a cut to the walls' true
 * outlines (terrainMarks), so nothing of a wall covers open ground and a passage looks as wide as it is.
 */
function raised(shape, { dir, height, face, faceDark, top, rim, name }) {
  const list = points(shape);
  const lift = (-dir * height).toFixed(1);
  const sides = shape
    .map((point, i) => {
      const [ax, ay] = point;
      const [bx, by] = shape[(i + 1) % shape.length];
      return `M${ax} ${ay}L${bx} ${by}L${bx} ${(by - dir * height).toFixed(1)}L${ax} ${(ay - dir * height).toFixed(1)}Z`;
    })
    .join("");
  const foot = `<polygon class="${name}-face" points="${list}" fill="${faceDark}"></polygon>`;
  return `${foot}<path class="${name}-sides" d="${sides}" fill="${face}"></path><polygon class="${name}" transform="translate(0 ${lift})" points="${list}" fill="${top}" stroke="${rim}" stroke-width="2" stroke-linejoin="round"></polygon>`;
}

/** The river: rocky banks, its sandy bed seen through the bright, shallow water, ripples, glints and foam. */
function riverMarks(map) {
  return map.river
    .map((part, i) => {
      const list = points(part);
      return `<clipPath id="sim-t-river-${i}"><polygon points="${list}"></polygon></clipPath>
      <polygon class="sim-river-bank" points="${list}" fill="none" stroke="#6f7d77" stroke-width="18" stroke-linejoin="round"></polygon>
      <polygon class="sim-river-rocks" points="${list}" fill="none" stroke="#b9c5bd" stroke-width="11" stroke-dasharray="6 5 9 4" stroke-linecap="round" stroke-linejoin="round"></polygon>
      <polygon class="sim-river-bed" points="${list}" fill="url(#sim-t-bed)"></polygon>
      <polygon class="sim-river" points="${list}" fill="#3cc0c8" fill-opacity="0.62"></polygon>
      <g clip-path="url(#sim-t-river-${i})"><polygon points="${list}" fill="none" stroke="#a8e6e6" stroke-width="9" stroke-linejoin="round" opacity="0.5"></polygon><polygon points="${list}" fill="url(#sim-t-ripple)"></polygon><polygon points="${list}" fill="url(#sim-t-glint)"></polygon></g>${bankFoam(part, i)}`;
    })
    .join("");
}

/** The stone platforms: one under each camp, a wider one round each great monster's sunken pit. */
function platformMarks(map) {
  const pits = map.neutral
    .map(
      ({ at: [x, y] }) =>
        `<circle class="sim-platform" cx="${x}" cy="${y}" r="40" fill="url(#sim-t-platform)" stroke="#7f887e" stroke-width="3"></circle><circle class="sim-pit" cx="${x}" cy="${y}" r="30" fill="url(#sim-t-pit)" stroke="#a9b1a6" stroke-width="3"></circle><circle cx="${x}" cy="${y}" r="19" fill="none" stroke="#8c958b" stroke-width="2" stroke-dasharray="5 4"></circle>`
    )
    .join("");
  const camps = map.camps
    .map(
      ({ at: [x, y] }) =>
        `<circle class="sim-clearing" cx="${x}" cy="${y}" r="17" fill="url(#sim-t-platform)" stroke="#7f887e" stroke-width="2"></circle>`
    )
    .join("");
  return camps + pits;
}

/** Each base: a wide paved place in its corner, cut to the field, with its inlaid rings and its fountain's glow. */
function plazaMarks(map) {
  return ["blue", "red"]
    .map(team => {
      const [x, y] = map.bases[team].fountain;
      const [cx, cy] = map.bases[team].crystal;
      return `<circle class="sim-plaza" cx="${x}" cy="${y}" r="${PLAZA}" fill="url(#sim-t-stone)" stroke="#b9b08c" stroke-width="5" clip-path="url(#sim-t-field)"></circle><g clip-path="url(#sim-t-field)" fill="none" stroke="#f3eedb" opacity="0.75"><circle cx="${x}" cy="${y}" r="${PLAZA - 40}" stroke-width="3"></circle><circle cx="${x}" cy="${y}" r="${PLAZA - 85}" stroke-width="2"></circle></g><circle cx="${cx}" cy="${cy}" r="26" fill="none" stroke="#f3eedb" stroke-width="2.5" opacity="0.8"></circle><circle cx="${x}" cy="${y}" r="20" fill="#cfd6cc" stroke="#f3eedb" stroke-width="3"></circle><circle class="sim-fountain" cx="${x}" cy="${y}" r="30" fill="url(#sim-t-fountain-${team})"></circle>`;
    })
    .join("");
}

/** The walls, pale rocks standing on their true outline with moss on their top, and their light shadow. */
function wallMarks(map, dir) {
  const walls = map.walls
    .map(wall =>
      raised(wall, {
        dir,
        height: WALL_HEIGHT,
        face: "url(#sim-t-cliff)",
        faceDark: "#56635e",
        top: "url(#sim-t-rock)",
        rim: "#d3ddd5",
        name: "sim-wall"
      })
    )
    .join("");
  // a light shadow of each wall on the ground, down the screen
  const shadows = map.walls
    .map(
      wall =>
        `<polygon class="sim-wall-shadow" transform="translate(2.5 ${(dir * 2).toFixed(1)})" points="${points(wall)}" fill="#24401a" opacity="0.22"></polygon>`
    )
    .join("");
  // the moss rides on the walls' lifted tops, held within them
  const moss = `<g transform="translate(0 ${(-dir * WALL_HEIGHT).toFixed(1)})">${crownsMarks(
    map.walls.flatMap(wall => crownsAlong(wall, { every: 11, size: 2.6, inside: true })),
    { shade: "#5a9440", light: "#76ab4e", dir }
  )}</g>`;
  const cut = `<clipPath id="sim-t-walls">${map.walls.map(wall => `<polygon points="${points(wall)}"></polygon>`).join("")}</clipPath>`;
  return `${shadows}${cut}<g class="sim-walls" clip-path="url(#sim-t-walls)">${walls}${moss}</g>`;
}

/** The bushes: tall grass on the ground, a soft rim and blades all over, nothing standing out of them. */
function bushMarks(map, dir) {
  const bushes = map.bushes
    .map(
      bush =>
        `<polygon class="sim-bush" points="${points(bush)}" fill="url(#sim-t-bush)" stroke="#86bf55" stroke-width="1.5" stroke-linejoin="round" stroke-opacity="0.8"></polygon>`
    )
    .join("");
  const tufts = crownsMarks(
    map.bushes.flatMap(bush => tuftsWithin(bush, { every: 5, size: 1.6 })),
    { light: "#9ad062", dir, tuft: true }
  );
  return bushes + tufts;
}

/**
 * The ground of the field for the `side` that looks at it (its camera looks up the map for blue, down for red): every
 * layer in order, under the bases and the pieces.
 */
export function terrainMarks(map, side) {
  const dir = side === "red" ? -1 : 1;
  const decor = decorMarks(map, side);
  const lanes = Object.values(map.lanes);
  const field = points(map.bounds);
  const trim = laneTrim(map.lanes);
  // the field's low stone wall on its outline, its blocks' joints, and its dark foot: the ground covers its inner half
  const rim = `<polygon points="${field}" fill="none" stroke="#56615a" stroke-width="30" stroke-linejoin="round"></polygon><polygon class="sim-rim" points="${field}" fill="none" stroke="#c9cfc2" stroke-width="22" stroke-linejoin="round"></polygon><polygon points="${field}" fill="none" stroke="#9aa293" stroke-width="22" stroke-dasharray="1 13"></polygon>`;
  return `<rect class="sim-void" x="0" y="0" width="1024" height="1024" fill="url(#sim-t-forest)"></rect>
    ${rim}<clipPath id="sim-t-field"><polygon points="${field}"></polygon></clipPath>
    <polygon class="sim-ground" points="${field}" fill="url(#sim-t-grass)"></polygon>
    <polygon points="${field}" fill="url(#sim-t-tone)"></polygon>
    <polygon points="${field}" fill="url(#sim-t-patches)"></polygon>
    <defs>${trim.defs}</defs>
    ${platformMarks(map)}${riverMarks(map)}${decor.ground}
    ${lanes.map(line => `<polyline class="sim-lane-edge" points="${points(line)}" stroke="#b5ab86" stroke-width="${LANE + 8}" opacity="0.7"></polyline>`).join("")}
    ${trim.curbs}
    ${lanes.map(line => `<polyline class="sim-lane" points="${points(line)}" stroke="url(#sim-t-stone)" stroke-width="${LANE}"></polyline>`).join("")}
    ${plazaMarks(map)}${trim.verges}${decor.standing}${wallMarks(map, dir)}${bushMarks(map, dir)}`;
}
