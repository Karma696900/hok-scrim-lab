// The dots that stand on the tilted map, as in the game: the heroes, the minions, the camps' health and the dots of
// the towers, the crystals, the camps and the objectives. They are not drawn on the map (its tilt would flatten them
// and hide their lower half) but on a flat layer above it, moved with it (simulation-camera.js). Each screen frame,
// each one goes where the perspective draws its point of the map, and is scaled as that point is: smaller far away,
// always round and upright. The structures' dots are drawn with our own icons (no picture of the game: the site is
// open source), a little more transparent than the heroes'.

const svg = inner => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
const ICONS = {
  tower: svg('<path d="M6 21h12v-2l-2-1V10l2-2V3h-3v2h-2V3h-2v2H9V3H6v5l2 2v8l-2 1z"/>'),
  crystal: svg('<path d="M12 2l7 9-7 11-7-11z"/>'),
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

/** The dots of the towers, the crystals, the camps and the objectives, each with its point of the map (`data-at`). */
export function spotsHtml(map) {
  const towers = map.towers.map(tower =>
    spot(`tower sim-spot--${tower.side}`, `data-tower="${tower.id}"`, tower.at, "tower")
  );
  const crystals = ["blue", "red"].map(side =>
    spot(`crystal sim-spot--${side}`, `data-crystal="${side}"`, map.bases[side].crystal, "crystal")
  );
  const camps = map.camps.map(camp =>
    spot(
      `camp sim-spot--${camp.kind}`,
      `data-camp="${camp.id}"`,
      camp.at,
      CAMP_ICON[camp.kind] ?? "camp"
    )
  );
  const objectives = map.neutral.map(camp =>
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

const written = new WeakMap();

/** Every screen frame, after the camera: each shown dot of the flat layer where the tilted map draws its point. */
export function standDots(run) {
  const camera = run.camera;
  const pose = camera?.pose;
  const side = camera?.size?.side;
  if (!pose || !side) {
    return;
  }
  for (const el of run.layerOf.dots.children) {
    const left = parseFloat(el.style.left);
    const top = parseFloat(el.style.top);
    if (el.hidden || Number.isNaN(left) || Number.isNaN(top)) {
      continue;
    }
    const dx = (left / 100) * side - pose.ox;
    const dy = (top / 100) * side - pose.oy;
    const at = project({ dx, dy, tilt: camera.tilt, depth: camera.depth });
    const transform = at
      ? `translate(${(at.x - dx).toFixed(1)}px, ${(at.y - dy).toFixed(1)}px) scale(${at.scale.toFixed(3)})`
      : "scale(0)";
    if (written.get(el) !== transform) {
      written.set(el, transform);
      el.style.transform = transform;
    }
  }
}
