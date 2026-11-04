// The game's buttons answer the finger as soon as it touches them. A phone makes no click of a touch while another
// finger is down, and in a game the thumb holds the stick: a button that waited for the click would be dead while the
// hero walks. So a touch (or a pen) on a button of the display or of the scoreboard acts at once, and the click that
// may follow it is dropped. The mouse and the keyboard (Enter, Space) still act through the click. Full screen is
// left to the click: the browser grants it only at the end of a touch.

// the click a browser makes of the same touch comes within this time
const SAME_TOUCH_MS = 800;
const ON_TOUCH = ".sim-hud [data-sim], .sim-scores [data-sim]";

/** Calls `act(button)` for every press of a `[data-sim]` button of `layer`, once per press. */
export function bindPresses(layer, act) {
  let pressed = null;
  const usable = button => button && !button.disabled && layer.contains(button);
  layer.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse") {
      return;
    }
    const button = event.target.closest(ON_TOUCH);
    if (!usable(button) || button.dataset.sim === "fullscreen") {
      return;
    }
    pressed = { button, at: performance.now() };
    act(button);
  });
  layer.addEventListener("click", event => {
    const button = event.target.closest("[data-sim]");
    if (!usable(button)) {
      return;
    }
    if (pressed?.button === button && performance.now() - pressed.at < SAME_TOUCH_MS) {
      pressed = null;
      return;
    }
    act(button);
  });
}
