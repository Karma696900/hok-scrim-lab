// The camera of a game played by hand: the field is drawn larger than the screen (simulation-hud.css sets its
// size) and moves so that the player's hero dot is always in the middle of the screen, as in the game, near the edges
// of the map too. It follows where the hero is drawn (simulation-motion.js: its glide and the prediction of its stick),
// every screen frame. The minimap's frame is centred on the hero, like the fog around it. A dead hero leaves the
// camera where it fell. Holding a finger on the minimap moves the camera to the point under it, and it follows the
// finger while it slides (the hero keeps obeying its stick); the finger lifted, the camera glides back to the hero in
// a quarter of a second, as in the game. The map is tilted like the game's camera (perspective in
// simulation-tilt.css, the angle --sim-tilt): it turns about the point the camera looks at, and the dots of the heroes
// stand upright on it, smaller far away. How high the camera is the player's choice, as in the game's settings (close,
// normal, high: how many screens wide the field is drawn, kept on the device); the perspective follows the screen's
// height (a lens of about 35 degrees from top to bottom) and the pieces on the field grow with it (--piece).
import { mapPointOf, placeOnBoard } from "./simulation-map.js";

const BACK_MS = 250;
/** Where on the screen the point the camera looks at is drawn (shares of its width and height): the middle. */
export const ANCHOR = [0.5, 0.5];
const DEFAULT_TILT = 46;
/** How many screens wide the field is drawn at each height of the camera (at normal, ~170 map pixels across). */
export const CAMERA_HEIGHTS = { close: 5, normal: 4.25, high: 3.4 };
const CAMERA_KEY = "hok-sim-camera";
// the distance of the eye from the screen, in screen heights; the board's side in map pixels; the field's pixels per
// map pixel at which the pieces have their size in the stylesheet
const DEPTH_SHARE = 1.6;
const BOARD = 724;
const PIECE_AT = 3.5;

/** The camera height kept on this device: "close", "normal" or "high" (normal when none, or storage is blocked). */
export function readCamera(storage = globalThis.localStorage) {
  try {
    const kept = storage?.getItem(CAMERA_KEY);
    return Object.hasOwn(CAMERA_HEIGHTS, kept ?? "") ? kept : "normal";
  } catch {
    return "normal";
  }
}

export function keepCamera(height, storage = globalThis.localStorage) {
  try {
    storage?.setItem(CAMERA_KEY, height);
  } catch {
    // storage blocked: the height holds for this visit only
  }
}

/**
 * The lens for a screen `height` pixels high and a field `side` pixels wide: the perspective's `depth` (pixels) and
 * `piece`, how much the pieces on the field are grown (0.8 to 3).
 */
export function lens({ height, side }) {
  const piece = Math.min(3, Math.max(0.8, side / BOARD / PIECE_AT));
  return { depth: height * DEPTH_SHARE, piece: Math.round(piece * 1000) / 1000 };
}

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
    depth: 0,
    key: ""
  };
  const measure = () => {
    run.camera.size = {
      width: view.clientWidth,
      height: view.clientHeight,
      side: run.camera.map.offsetWidth
    };
    const tilt = parseFloat(getComputedStyle(view).getPropertyValue("--sim-tilt"));
    const { depth, piece } = lens({ height: view.clientHeight, side: run.camera.size.side });
    run.camera.tilt = Number.isFinite(tilt) ? tilt : DEFAULT_TILT;
    run.camera.depth = depth;
    view.style.perspective = `${depth.toFixed(0)}px`;
    view.style.setProperty("--piece", String(piece));
    run.camera.piece = piece;
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

/**
 * The minimap's frame, the part of the field the screen shows: its size (shares of the minimap) and where it is, by
 * its transform alone (a translate is a share of the frame's own size), so moving it never lays the page out again.
 */
export function frameBox({ x, y, width, height, side }) {
  return {
    width: `${((width / side) * 100).toFixed(2)}%`,
    height: `${((height / side) * 100).toFixed(2)}%`,
    transform: `translate(${((-x / width) * 100).toFixed(2)}%, ${((-y / height) * 100).toFixed(2)}%)`
  };
}

function placeFrame(frame, place) {
  const box = frameBox(place);
  if (frame.style.width !== box.width || frame.style.height !== box.height) {
    frame.style.width = box.width;
    frame.style.height = box.height;
  }
  frame.style.transform = box.transform;
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
  // the whole pose: simulation-stand.js needs the layer's offset to skip the dots off the screen
  camera.pose = { x, y, ox, oy };
  if (camera.dots) {
    camera.dots.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
  if (camera.frame) {
    placeFrame(camera.frame, { x, y, width, height, side });
  }
}
