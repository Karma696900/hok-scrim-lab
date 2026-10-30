// The stage that opens the pages of the scrims family (Scrims, History): two real hero covers, one under
// the blue veil and one under the red one, cut by a diagonal, then the title, the big numbers and the
// actions. The covers come from the stored Camp sheets of the heroes (nothing is made up: a hero without a
// cover is skipped, and the stage keeps its navy ground while the pictures arrive).
import { wide } from "../../../shared/media.js";
import { heroSheet } from "../../domain/hero-of-the-day.js";
import { state } from "../../app/app-state.js";

const DAY = 24 * 60 * 60 * 1000;
const COVER_WIDTHS = [640, 960, 1280, 1920];

/** The heroes of the roster that have a portrait, starting from the one of the day (another one tomorrow). */
function candidates(salt, prefer) {
  const pool = state.heroes.filter(
    hero => hero.availableGlobal !== false && !hero.isFlowborn && hero.image
  );
  if (!pool.length) {
    return [];
  }
  const start = (Math.floor(Date.now() / DAY) * 5 + salt * 31) % pool.length;
  const first = prefer.map(id => pool.find(hero => hero.id === id)).filter(Boolean);
  return [...first, ...pool.slice(start), ...pool.slice(0, start)];
}

/**
 * The stage: `title` and `text` are already translated, `figures` are [value, label] pairs, `actions` is
 * the markup of the buttons. `prefer` lists the ids of the heroes whose covers come first.
 */
export function sceneHtml({
  title,
  text,
  figures,
  actions,
  salt = 0,
  prefer = [],
  figuresClass = ""
}) {
  return `<section class="sc-scene keep-dark card--feature" data-salt="${salt}" data-prefer="${prefer.join(",")}">
    <div class="sc-scene__art sc-scene__art--blue" data-cover aria-hidden="true"></div>
    <div class="sc-scene__art sc-scene__art--red" data-cover aria-hidden="true"></div>
    <div class="sc-scene__veil" aria-hidden="true"></div>
    <div class="sc-scene__cut" aria-hidden="true"></div>
    <div class="sc-scene__body">
      <div class="sc-scene__main">
        <div class="page-head sc-scene__head"><div><h1>${title}</h1><p>${text}</p></div></div>
        <div class="hstack wrap sc-scene__actions">${actions}</div>
      </div>
      <ul class="sc-figures ${figuresClass}">${figures
        .map(
          ([value, label]) =>
            `<li><b class="stat-value">${value}</b><span class="stat-label">${label}</span></li>`
        )
        .join("")}</ul>
    </div>
  </section>`;
}

/** Puts the covers in the stage (the first one at once, the next ones when they arrive). */
export async function fillScene() {
  const scene = document.querySelector(".sc-scene");
  if (!scene) {
    return;
  }
  const slots = [...scene.querySelectorAll("[data-cover]")];
  const heroes = candidates(
    Number(scene.dataset.salt) || 0,
    (scene.dataset.prefer || "").split(",").filter(Boolean)
  );
  let cursor = 0;
  for (const [index, slot] of slots.entries()) {
    while (cursor < heroes.length && cursor < 12) {
      const hero = heroes[cursor++];
      const cover = (await heroSheet(hero))?.art?.cover;
      if (!cover) {
        continue;
      }
      if (!slot.isConnected) {
        return;
      }
      slot.innerHTML = `<img ${wide(cover, COVER_WIDTHS, "100vw")} alt="" width="1275" height="718" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
      slot.classList.add("is-ready");
      break;
    }
  }
}
