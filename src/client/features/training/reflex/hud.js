// The bar above an exercise while it runs: how far along the run is (a thin bar), what is being played (round,
// target, level) and what is left (lives, strikes). The exercises only say the numbers; the page draws them. The
// words of the run (what to do now) stay in the status line of the stage, which is the one that is read aloud: this
// bar is for the eyes and is hidden from the screen readers.
import { icon } from "../../../../shared/icons.js";
import { number } from "../../../app/browser-i18n.js";

/** What an exercise gets when it is played with no page around it (a test): every call does nothing. */
export const noHud = Object.freeze({ progress() {}, count() {}, lives() {} });

/** The bar of the run that is drawn in `area` (it holds #rx-bar and #rx-meter). */
export function createHud(area) {
  const bar = area.querySelector("#rx-bar");
  const meter = area.querySelector("#rx-meter");
  let counter = null;
  let hearts = null;
  const part = (className, parent) => {
    const node = document.createElement("span");
    node.className = className;
    parent.append(node);
    return node;
  };
  return {
    /** How far the run is, from 0 to 1. An exercise that goes on until a mistake leaves the bar where it is. */
    progress(fraction) {
      bar.style.transform = `scaleX(${Math.min(1, Math.max(0, fraction))})`;
    },
    /** The figure at the right of the bar: `value` of `total` ("3/30"), or only `value` (a level). */
    count(value, total = null, iconName = "") {
      counter ??= part("rx-hud__count", meter);
      counter.innerHTML = `${iconName ? icon(iconName, "i--sm") : ""}<b>${number(value)}</b>${total === null ? "" : `<small>/${number(total)}</small>`}`;
    },
    /** `left` of `total` lives (or strikes), as dots, the ones that are gone drawn empty. */
    lives(left, total) {
      hearts ??= part("rx-hud__lives", meter);
      hearts.replaceChildren(
        ...Array.from({ length: total }, (_, index) => {
          const dot = document.createElement("i");
          dot.className = index < left ? "is-on" : "";
          return dot;
        })
      );
    }
  };
}
