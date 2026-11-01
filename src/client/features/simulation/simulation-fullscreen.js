// The game simulation on a phone takes the whole screen: asked at the tap on the start button (a browser grants it
// only right after a tap), turned sideways where the browser lets the page do it, and given back when the game is
// left. A player who leaves full screen during a game (the back gesture, a notification) gets a button that covers
// the board and takes it back. A mouse or a browser without full screen (the iPhone's Safari) keeps the page as is.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";

const touchScreen = win => win.matchMedia?.("(pointer: coarse)").matches === true;
const canFill = doc => (doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled) === true;
const filled = doc => (doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null) !== null;
const wanted = (doc, win) => touchScreen(win) && canFill(doc);

/** Full screen and sideways on a touch screen; true when the page fills the screen. Never throws. */
export async function enterFullscreen(doc = document, win = window) {
  if (!wanted(doc, win)) {
    return false;
  }
  if (filled(doc)) {
    return true;
  }
  const root = doc.documentElement;
  const ask = root.requestFullscreen ?? root.webkitRequestFullscreen;
  try {
    await ask.call(root, { navigationUI: "hide" });
  } catch {
    return false;
  }
  try {
    await win.screen?.orientation?.lock?.("landscape");
  } catch {
    // a screen that cannot be turned: the page asks to turn the phone itself (.sim-turn)
  }
  return true;
}

/** The normal page again, when it was in full screen. Never throws. */
export async function exitFullscreen(doc = document, win = window) {
  if (!filled(doc)) {
    return;
  }
  try {
    win.screen?.orientation?.unlock?.();
  } catch {
    // nothing to give back
  }
  try {
    await (doc.exitFullscreen ?? doc.webkitExitFullscreen).call(doc);
  } catch {
    // already left
  }
}

/** True when the button back to full screen should cover the board: a game going on, out of full screen. */
export const coverWanted = (run, doc = document, win = window) =>
  !run.stopped && !run.ended && wanted(doc, win) && !filled(doc);

const EVENTS = ["fullscreenchange", "webkitfullscreenchange"];

/** Adds the button back to full screen to the board (`data-sim="fullscreen"`) and keeps it shown when needed. */
export function bindFullscreen(run, doc = document, win = window) {
  const cover = doc.createElement("div");
  cover.className = "sim-full";
  cover.innerHTML = `<button type="button" class="btn btn--primary btn--lg" data-sim="fullscreen">${icon("maximize")}<span>${t("Tap to play in full screen")}</span></button>`;
  run.layer.append(cover);
  const sync = () => {
    cover.hidden = !coverWanted(run, doc, win);
  };
  sync();
  for (const name of EVENTS) {
    doc.addEventListener(name, sync);
  }
  run.syncFullscreen = sync;
  run.unbindFullscreen = () => {
    for (const name of EVENTS) {
      doc.removeEventListener(name, sync);
    }
  };
}
