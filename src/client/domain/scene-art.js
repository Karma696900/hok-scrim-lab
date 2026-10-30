// The art of the stage that opens a page (tier lists, build lab, game data, popular heroes): the 16:9 cover
// of a hero, behind a dark veil that keeps the title legible. The cover comes from the stored Camp sheet of the
// hero (see hero-of-the-day.js); a hero that has none gets no picture and the stage keeps its gradient, nothing
// is made up. The markup of a cover that was read once is kept, so a page that draws itself again after every
// action does not blink its picture.
import { wide } from "../../shared/media.js";
import { heroSheet } from "./hero-of-the-day.js";
import { state } from "../app/app-state.js";

const WIDTHS = [640, 960, 1280, 1920];
const covers = new Map(); // hero id -> the <img> of its cover, "" when it has none

/** A hero of the Global roster that changes with the day, and with `offset` from one page to another. */
export function sceneHero(offset = 0) {
  const pool = state.heroes.filter(hero => hero.availableGlobal !== false && !hero.isFlowborn);
  if (!pool.length) {
    return null;
  }
  const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  return pool[(day + offset) % pool.length];
}

/**
 * The element that holds the cover, with the picture already inside when the cover is known (it then shows
 * at once); `fillSceneArt` fills it otherwise.
 */
export function sceneArtSlot(className, hero) {
  const known = hero ? covers.get(hero.id) : "";
  return `<div class="${className}${known ? " is-on" : ""}" data-art="${hero?.id ?? ""}" data-drawn="${known ? "1" : ""}">${known ?? ""}</div>`;
}

/** Reads the cover of `hero` and draws it into `slot` (the element with the `is-on` state that fades it in). */
export async function fillSceneArt(slot, hero) {
  if (!slot || !hero) {
    return;
  }
  if (!covers.has(hero.id)) {
    const cover = (await heroSheet(hero))?.art?.cover;
    covers.set(
      hero.id,
      cover
        ? `<img ${wide(cover, WIDTHS, "100vw")} alt="" decoding="async" fetchpriority="high">`
        : ""
    );
  }
  const markup = covers.get(hero.id);
  if (markup && slot.isConnected && !slot.dataset.drawn) {
    slot.dataset.drawn = "1";
    slot.innerHTML = markup;
    slot.classList.add("is-on");
  }
}
