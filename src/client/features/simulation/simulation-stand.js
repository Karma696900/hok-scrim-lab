// The dots that stand on the tilted map, as in the game: the heroes, the minions, the camps' health and the dots of
// the towers, the crystals, the camps and the objectives. They are not drawn on the map (its tilt would flatten them
// and hide their lower half) but on a flat layer above it, moved with it (simulation-camera.js). Each screen frame,
// each one goes where the perspective draws its point of the map, and is scaled as that point is: smaller far away,
// always round and upright. The towers and the crystals stand up as drawn pieces in their side's colour, their foot
// on their point; the camps and objectives are dots. All drawn by us (no picture of the game: the site is open source).

const svg = inner => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
const ICONS = {
  camp: svg(
    '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6.5" r="2"/><circle cx="17" cy="9" r="2"/><path d="M12 11c3 0 5 3 5 5.5S15 20 12 20s-5-1-5-3.5S9 11 12 11z"/>'
  ),
  buff: svg('<path d="M12 2c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3 0-5 1-7z"/>'),
  boss: svg('<path d="M3 19h18l-2-11-4 4-3-7-3 7-4-4z"/>'),
  sprite: svg('<path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>')
};
const CAMP_ICON = {
  "red-buff": "buff",
  "blue-buff": "buff",
  tyrant: "boss",
  overlord: "boss",
  firehawk: "boss",
  sprite: "sprite"
};

const spot = (kind, tag, at, icon) =>
  `<span class="sim-spot sim-spot--${kind}" ${tag} data-at="${at[0]},${at[1]}">${ICONS[icon]}</span>`;

const TONES = {
  blue: { main: "#4d8df0", light: "#b4d2ff", deep: "#2a5bb0" },
  red: { main: "#e5573f", light: "#ffc0b0", deep: "#a3301f" }
};

// a tower: its shadow, a carved stone foot, a pillar with its banner in the side's colour, a cap and the glowing stone
// on top (it pulses); fallen, only its rubble stays (simulation-tilt.css shows one or the other)
const towerFigure = ({ main, light, deep }) =>
  `<svg class="sim-figure sim-figure--tower" viewBox="0 0 40 64" aria-hidden="true" focusable="false"><ellipse cx="20" cy="59" rx="16" ry="4.5" fill="#000" opacity="0.32"/><g class="sim-figure__whole"><path d="M5 59h30l-3-10H8z" fill="#7d7a6e"/><path d="M27 49h5l3 10h-8z" fill="#5f5c52"/><path d="M8 53.5h25" stroke="#5f5c52" stroke-width="0.8"/><path d="M13 59v-5M20 59v-5M27 59v-5" stroke="#68655a" stroke-width="0.7"/><path d="M11 49h18V24H11z" fill="#a6a294"/><path d="M23 49h6V24h-6z" fill="#86826f"/><path d="M11 32h18M11 40h18" stroke="#8d8979" stroke-width="0.7"/><path d="M13 27h7v15l-3.5-3-3.5 3z" fill="${main}"/><path d="M13 27h3.5v12.5l-3.5 2.5z" fill="${light}" opacity="0.45"/><path d="M15 31l1.5 2 1.5-2" fill="none" stroke="${light}" stroke-width="0.8"/><path d="M11 45h18v3H11z" fill="${deep}"/><path d="M8 24h24l-3-6H11z" fill="#6c685c"/><path d="M8 24h24v1.5H8z" fill="#55524a"/><circle class="sim-figure__glow" cx="20" cy="10" r="9" fill="${main}" opacity="0.35"/><path d="M20 1l6 9-6 8-6-8z" fill="${main}"/><path d="M20 1l-6 9 6 8z" fill="${light}"/><path d="M20 18l6-8h-12z" fill="${deep}" opacity="0.5"/></g><g class="sim-figure__rubble"><path d="M5 59h30l-3-7H8z" fill="#6f6c61"/><path d="M11 52l3-9 5 3 3-6 4 5 3 7z" fill="#8d8979"/><path d="M8 55l4-3 2 4zM27 56l5-3 1 4z" fill="#5f5c52"/><path d="M18 50l3-2 1 3z" fill="${deep}" opacity="0.7"/></g></svg>`;

// a crystal: its shadow, a stepped stone base carved with the side's colour, a ring and the big faceted stone (it
// pulses)
const crystalFigure = ({ main, light, deep }) =>
  `<svg class="sim-figure sim-figure--crystal" viewBox="0 0 60 72" aria-hidden="true" focusable="false"><ellipse cx="30" cy="66" rx="27" ry="6" fill="#000" opacity="0.32"/><g class="sim-figure__whole"><path d="M4 66h52l-5-9H9z" fill="#7d7a6e"/><path d="M47 57h4l5 9h-6z" fill="#5f5c52"/><path d="M9 61.5h42" stroke="${main}" stroke-width="1.2" opacity="0.7"/><path d="M11 57h38l-4-7H15z" fill="#a6a294"/><path d="M41 50h4l4 7h-5z" fill="#86826f"/><ellipse cx="30" cy="48" rx="17" ry="4" fill="none" stroke="${main}" stroke-width="2.5"/><circle class="sim-figure__glow" cx="30" cy="28" r="19" fill="${main}" opacity="0.28"/><path d="M30 4l13 21-13 23-13-23z" fill="${main}"/><path d="M30 4l-13 21 13 23z" fill="${light}"/><path d="M30 4l6 21-6 23z" fill="${deep}" opacity="0.45"/><path d="M17 25h26" stroke="${light}" stroke-width="1" opacity="0.7"/><path d="M24 14l3 5" stroke="#fff" stroke-width="1.2" opacity="0.6"/></g><g class="sim-figure__rubble"><path d="M4 66h52l-5-9H9z" fill="#6f6c61"/><path d="M14 57l6-8 5 4 6-9 5 7 5-2 4 8z" fill="#8d8979"/><path d="M24 56l4-6 3 5z" fill="${main}" opacity="0.6"/></g></svg>`;

const piece = (kind, side, tag, at, figure) =>
  `<span class="sim-spot sim-spot--${kind} sim-spot--${side} sim-spot--piece" ${tag} data-at="${at[0]},${at[1]}">${figure(TONES[side])}</span>`;

// only a WebP picture sent whole as a data address is drawn
const PICTURE = /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/;
const pictureOf = (art, kind) => {
  const picture = art?.[`monster-${kind}`];
  return typeof picture === "string" && PICTURE.test(picture) ? picture : null;
};

/**
 * The dot of a camp: ONE a camp, its main monster (the first of `camp.monsters`, sent by the bots server with `art`,
 * the pictures), as the game marks each camp with one icon (lesson 10, 0:36, the enlarged minimap; owner,
 * 2026-11-06); the simulation still fights every monster of the camp. The Tyrant and the Overlord carry their shadow
 * picture too (shown from 10:00). Null when the picture is missing.
 */
function monstersHtml(camp, art, kind, tag) {
  const monsters = (camp.monsters ?? []).slice(0, 1);
  const pictures = monsters.map(monster => pictureOf(art, monster));
  if (!monsters.length || pictures.some(picture => !picture)) {
    return null;
  }
  const faces = monsters.map((monster, i) => {
    const shadow = pictureOf(art, `shadow-${monster}`);
    const second = shadow ? `<img class="sim-monster__shadow" alt="" src="${shadow}">` : "";
    return `<span class="sim-monster sim-monster--${monster}"><img alt="" src="${pictures[i]}">${second}</span>`;
  });
  const at = `data-at="${camp.at[0]},${camp.at[1]}"`;
  return `<span class="sim-spot sim-spot--${kind} sim-spot--monsters" ${tag} data-count="${monsters.length}" ${at}>${faces.join("")}</span>`;
}

/**
 * The dots of the towers, the crystals, the camps and the objectives, each with its point of the map (`data-at`): a
 * camp whose monsters have their pictures in `art` shows them, the others an icon.
 */
export function spotsHtml(map, art) {
  const towers = map.towers.map(tower =>
    piece("tower", tower.side, `data-tower="${tower.id}"`, tower.at, towerFigure)
  );
  const crystals = ["blue", "red"].map(side =>
    piece("crystal", side, `data-crystal="${side}"`, map.bases[side].crystal, crystalFigure)
  );
  const camps = map.camps.map(
    camp =>
      monstersHtml(camp, art, `camp sim-spot--${camp.kind}`, `data-camp="${camp.id}"`) ??
      spot(
        `camp sim-spot--${camp.kind}`,
        `data-camp="${camp.id}"`,
        camp.at,
        CAMP_ICON[camp.kind] ?? "camp"
      )
  );
  const objectives = map.neutral.map(
    camp =>
      monstersHtml(camp, art, `objective sim-spot--${camp.kind}`, `data-camp="${camp.id}"`) ??
      spot(
        `objective sim-spot--${camp.kind}`,
        `data-camp="${camp.id}"`,
        camp.at,
        CAMP_ICON[camp.kind] ?? "boss"
      )
  );
  return [...towers, ...crystals, ...camps, ...objectives].join("");
}

/**
 * Where the perspective draws a point of the map that is (dx, dy) pixels from the point the camera looks at, the map
 * turned by `tilt` degrees about that point and seen from `depth` pixels (CSS rotateX, then perspective): its offset
 * on the screen from the middle (x, y) and its scale. Null when the point is behind the camera.
 */
export function project({ dx, dy, tilt, depth }) {
  const rad = (tilt * Math.PI) / 180;
  const z = dy * Math.sin(rad);
  if (depth - z < depth * 0.15) {
    return null;
  }
  const scale = depth / (depth - z);
  return { x: dx * scale, y: dy * Math.cos(rad) * scale, scale };
}

/**
 * Where a dot of the flat layer is drawn, by its transform alone (the layer's children all sit at its top left corner,
 * so moving one never lays the page out again): `share` its point as shares of the board (0..100), `side` the field's
 * width in pixels, `pose` the camera's (the layer moved by (x, y), the map turned about (ox, oy)), `screen` the view's
 * size. Not `shown` behind the camera, or farther than `margin` pixels past the screen's edge: nothing is written for
 * it then, frame after frame.
 */
export function standOf({ share, side, pose, tilt, depth, screen, margin }) {
  const dx = (share[0] / 100) * side - pose.ox;
  const dy = (share[1] / 100) * side - pose.oy;
  const at = project({ dx, dy, tilt, depth });
  if (!at) {
    return { shown: false };
  }
  // on the screen, the dot is at the layer's offset plus its place on the layer
  const sx = pose.x + pose.ox + at.x;
  const sy = pose.y + pose.oy + at.y;
  if (sx < -margin || sy < -margin || sx > screen.width + margin || sy > screen.height + margin) {
    return { shown: false };
  }
  return {
    shown: true,
    transform: `translate(${(pose.ox + at.x).toFixed(1)}px, ${(pose.oy + at.y).toFixed(1)}px) scale(${at.scale.toFixed(3)})`
  };
}

/** The point of each dot of the flat layer (shares of the board), kept by placeAt (simulation-hud.js). */
export const standAt = new WeakMap();
const written = new WeakMap();
// the pieces are up to ~80 px tall at --piece 1, drawn above their point: they still show their head past the edge
const MARGIN = 160;

/** Every screen frame, after the camera: each shown dot of the flat layer where the tilted map draws its point. */
export function standDots(run) {
  const camera = run.camera;
  const pose = camera?.pose;
  const side = camera?.size?.side;
  if (!pose || !side) {
    return;
  }
  const lens = {
    side,
    pose,
    tilt: camera.tilt,
    depth: camera.depth,
    screen: camera.size,
    margin: MARGIN * (camera.piece ?? 1)
  };
  for (const el of run.layerOf.dots.children) {
    const share = standAt.get(el);
    if (el.hidden || !share) {
      continue;
    }
    const at = standOf({ ...lens, share });
    const transform = at.shown ? at.transform : "off";
    if (written.get(el) === transform) {
      continue;
    }
    written.set(el, transform);
    if (at.shown) {
      el.style.transform = transform;
      el.style.visibility = "";
    } else {
      el.style.visibility = "hidden";
    }
  }
}
