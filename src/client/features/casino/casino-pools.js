// casino page, the pool editor (creator only; owner, 2026-11-07: avatars instead of a list): one row per lane with
// every hero of that lane as an avatar, pressed when it is in the pool, "All" and "None" per lane, one search box that
// dims the heroes whose name does not match. Each change is saved by itself a moment after the last click
// (casino-actions.js).
import { t } from "../../app/browser-i18n.js";
import { laneLabel, laneLogos } from "../../domain/lanes.js";
import { slotImage } from "../../lib/dom.js";
import { icon } from "../../../shared/icons.js";
import { LANES } from "./casino-markup.js";

const nameOf = hero => hero.displayName || hero.name || hero.id;

const avatar = (view, key, hero, on) =>
  `<li data-name="${view.esc(nameOf(hero).toLowerCase())}"><button type="button" class="casino-pick" data-action="casino-pool-toggle" data-lane="${key}" data-hero="${view.esc(hero.id)}" aria-pressed="${on}" title="${view.esc(nameOf(hero))}"><span class="casino-pick__art">${slotImage(hero)}</span>${icon("check", "i--sm casino-pick__on")}<span class="visually-hidden">${view.esc(nameOf(hero))}</span></button></li>`;

const row = (view, heroes, pools, [key, lane]) => {
  const pool = new Set(pools?.[key] ?? []);
  const list = heroes
    .filter(hero => (hero.lanes ?? []).includes(lane))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  return `<div class="casino-pool" data-lane="${key}">
    <div class="casino-pool__head">${laneLogos([lane], 22, { decorative: true })}<b>${view.esc(laneLabel(lane))}</b><small data-pool-count="${key}">${pool.size}</small>
      <span class="casino-pool__tools"><button type="button" class="btn btn--ghost btn--sm" data-action="casino-pool-all" data-lane="${key}">${t("All")}</button><button type="button" class="btn btn--ghost btn--sm" data-action="casino-pool-none" data-lane="${key}">${t("None")}</button></span>
    </div>
    <ul class="casino-pool__heroes">${list.map(hero => avatar(view, key, hero, pool.has(hero.id))).join("")}</ul>
  </div>`;
};

/** The pool editor, under the roulette. */
export const poolsMarkup = (view, heroes, pools) => `<section class="casino-pools">
  <div class="casino-pools__head">
    <h2>${icon("sliders", "i--sm")}${t("Hero pools")}</h2>
    <label class="casino-pools__search"><span class="visually-hidden">${t("Search a hero")}</span>${icon("search", "i--sm")}<input type="search" name="casino-search" placeholder="${view.esc(t("Search a hero"))}" autocomplete="off"></label>
    <span class="casino-pools__status" data-pools-status aria-live="polite"></span>
  </div>
  ${LANES.map(lane => row(view, heroes, pools, lane)).join("")}
</section>`;

/** The pools as pressed in `root`, lane by lane. */
export function readPools(root) {
  const pools = Object.fromEntries(LANES.map(([key]) => [key, []]));
  for (const pick of root.querySelectorAll('[data-action="casino-pool-toggle"]')) {
    if (pick.getAttribute("aria-pressed") === "true" && pools[pick.dataset.lane]) {
      pools[pick.dataset.lane].push(pick.dataset.hero);
    }
  }
  return pools;
}
