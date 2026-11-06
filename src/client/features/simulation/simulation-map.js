// The map of a game, drawn in vector from the map the bots server sends: the ground, the river, the
// three lanes, the walls, the bushes, the bases, the towers, the camps and the objectives, and the fog
// of war over them. A player on the red side sees it turned half a turn, so his base is always at the
// bottom. Everything is in the map's own pixels (1024 a side). The field draws its ground with its matter and
// relief (simulation-terrain.js) and its fog on a sheet of its own; the minimap keeps flat colours (the stylesheet).
import { portalRingSvg } from "./simulation-portal.js";
import { terrainDefs, terrainMarks } from "./simulation-terrain.js";

const SIZE = 1024;
// the part of the map the board shows: the field with its walls and the fountains, not the scenery around
const FRAME = { from: 150, side: 724 };
const points = list => list.map(([x, y]) => `${x},${y}`).join(" ");

/** A length of the map (its pixels) as a share of the board's side (0..100). */
export const boardShare = length => (length / FRAME.side) * 100;

/** Where a point of the map is drawn, as shares of the board (0..100), turned for the red side. */
export function placeOnBoard([x, y], side) {
  const [px, py] = side === "red" ? [SIZE - x, SIZE - y] : [x, y];
  return [((px - FRAME.from) / FRAME.side) * 100, ((py - FRAME.from) / FRAME.side) * 100];
}

/** The map point drawn at shares `[x, y]` of the board (0..100, kept inside), the reverse of placeOnBoard. */
export function mapPointOf([x, y], side) {
  const inside = share => FRAME.from + (Math.min(100, Math.max(0, share)) / 100) * FRAME.side;
  const [px, py] = [inside(x), inside(y)];
  return side === "red" ? [SIZE - px, SIZE - py] : [px, py];
}

const towerMark = (tower, mini) =>
  `<rect class="sim-tower sim-tower--${tower.side}" ${mini ? "data-mini-tower" : "data-tower"}="${tower.id}" x="${tower.at[0] - 9}" y="${tower.at[1] - 9}" width="18" height="18" rx="3"></rect>`;

const campMark = (camp, neutral, mini) =>
  `<circle class="sim-camp sim-camp--${camp.kind}${neutral ? " sim-camp--neutral" : ""}" ${mini ? "data-mini-camp" : "data-camp"}="${camp.id}" cx="${camp.at[0]}" cy="${camp.at[1]}" r="${neutral ? 16 : 9}"></circle>`;

function baseMarks(map, mini, marks) {
  return ["blue", "red"]
    .map(side => {
      const { crystal, fountain } = map.bases[side];
      const ground = `<circle class="sim-fountain sim-fountain--${side}" cx="${fountain[0]}" cy="${fountain[1]}" r="34"></circle>`;
      return marks
        ? `${ground}<rect class="sim-crystal sim-crystal--${side}" ${mini ? "data-mini-crystal" : "data-crystal"}="${side}" x="${crystal[0] - 15}" y="${crystal[1] - 15}" width="30" height="30" transform="rotate(45 ${crystal[0]} ${crystal[1]})"></rect>`
        : ground;
    })
    .join("");
}

/**
 * The ground, the river, the lanes, the walls and the bushes, drawn from the vector of the map: as in the game, a
 * green gorge, the river with its lighter bank, the lanes as stone paths with a darker edge (drawn first, under all
 * the paths). Over a picture (`debug`), outlines only.
 */
function vectorMarks(map, debug) {
  const tag = debug ? " sim-debug" : "";
  const lanes = Object.values(map.lanes);
  const under = (name, list, shape) =>
    debug
      ? ""
      : list.map(line => `<${shape} class="${name}" points="${points(line)}"></${shape}>`).join("");
  return `${debug ? "" : `<polygon class="sim-ground" points="${points(map.bounds)}"></polygon>`}
    ${under("sim-river-bank", map.river, "polygon")}
    ${map.river.map(part => `<polygon class="sim-river${tag}" points="${points(part)}"></polygon>`).join("")}
    ${under("sim-lane-edge", lanes, "polyline")}
    ${lanes.map(line => `<polyline class="sim-lane${tag}" points="${points(line)}"></polyline>`).join("")}
    ${map.walls.map(wall => `<polygon class="sim-wall${tag}" points="${points(wall)}"></polygon>`).join("")}
    ${map.bushes.map(bush => `<polygon class="sim-bush${tag}" points="${points(bush)}"></polygon>`).join("")}`;
}

const fogMask = name =>
  `<mask id="${name}-fog" maskUnits="userSpaceOnUse" x="0" y="0" width="${SIZE}" height="${SIZE}"><rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="white"></rect><g class="${name === "sim-mini" ? "sim-mini-eyes" : "sim-eyes"}"></g></mask>`;
// an eye's edge fades out instead of a hard circle (the minimap's eyes use it too)
const EYE_EDGE = `<radialGradient id="sim-eye"><stop offset="0.8" stop-color="black"></stop><stop offset="1" stop-color="black" stop-opacity="0"></stop></radialGradient>`;

/**
 * The map as an SVG, with an empty fog (simulation-paint.js cuts the eyes of the side into it). With
 * `image` (the picture of the map, on the same frame as its vector) the picture is the board and the
 * vector is left to the bots; `debug` (?debug=map) draws it over the picture, as outlines. `mini` is the
 * minimap's copy: one sheet, flat colours, its own fog and its own marks (data-mini-*), so that the field's are
 * found alone. The field is two sheets: the ground, and the fog over it.
 * `marks: false` leaves out the towers, the crystals and the camps (a game by hand draws them as standing dots,
 * simulation-stand.js).
 */
export function mapSvg(
  map,
  side,
  { image = null, debug = false, mini = false, marks = true } = {}
) {
  const name = mini ? "sim-mini" : "sim-map";
  const turn = side === "red" ? ` transform="rotate(180 ${SIZE / 2} ${SIZE / 2})"` : "";
  const box = `viewBox="${FRAME.from} ${FRAME.from} ${FRAME.side} ${FRAME.side}" aria-hidden="true" focusable="false"`;
  const art = !image && !mini;
  const ground = image
    ? `<image class="${mini ? "sim-mini__picture" : "sim-picture"}" href="${image}" x="0" y="0" width="${SIZE}" height="${SIZE}" preserveAspectRatio="none"></image>
    ${debug ? vectorMarks(map, true) : ""}`
    : art
      ? terrainMarks(map, side)
      : `<rect class="sim-void" x="0" y="0" width="${SIZE}" height="${SIZE}"></rect>
    ${vectorMarks(map, false)}`;
  // the Sprite portal's circle lies on the ground of the field (lit while open: simulation-portal.js)
  const pieces = `${mini ? "" : portalRingSvg(map.portal)}${baseMarks(map, mini, marks)}
    ${marks ? map.towers.map(tower => towerMark(tower, mini)).join("") : ""}
    ${marks ? map.camps.map(camp => campMark(camp, false, mini)).join("") : ""}
    ${marks ? map.neutral.map(camp => campMark(camp, true, mini)).join("") : ""}`;
  const fog = `<rect class="sim-fog" x="0" y="0" width="${SIZE}" height="${SIZE}" mask="url(#${name}-fog)"></rect>`;
  if (mini) {
    return `<svg class="sim-mini__svg" ${box}>
  <defs>${fogMask(name)}</defs>
  <g class="sim-world"${turn}>${ground}${pieces}${fog}</g>
</svg>`;
  }
  return `<svg class="sim-map__svg" ${box}>
  ${art ? `<defs>${terrainDefs()}</defs>` : ""}
  <g class="sim-world"${turn}>${ground}${pieces}</g>
</svg><svg class="sim-map__fog" ${box}>
  <defs>${EYE_EDGE}${fogMask(name)}</defs>
  <g class="sim-world"${turn}>${fog}</g>
</svg>`;
}

/** The eyes of a side cut into the fog: one disc per eye (`{ at, radius }`, map pixels), its edge fading. */
export const eyesMarkup = eyes =>
  eyes
    .map(
      eye =>
        `<circle cx="${Math.round(eye.at[0])}" cy="${Math.round(eye.at[1])}" r="${Math.round(eye.radius)}" fill="url(#sim-eye)"></circle>`
    )
    .join("");
