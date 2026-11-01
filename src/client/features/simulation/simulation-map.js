// The map of a game, drawn in vector from the map the bots server sends: the ground, the river, the
// three lanes, the walls, the bushes, the bases, the towers, the camps and the objectives, and the fog
// of war over them. A player on the red side sees it turned half a turn, so his base is always at the
// bottom. Everything is in the map's own pixels (1024 a side); the colours are in the stylesheet.

const SIZE = 1024;
// the part of the map the board shows: the field with its walls and the fountains, not the scenery around
const FRAME = { from: 150, side: 724 };
const points = list => list.map(([x, y]) => `${x},${y}`).join(" ");

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

/** The ground, the river, the lanes, the walls and the bushes, drawn from the vector of the map. */
function vectorMarks(map, debug) {
  const tag = debug ? " sim-debug" : "";
  return `${debug ? "" : `<polygon class="sim-ground" points="${points(map.bounds)}"></polygon>`}
    ${map.river.map(part => `<polygon class="sim-river${tag}" points="${points(part)}"></polygon>`).join("")}
    ${Object.values(map.lanes)
      .map(line => `<polyline class="sim-lane${tag}" points="${points(line)}"></polyline>`)
      .join("")}
    ${map.walls.map(wall => `<polygon class="sim-wall${tag}" points="${points(wall)}"></polygon>`).join("")}
    ${map.bushes.map(bush => `<polygon class="sim-bush${tag}" points="${points(bush)}"></polygon>`).join("")}`;
}

/**
 * The map as an SVG, with an empty fog (simulation-paint.js cuts the eyes of the side into it). With
 * `image` (the picture of the map, on the same frame as its vector) the picture is the board and the
 * vector is left to the bots; `debug` (?debug=map) draws it over the picture, as outlines. `mini` is the
 * minimap's copy: its own fog and its own marks (data-mini-*), so that the field's are found alone.
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
  const ground = image
    ? `<image class="${mini ? "sim-mini__picture" : "sim-picture"}" href="${image}" x="0" y="0" width="${SIZE}" height="${SIZE}" preserveAspectRatio="none"></image>
    ${debug ? vectorMarks(map, true) : ""}`
    : `<rect class="sim-void" x="0" y="0" width="${SIZE}" height="${SIZE}"></rect>
    ${vectorMarks(map, false)}`;
  return `<svg class="${name}__svg" viewBox="${FRAME.from} ${FRAME.from} ${FRAME.side} ${FRAME.side}" aria-hidden="true" focusable="false">
  <defs><mask id="${name}-fog" maskUnits="userSpaceOnUse" x="0" y="0" width="${SIZE}" height="${SIZE}"><rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="white"></rect><g class="${mini ? "sim-mini-eyes" : "sim-eyes"}"></g></mask></defs>
  <g class="sim-world"${turn}>
    ${ground}
    ${baseMarks(map, mini, marks)}
    ${marks ? map.towers.map(tower => towerMark(tower, mini)).join("") : ""}
    ${marks ? map.camps.map(camp => campMark(camp, false, mini)).join("") : ""}
    ${marks ? map.neutral.map(camp => campMark(camp, true, mini)).join("") : ""}
    <rect class="sim-fog" x="0" y="0" width="${SIZE}" height="${SIZE}" mask="url(#${name}-fog)"></rect>
  </g>
</svg>`;
}

/** The eyes of a side cut into the fog: one black disc per eye (`{ at, radius }`), in map pixels. */
export const eyesMarkup = eyes =>
  eyes
    .map(
      eye =>
        `<circle cx="${Math.round(eye.at[0])}" cy="${Math.round(eye.at[1])}" r="${Math.round(eye.radius)}" fill="black"></circle>`
    )
    .join("");
