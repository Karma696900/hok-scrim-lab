// casino page, the pool editor (creator only): five columns, every hero of each lane with a tick when it is in that
// lane's pool, "All" and "None" per lane, one search box filtering the names, and Save.
import { t } from "../../app/browser-i18n.js";
import { laneLabel, laneLogos } from "../../domain/lanes.js";
import { icon } from "../../../shared/icons.js";
import { LANES } from "./casino-markup.js";

const nameOf = hero => hero.displayName || hero.name || hero.id;

const column = (view, heroes, pools, [key, lane]) => {
  const pool = new Set(pools?.[key] ?? []);
  const list = heroes
    .filter(hero => (hero.lanes ?? []).includes(lane))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  return `<fieldset class="casino-pool" data-lane="${key}">
    <legend>${laneLogos([lane], 22, { decorative: true })}<span>${view.esc(laneLabel(lane))}</span> <small data-pool-count="${key}">${pool.size}</small></legend>
    <p class="casino-pool__tools"><button type="button" class="btn btn--ghost btn--sm" data-action="casino-pool-all" data-lane="${key}">${t("All")}</button><button type="button" class="btn btn--ghost btn--sm" data-action="casino-pool-none" data-lane="${key}">${t("None")}</button></p>
    <ul>${list
      .map(
        hero =>
          `<li data-name="${view.esc(nameOf(hero).toLowerCase())}"><label><input type="checkbox" name="casino-pool" data-lane="${key}" value="${view.esc(hero.id)}"${pool.has(hero.id) ? " checked" : ""}><span>${view.esc(nameOf(hero))}</span></label></li>`
      )
      .join("")}</ul>
  </fieldset>`;
};

/** The pool editor, folded under the roulette. */
export const poolsMarkup = (view, heroes, pools) => `<details class="casino-pools">
  <summary>${icon("sliders", "i--sm")}${t("Hero pools")}</summary>
  <form class="casino-pools__form" data-casino-pools>
    <p class="casino-pools__search"><label><span class="visually-hidden">${t("Search a hero")}</span><input type="search" name="casino-search" placeholder="${view.esc(t("Search a hero"))}" autocomplete="off"></label></p>
    <div class="casino-pools__lanes">${LANES.map(lane => column(view, heroes, pools, lane)).join("")}</div>
    <p class="casino-actions"><button type="button" class="btn" data-action="casino-pools-save">${icon("check", "i--sm")}${t("Save the pools")}</button></p>
  </form>
</details>`;

/** The pools as ticked in the editor `form`, lane by lane. */
export function readPools(form) {
  const pools = Object.fromEntries(LANES.map(([key]) => [key, []]));
  for (const box of form.querySelectorAll('input[name="casino-pool"]')) {
    if (box.checked && pools[box.dataset.lane]) {
      pools[box.dataset.lane].push(box.value);
    }
  }
  return pools;
}
