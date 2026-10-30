import { wide } from "../../../shared/media.js";
import { escapeHtml } from "../../lib/dom.js";
import { heroOfTheDay, heroSheet } from "../../domain/hero-of-the-day.js";

// The cover art of the hero of the day behind the overview banner. It is the largest picture of the page: the server's
// copy of the page holds it already (the prerenderer waits while a slot is [data-filling]), so the browser fetches it
// with the HTML instead of after the script, the roster and the hero sheet. A redraw keeps the picture already there.

/** The art slot: the picture already drawn for the same hero is kept (no fade again), otherwise an empty slot to fill. */
export function bannerArt() {
  const hero = heroOfTheDay();
  const drawn = document.querySelector("#hello-art.is-on");
  const kept = hero && drawn?.dataset.hero === hero.id ? drawn.innerHTML : "";
  return kept
    ? `<div class="hello__art is-on" id="hello-art" data-hero="${escapeHtml(hero.id)}">${kept}</div>`
    : `<div class="hello__art" id="hello-art" data-filling></div>`;
}

/** Fills an empty slot once the sheet of the hero of the day is read (no art, no picture). */
export async function fillBannerArt() {
  const slot = document.querySelector("#hello-art[data-filling]");
  if (!slot) {
    return;
  }
  const hero = heroOfTheDay();
  const cover = hero ? (await heroSheet(hero))?.art?.cover : null;
  if (!slot.isConnected) {
    return;
  }
  delete slot.dataset.filling;
  if (!cover) {
    return;
  }
  slot.dataset.hero = hero.id;
  slot.innerHTML = `<img ${wide(cover, [640, 960, 1280, 1920], "100vw")} alt="" fetchpriority="high" decoding="async">`;
  slot.classList.add("is-on");
}
