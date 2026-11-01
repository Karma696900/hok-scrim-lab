import { SHOP_CATEGORIES, compareArcana, compareItems } from "../../shared/build-model.js";
import { t, compareText } from "../app/browser-i18n.js";
import { tx } from "./staff-content.js";

// The pictures of the catalogue are kept at up to 256 px and the server gives them in three sizes. A
// page asks for the size it draws (and, for a sharp screen, the next one up) so that a list of fifty
// items does not download fifty pictures made for a close-up.
const WIDTHS = [64, 128, 256];
const fit = pixels => WIDTHS.find(width => width >= pixels) ?? WIDTHS.at(-1);

/**
 * The same picture in a cell whose width follows the screen: the three sizes as width descriptors and the
 * `sizes` rule of the cell, so that the browser takes the one that fits (and never one made for a close-up).
 */
export function catalogImageFluid(imageId, sizes) {
  const base = `/catalog-images/${encodeURIComponent(imageId)}`;
  return `src="${base}?w=128" srcset="${WIDTHS.map(width => `${base}?w=${width} ${width}w`).join(", ")}" sizes="${sizes}"`;
}

/** The `src` and `srcset` attributes of the picture of an item or an arcana drawn `size` px wide. */
export function catalogImageAttrs(imageId, size) {
  const base = `/catalog-images/${encodeURIComponent(imageId)}`;
  const one = fit(size);
  const two = fit(size * 2);
  return `src="${base}?w=${one}" srcset="${base}?w=${one} 1x, ${base}?w=${two} 2x"`;
}

// The shop categories of an item (Physical, Magical, Defense, Movement, Jungling, Roaming): the tab of
// the shop of the game it is found under. Not the slot it goes in (boots, item, utility, late-game).

export { SHOP_CATEGORIES };

/** The name of a shop category. */
export const shopCategoryLabel = category =>
  ({
    physical: t("Physical"),
    magical: t("Magical"),
    defense: t("Defense"),
    movement: t("Movement"),
    jungling: t("Jungling"),
    roaming: t("Roaming")
  })[category] ?? category;

/** The level of an item in the shop of the game (a small basic one up to an enchanted one), or "". */
export const tierLabel = tier =>
  tier
    ? ({
        basic: t("Basic"),
        intermediate: t("Intermediate"),
        final: t("Final"),
        enchanted: t("Enchanted")
      }[tier] ?? tier)
    : "";

// The order the pieces of the catalogue are listed in, on every page that lists them (the data of the game, the
// picker of the build lab): the rules are those of shared/build-model.js (compareArcana, compareItems), applied to
// the names as the visitor reads them, in the alphabet of their language.

/** Two pieces by the name the visitor reads (the staff's translation of it when there is one). */
const byShownName = (a, b) => compareText(tx(a.name), tx(b.name));

/** Arcana: by colour (red, blue, green), then by name. */
export const arcanaInOrder = pieces => [...pieces].sort((a, b) => compareArcana(a, b, byShownName));

/** Items of one shop category ("" for any): by name, the Roaming ones by type first (Guardian, Crimson Shadow). */
export const itemsInOrder = (pieces, shopCategory = "") =>
  [...pieces].sort(compareItems(shopCategory, byShownName));

/** Any other piece (a spell): by name. */
export const piecesByName = pieces => [...pieces].sort(byShownName);
