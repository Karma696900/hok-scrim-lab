// What the tier lists and the official ratings have in common: they are drawn on the same board, a
// coloured label for each tier and the round portraits of its heroes next to it. The two pages differ
// in what can be done on the board (rename and move the tiers, or rate a fixed set), not in how it looks.
import { responsive } from "../../shared/media.js";
import { tierKey } from "../../shared/tier-names.js";

/** The round portrait of a hero (a plain disc while it has no picture). */
export function tierPortrait(hero) {
  return hero?.image
    ? `<img class="tier-portrait" draggable="false" ${responsive(hero.image, 64)} alt="" loading="lazy" decoding="async">`
    : `<span class="tier-portrait image-fallback"></span>`;
}

/** Gives a row of the board the colour of the name its tier has now (a rename does not draw the board again). */
export function recolourTier(row, label) {
  const key = tierKey(label);
  if (key) {
    row.dataset.tier = key;
  } else {
    delete row.dataset.tier;
  }
}

/**
 * A row of the board: the label on its colour, then the place where the heroes of the tier are.
 * `tier` is the name the colour is chosen from (a name that is not SS, S, A, B, C or D takes the colour
 * of its place); `label` and `heroes` are markup; `drop` is the attributes of the place (what a page
 * needs to find it when a hero is dropped); `unranked` is the dashed row of the heroes not placed yet.
 */
export function tierRow({ tier = "", label, drop = "", heroes, unranked = false }) {
  const key = tierKey(tier);
  return `<section class="tier-row${unranked ? " tier-unranked" : ""}"${key ? ` data-tier="${key}"` : ""}><div class="tier-label">${label}</div><div class="tier-drop tier-drop-avatars"${drop}>${heroes}</div></section>`;
}
