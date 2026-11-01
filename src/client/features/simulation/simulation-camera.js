// The camera of a game played by hand: the field is drawn larger than the screen (simulation-hud.css sets its
// size) and moves so that the player's hero dot is always in the middle of the screen, as in the game, near the edges
// of the map too. It follows where the hero is drawn (simulation-motion.js: its glide and the prediction of its stick),
// every screen frame. The minimap's frame is centred on the hero, like the fog around it. A dead hero leaves the
// camera where it fell. Holding a finger on the minimap moves the camera to the point under it, and it follows the
// finger while it slides (the hero keeps obeying its stick); the finger lifted, the camera glides back to the hero in
// a quarter of a second, as in the game. The map is tilted like the game's camera (perspective in
// simulation-tilt.css, the angle --sim-tilt): it turns about the point the camera looks at, and the dots of the heroes
// stand upright on it, smaller far away.
import { mapPointOf, placeOnBoard } from "./simulation-map.js";

const BACK_MS = 250;
/** Where on the screen the point the camera looks at is drawn (shares of its width and height): the middle. */
export const ANCHOR = [0.5, 0.5];
const DEFAULT_TILT = 40;
const DEFAULT_DEPTH = 900;

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** The map point under a finger at (x, y) on the minimap `element`. */
function miniPoint(run, element, x, y) {
  const box = element.getBoundingClientRect();
  if (!box.width || !box.height) {
    return null;
  }
  return mapPointOf(
    [((x - box.left) / box.width) * 100, ((y - box.top) / box.height) * 100],
    run.side
  );
}

/** Holding the minimap: the camera looks where the finger is; lifted, it glides back to the hero. */
function bindLook(run, camera) {
  const mini = run.layer.querySelector(".sim-mini");
  if (!mini) {
    return;
  }
  let finger = null;
  const look = event => {
    camera.look = miniPoint(run, mini, event.clientX, event.clientY) ?? camera.look;
  };
  mini.addEventListener("pointerdown", event => {
    finger = event.pointerId;
    mini.setPointerCapture?.(finger);
    mini.classList.add("is-looking");
    camera.back = null;
    look(event);
  });
  mini.addEventListener("pointermove", event => {
    if (event.pointerId === finger) {
      look(event);
    }
  });
  const release = event => {
    if (event.pointerId !== finger) {
      return;
    }
    finger = null;
    mini.classList.remove("is-looking");
    if (camera.look) {
      camera.back = { from: camera.look, at: performance.now() };
    }
    camera.look = null;
  };
  mini.addEventListener("pointerup", release);
  mini.addEventListener("pointercancel", release);
}

/** Measures the screen and the field once, and again when the window changes. */
export function bindCamera(run) {
  const view = run.layer.querySelector(".sim-view");
  if (!view) {
    return;
  }
  run.camera = {
    view,
    map: run.layerOf.map,
    dots: run.layerOf.dots,
    frame: run.layerOf.miniFrame,
    pose: null,
    at: null,
    look: null,
    back: null,
    size: null,
    tilt: DEFAULT_TILT,
    depth: DEFAULT_DEPTH,
    key: ""
  };
  const measure = () => {
    run.camera.size = {
      width: view.clientWidth,
      height: view.clientHeight,
      side: run.camera.map.offsetWidth
    };
    const style = getComputedStyle(view);
    const tilt = parseFloat(style.getPropertyValue("--sim-tilt"));
    const depth = parseFloat(style.getPropertyValue("--sim-depth"));
    run.camera.tilt = Number.isFinite(tilt) ? tilt : DEFAULT_TILT;
    run.camera.depth = Number.isFinite(depth) ? depth : DEFAULT_DEPTH;
    run.camera.key = "";
  };
  measure();
  run.camera.observer = new ResizeObserver(measure);
  run.camera.observer.observe(view);
  bindLook(run, run.camera);
}

export function unbindCamera(run) {
  run.camera?.observer?.disconnect();
}

/**
 * The map point the camera looks at now: the finger on the minimap, the glide back from it, or the player's hero
 * where it is drawn (where it fell while it is dead). Null before the hero was ever drawn.
 */
export function cameraTarget(run, now = performance.now()) {
  const camera = run.camera;
  if (!camera) {
    return null;
  }
  const drawn = run.glide.get(run.me.id)?.drawn;
  if (drawn && !run.dots.get(run.me.id)?.hidden) {
    camera.at = drawn;
  }
  if (camera.look) {
    return camera.look;
  }
  if (camera.back && camera.at) {
    const t = (now - camera.back.at) / BACK_MS;
    if (t < 1) {
      const eased = 1 - (1 - t) * (1 - t);
      return lerp(camera.back.from, camera.at, eased);
    }
    camera.back = null;
  }
  return camera.at;
}

function placeFrame(frame, { x, y, width, height, side }) {
  frame.style.left = `${((-x / side) * 100).toFixed(2)}%`;
  frame.style.top = `${((-y / side) * 100).toFixed(2)}%`;
  frame.style.width = `${((width / side) * 100).toFixed(2)}%`;
  frame.style.height = `${((height / side) * 100).toFixed(2)}%`;
}

/**
 * Where the field goes for the camera to look at its pixel (px, py): moved by (x, y) so that pixel is at the screen's
 * anchor, and turned about (ox, oy), that same pixel.
 */
export function fieldPose({ px, py, width, height }) {
  const [ax, ay] = [width * ANCHOR[0], height * ANCHOR[1]];
  return { x: ax - px, y: ay - py, ox: px, oy: py };
}

/** Puts the field, tilted, so that the point the camera looks at is in the middle of the screen. */
export function followCamera(run, now) {
  const camera = run.camera;
  const target = cameraTarget(run, now);
  if (!camera?.size || !target) {
    return;
  }
  const { width, height, side } = camera.size;
  if (!side) {
    return;
  }
  const [px, py] = placeOnBoard(target, run.side).map(share => (share / 100) * side);
  const { x, y, ox, oy } = fieldPose({ px, py, width, height, side });
  const key = `${x.toFixed(1)},${y.toFixed(1)},${camera.tilt},${camera.depth}`;
  if (key === camera.key) {
    return;
  }
  camera.key = key;
  camera.map.style.transformOrigin = `${ox.toFixed(1)}px ${oy.toFixed(1)}px`;
  camera.map.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotateX(${camera.tilt}deg)`;
  // the standing dots' layer moves with the map, flat (simulation-stand.js places each dot on the tilted map)
  camera.pose = { ox, oy };
  if (camera.dots) {
    camera.dots.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
  if (camera.frame) {
    placeFrame(camera.frame, { x, y, width, height, side });
  }
}
