// The small things that make the field look lived in, drawn by us and scattered from a fixed seed (the same at
// every game): rocks, shrubs and flowers on the grass (never on a lane, in a wall, in a bush or in the water), lily
// pads on the river, stone posts along the lanes, and the runes of each side round its fountain. The rocks, shrubs
// and posts stand a little: their shadow falls down the screen (up the map for the red side, which sees it turned).
// `ground` lies under the walls; `standing` is drawn over the lanes.

const SEED = 20261104;
const TRIES = 1100;
const LILY_TRIES = 160;
const POST_EVERY = 72;
const POST_SIDE = 21;
const TONES = { blue: "#5b9cf2", red: "#ef6a52" };

/** A generator of numbers in [0, 1) from a seed (mulberry32): the same list at every game. */
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Whether `point` lies inside the polygon `shape` (even-odd rule). */
export function insidePolygon([x, y], shape) {
  let inside = false;
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i, i += 1) {
    const [xi, yi] = shape[i];
    const [xj, yj] = shape[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentGap([x, y], [ax, ay], [bx, by]) {
  const span = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / span));
  return Math.hypot(ax + (bx - ax) * t - x, ay + (by - ay) * t - y);
}

const lineGap = (point, line, closed = false) => {
  let best = Infinity;
  const last = closed ? line.length : line.length - 1;
  for (let i = 0; i < last; i += 1) {
    best = Math.min(best, segmentGap(point, line[i], line[(i + 1) % line.length]));
  }
  return best;
};

/** How far `point` is from the nearest lane (map pixels). */
export const laneGap = (point, lanes) =>
  Math.min(...Object.values(lanes).map(line => lineGap(point, line)));

const round = n => Math.round(n * 10) / 10;
const at = ([x, y]) => `data-at="${round(x)},${round(y)}"`;

function rock([x, y], size, dir) {
  const r = round(size);
  const shadow = `<ellipse class="sim-rock-shadow" cx="${round(x + size * 0.4)}" cy="${round(y + dir * size * 0.7)}" rx="${r}" ry="${round(size * 0.55)}" fill="#0b1508" opacity="0.3"></ellipse>`;
  return `${shadow}<g class="sim-rock" ${at([x, y])}><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${round(size * 0.8)}" fill="#8e9b93"></ellipse><ellipse cx="${round(x - size * 0.2)}" cy="${round(y - dir * size * 0.25)}" rx="${round(size * 0.6)}" ry="${round(size * 0.42)}" fill="#c3ccc4"></ellipse></g>`;
}

function shrub([x, y], size, dir) {
  const r = round(size);
  const shadow = `<ellipse cx="${round(x + size * 0.4)}" cy="${round(y + dir * size * 0.8)}" rx="${round(size * 1.2)}" ry="${round(size * 0.6)}" fill="#0b1508" opacity="0.28"></ellipse>`;
  const crowns = [
    [-0.55, 0.15, 0.75],
    [0.5, 0.2, 0.7],
    [0, -0.25, 0.85]
  ]
    .map(
      ([dx, dy, k]) =>
        `<circle cx="${round(x + dx * size)}" cy="${round(y + dir * dy * size)}" r="${round(k * r)}" fill="#4e8a33"></circle><circle cx="${round(x + dx * size - 0.25 * k * r)}" cy="${round(y + dir * dy * size - dir * 0.3 * k * r)}" r="${round(0.5 * k * r)}" fill="#70ae48"></circle>`
    )
    .join("");
  return `${shadow}<g class="sim-shrub" ${at([x, y])}>${crowns}</g>`;
}

function flowers([x, y], random) {
  const colours = ["#e9df9e", "#ece8dc", "#d9a3bb", "#b4c9e6"];
  const dots = [0, 1, 2]
    .map(i => {
      const angle = i * 2.1 + random();
      return `<circle cx="${round(x + Math.cos(angle) * 2.2)}" cy="${round(y + Math.sin(angle) * 2.2)}" r="0.75" fill="${colours[Math.floor(random() * colours.length)]}"></circle>`;
    })
    .join("");
  return `<g class="sim-flowers" ${at([x, y])}>${dots}</g>`;
}

function lily([x, y], random) {
  const r = round(2.2 + random() * 1.2);
  const bloom =
    random() < 0.3 ? `<circle cx="${x}" cy="${y}" r="1.2" fill="#f2b6cf"></circle>` : "";
  return `<g class="sim-lily" ${at([x, y])}><circle cx="${x}" cy="${y}" r="${r}" fill="#4f8f3c"></circle><path d="M${x} ${y}l${r} -1.2v2.4z" fill="#1b627c"></path>${bloom}</g>`;
}

function post([x, y], dir) {
  const top = dir > 0 ? y - 5 : y;
  return `<ellipse cx="${round(x + 1.5)}" cy="${round(y + dir * 2)}" rx="3" ry="1.4" fill="#0b1508" opacity="0.3"></ellipse><g class="sim-post" ${at([x, y])}><rect x="${round(x - 1.6)}" y="${round(top)}" width="3.2" height="5" rx="0.6" fill="#77735f"></rect><rect x="${round(x - 2.1)}" y="${round(dir > 0 ? top - 1 : top + 5)}" width="4.2" height="1.4" rx="0.5" fill="#a39e88"></rect></g>`;
}

/** The stone posts of one lane: every POST_EVERY map pixels along it, to one side then the other. */
function lanePosts(line, keep) {
  const posts = [];
  let walked = POST_EVERY / 2;
  let side = 1;
  for (let i = 1; i < line.length; i += 1) {
    const [a, b] = [line[i - 1], line[i]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    for (; walked < length; walked += POST_EVERY) {
      const t = walked / length;
      const [nx, ny] = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
      const point = [
        a[0] + (b[0] - a[0]) * t + nx * POST_SIDE * side,
        a[1] + (b[1] - a[1]) * t + ny * POST_SIDE * side
      ];
      if (keep(point)) {
        posts.push(point);
      }
      side = -side;
    }
    walked -= length;
  }
  return posts;
}

/** The scattered things of `map` for the `side` that looks at it: `{ ground, standing }` (SVG markup). */
export function decorMarks(map, side) {
  const dir = side === "red" ? -1 : 1;
  const random = seeded(SEED);
  const solid = [...map.walls, ...map.bushes];
  const near = (point, list, gap) =>
    list.some(spot => Math.hypot(spot[0] - point[0], spot[1] - point[1]) < gap);
  const fountains = ["blue", "red"].map(team => map.bases[team].fountain);
  const crystals = ["blue", "red"].map(team => map.bases[team].crystal);
  const free = point =>
    insidePolygon(point, map.bounds) &&
    !solid.some(shape => insidePolygon(point, shape) || lineGap(point, shape, true) < 4) &&
    !map.river.some(part => insidePolygon(point, part) || lineGap(point, part, true) < 10) &&
    laneGap(point, map.lanes) > 18 &&
    !near(point, fountains, 70) &&
    !near(point, crystals, 26) &&
    !near(
      point,
      (map.towers ?? []).map(tower => tower.at),
      16
    ) &&
    !near(
      point,
      map.camps.map(camp => camp.at),
      20
    ) &&
    !near(
      point,
      map.neutral.map(camp => camp.at),
      36
    );
  const xs = map.bounds.map(point => point[0]);
  const ys = map.bounds.map(point => point[1]);
  const [left, top] = [Math.min(...xs), Math.min(...ys)];
  const [width, height] = [Math.max(...xs) - left, Math.max(...ys) - top];
  const ground = [];
  const standing = [];
  for (let i = 0; i < TRIES; i += 1) {
    const point = [left + random() * width, top + random() * height];
    const kind = random();
    const size = 2 + random() * 1.8;
    if (!free(point)) {
      continue;
    }
    if (kind < 0.3) {
      ground.push(flowers(point, random));
    } else if (kind < 0.68) {
      standing.push(rock(point, size, dir));
    } else {
      standing.push(shrub(point, size, dir));
    }
  }
  for (const part of map.river) {
    const pxs = part.map(point => point[0]);
    const pys = part.map(point => point[1]);
    for (let i = 0; i < LILY_TRIES; i += 1) {
      const point = [
        Math.min(...pxs) + random() * (Math.max(...pxs) - Math.min(...pxs)),
        Math.min(...pys) + random() * (Math.max(...pys) - Math.min(...pys))
      ];
      const pit = near(
        point,
        map.neutral.map(camp => camp.at),
        44
      );
      if (
        insidePolygon(point, part) &&
        lineGap(point, part, true) > 10 &&
        !pit &&
        random() < 0.16
      ) {
        ground.push(lily(point, random));
      }
    }
  }
  const postFree = point =>
    insidePolygon(point, map.bounds) &&
    !solid.some(shape => insidePolygon(point, shape)) &&
    !map.river.some(part => insidePolygon(point, part)) &&
    !near(point, fountains, 70) &&
    !near(point, crystals, 26) &&
    !near(
      point,
      (map.towers ?? []).map(tower => tower.at),
      14
    );
  for (const line of Object.values(map.lanes)) {
    standing.push(...lanePosts(line, postFree).map(point => post(point, dir)));
  }
  const runes = ["blue", "red"]
    .map(team => {
      const [x, y] = map.bases[team].fountain;
      return `<circle class="sim-runes sim-runes--${team}" cx="${x}" cy="${y}" r="60" fill="none" stroke="${TONES[team]}" stroke-width="3" stroke-dasharray="2 7" opacity="0.7"></circle><circle cx="${x}" cy="${y}" r="56" fill="none" stroke="${TONES[team]}" stroke-width="1" opacity="0.45"></circle>`;
    })
    .join("");
  return { ground: ground.join("") + runes, standing: standing.join("") };
}
