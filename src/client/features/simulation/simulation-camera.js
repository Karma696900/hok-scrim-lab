// The camera of a game played by hand: the field is drawn larger than the screen (simulation-hud.css sets its
// size) and moves so that the player's hero stays in the middle, as in the game, stopping at the edges of the map.
// It follows where the hero is drawn (simulation-motion.js: its glide and the prediction of its stick), every
// screen frame. The minimap shows the part of the map the screen shows. A dead hero leaves the camera where it fell.
import { placeOnBoard } from "./simulation-map.js";

/** Measures the screen and the field once, and again when the window changes. */
export function bindCamera(run) {
  const view = run.layer.querySelector(".sim-view");
  if (!view) {
    return;
  }
  run.camera = {
    view,
    map: run.layerOf.map,
    frame: run.layerOf.miniFrame,
    at: null,
    size: null,
    key: ""
  };
  const measure = () => {
    run.camera.size = {
      width: view.clientWidth,
      height: view.clientHeight,
      side: run.camera.map.offsetWidth
    };
    run.camera.key = "";
  };
  measure();
  run.camera.observer = new ResizeObserver(measure);
  run.camera.observer.observe(view);
}

export function unbindCamera(run) {
  run.camera?.observer?.disconnect();
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Puts the field so that the player's hero is in the middle of the screen. */
export function followCamera(run) {
  const camera = run.camera;
  const drawn = run.glide.get(run.me.id)?.drawn;
  if (!camera?.size || (!drawn && !camera.at)) {
    return;
  }
  if (drawn && !run.dots.get(run.me.id)?.hidden) {
    camera.at = drawn;
  }
  const { width, height, side } = camera.size;
  if (!side) {
    return;
  }
  const [px, py] = placeOnBoard(camera.at, run.side).map(share => (share / 100) * side);
  const x = clamp(width / 2 - px, Math.min(0, width - side), 0);
  const y = clamp(height / 2 - py, Math.min(0, height - side), 0);
  const key = `${x.toFixed(1)},${y.toFixed(1)}`;
  if (key === camera.key) {
    return;
  }
  camera.key = key;
  camera.map.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  if (camera.frame) {
    camera.frame.style.left = `${((-x / side) * 100).toFixed(2)}%`;
    camera.frame.style.top = `${((-y / side) * 100).toFixed(2)}%`;
    camera.frame.style.width = `${((width / side) * 100).toFixed(2)}%`;
    camera.frame.style.height = `${((height / side) * 100).toFixed(2)}%`;
  }
}
