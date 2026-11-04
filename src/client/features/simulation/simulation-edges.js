// The edges of the field's shapes, so no outline is a straight cut: round treetops (or tufts of tall grass) spilling
// over the outline of the walls and the bushes, curb stones and grass along the lanes' verges, foam along the banks
// of the river. Drawn by us, from the vector the bots server sends; the same at every game (a fixed seed per shape).
import { insidePolygon, seeded } from "./simulation-decor.js";

const round = n => Math.round(n * 10) / 10;

// how far `point` is from the closed outline `shape`
function outlineGap([x, y], shape) {
  let best = Infinity;
  for (let i = 0; i < shape.length; i += 1) {
    const [ax, ay] = shape[i];
    const [bx, by] = shape[(i + 1) % shape.length];
    const span = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / span));
    best = Math.min(best, Math.hypot(ax + (bx - ax) * t - x, ay + (by - ay) * t - y));
  }
  return best;
}

const seedOf = shape => seeded(Math.round(shape[0][0] * 7919 + shape[0][1] * 104729));

/**
 * The crowns along the closed outline `shape`, one every `every` map pixels, of about `size` pixels:
 * `[{ x, y, r }]`, the same at every game. A little in or out of the edge; with `inside`, each held whole within
 * the outline (none where the outline is too narrow for it), so nothing is drawn over the open ground.
 */
export function crownsAlong(shape, { every, size, inside = false }) {
  const random = seedOf(shape);
  const crowns = [];
  let walked = every / 2;
  for (let i = 0; i < shape.length; i += 1) {
    const [ax, ay] = shape[i];
    const [bx, by] = shape[(i + 1) % shape.length];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    let [nx, ny] = [-(by - ay) / length, (bx - ax) / length];
    if (inside && !insidePolygon([(ax + bx) / 2 + nx, (ay + by) / 2 + ny], shape)) {
      [nx, ny] = [-nx, -ny];
    }
    for (; walked < length; walked += every) {
      const t = walked / length;
      const r = round(size * (0.75 + random() * 0.5));
      const push = inside ? r + 0.3 + random() * 1.5 : (random() - 0.5) * 4;
      const crown = {
        x: round(ax + (bx - ax) * t + nx * push),
        y: round(ay + (by - ay) * t + ny * push),
        r
      };
      if (
        !inside ||
        (insidePolygon([crown.x, crown.y], shape) && outlineGap([crown.x, crown.y], shape) >= r)
      ) {
        crowns.push(crown);
      }
    }
    walked -= length;
  }
  return crowns;
}

/** Tufts over the inside of the closed outline `shape`, about one every `every` map pixels, 3 px from its edge. */
export function tuftsWithin(shape, { every, size }) {
  const random = seedOf(shape);
  const xs = shape.map(point => point[0]);
  const ys = shape.map(point => point[1]);
  const tufts = [];
  for (let y = Math.min(...ys) + every / 2; y < Math.max(...ys); y += every) {
    for (let x = Math.min(...xs) + every / 2; x < Math.max(...xs); x += every) {
      const point = [
        round(x + (random() - 0.5) * every * 0.6),
        round(y + (random() - 0.5) * every * 0.6)
      ];
      const r = round(size * (0.75 + random() * 0.5));
      if (insidePolygon(point, shape) && outlineGap(point, shape) >= 3) {
        tufts.push({ x: point[0], y: point[1], r });
      }
    }
  }
  return tufts;
}

// a disc as two arcs, so thousands of them make one path
const disc = (x, y, r) =>
  `M${round(x - r)} ${round(y)}a${r} ${r} 0 1 0 ${round(2 * r)} 0a${r} ${r} 0 1 0 ${round(-2 * r)} 0`;

/**
 * The crowns drawn: round treetops (a shaded disc and its lit side, toward the light: up the screen, so up the map
 * for blue and down it for red, `dir` -1) or, with `tuft`, three blades of grass standing up the screen. One path
 * per colour whatever their number: the field is painted again in tiles as the camera moves, and few paths paint
 * faster than many small shapes.
 */
export function crownsMarks(crowns, { shade, light, dir = 1, tuft = false }) {
  if (tuft) {
    const d = crowns
      .map(
        ({ x, y, r }) =>
          `M${round(x - 0.5 * r)} ${y}q${round(-0.2 * r)} ${round(-dir * 0.8 * r)} ${round(-0.7 * r)} ${round(-dir * 1.3 * r)}M${x} ${y}q${round(0.1 * r)} ${round(-dir * 1.2 * r)} ${round(0.4 * r)} ${round(-dir * 2.3 * r)}M${round(x + 0.5 * r)} ${y}q${round(0.2 * r)} ${round(-dir * 0.6 * r)} ${round(0.8 * r)} ${round(-dir * 1.1 * r)}`
      )
      .join("");
    const width = round(0.35 * (crowns[0]?.r ?? 1));
    return `<path class="sim-tufts" d="${d}" fill="none" stroke="${light}" stroke-width="${width}" stroke-linecap="round"></path>`;
  }
  const shades = crowns.map(({ x, y, r }) => disc(x, y, r)).join("");
  const lights = crowns
    .map(({ x, y, r }) => disc(x - dir * r * 0.25, y - dir * r * 0.32, round(r * 0.58)))
    .join("");
  return `<path class="sim-crowns" d="${shades}" fill="${shade}"></path><path d="${lights}" fill="${light}"></path>`;
}

const points = line => line.map(([x, y]) => `${x},${y}`).join(" ");

/** The width of a lane's paving, in map pixels: the game's lanes are wide flagstone roads. */
export const LANE = 44;

/**
 * The trim of the lanes: `curbs` (pale stones in a dashed line, drawn under the paving so only their verges show),
 * `verges` (grass tufts over a band along each edge of the paving) and their `defs` (the tufts and the band's mask).
 */
export function laneTrim(lanes) {
  const lines = Object.values(lanes);
  const stroke = (colour, width) =>
    lines
      .map(
        line =>
          `<polyline points="${points(line)}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"></polyline>`
      )
      .join("");
  // small blades in little clumps, the grass of the field creeping over the verge
  const tufts = [
    [2, 5, -0.6, -2.4],
    [3, 5, 0, -2.8],
    [4, 5, 0.6, -2.2],
    [9, 11, -0.5, -2],
    [10, 11, 0.5, -2.4],
    [6, 1.5, 0.4, -1.8]
  ]
    .map(
      ([x, y, dx, dy]) =>
        `<path d="M${x} ${y}l${dx} ${dy}" stroke="#79b145" stroke-width="0.8" stroke-linecap="round"/>`
    )
    .join("");
  const defs = `<pattern id="sim-t-tufts" patternUnits="userSpaceOnUse" width="12" height="12"><ellipse cx="3" cy="5" rx="2" ry="0.8" fill="#6aa23c" opacity="0.8"/><ellipse cx="9.5" cy="11" rx="1.6" ry="0.7" fill="#6aa23c" opacity="0.8"/>${tufts}</pattern><mask id="sim-t-verge" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">${stroke("#fff", LANE + 12)}${stroke("#000", LANE - 6)}</mask>`;
  const curbs = lines
    .map(
      line =>
        `<polyline class="sim-lane-curb" points="${points(line)}" fill="none" stroke="#c8bf9c" stroke-width="${LANE + 4}" stroke-dasharray="7 3" stroke-linejoin="round"></polyline>`
    )
    .join("");
  const verges = `<rect class="sim-verge" x="0" y="0" width="1024" height="1024" fill="url(#sim-t-tufts)" mask="url(#sim-t-verge)"></rect>`;
  return { defs, curbs, verges };
}

/** The foam along the bank of the river's part `part` (number `index`), clipped to the water. */
export const bankFoam = (part, index) =>
  `<g clip-path="url(#sim-t-river-${index})"><polygon class="sim-foam" points="${points(part)}" fill="none" stroke="#e8f6f4" stroke-width="2.6" stroke-dasharray="12 5 3 7" stroke-linejoin="round" opacity="0.42"></polygon></g>`;
