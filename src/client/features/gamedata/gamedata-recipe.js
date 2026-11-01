// gamedata page, the recipe of an item as in the shop of the game: what it is built from (each part with its
// price, the same part twice when the game asks for it twice, and the gold it still costs to put them together)
// and the items it goes into. Each part is a picture that opens its own sheet. Nothing is invented: no sum when a
// part or a price is missing, nothing at all for an item with no recipe that builds nothing.
import { number, t } from "../../app/browser-i18n.js";
import { pieceImage } from "../build-lab/build-lab-view.js";
import { tierLabel } from "../../domain/catalog-display.js";
import { nameOf } from "./gamedata-page-parts.js";

export { tierLabel };

const part = (view, piece) =>
  `<li><button type="button" class="gd-part" data-pick="${piece.id}" title="${view.esc(nameOf(piece))}">${pieceImage(piece, 48, view.esc)}<span>${view.esc(nameOf(piece))}</span>${piece.price ? `<em>${view.esc(t("{price} gold", { price: number(piece.price) }))}</em>` : ""}</button></li>`;

/** The recipe of `piece`, or "" when it has none and builds nothing. */
export function recipe(view, piece) {
  const items = view.catalog?.items ?? view.all();
  const byId = new Map(items.map(item => [item.id, item]));
  const wanted = piece.components ?? [];
  const parts = wanted.map(id => byId.get(id)).filter(Boolean);
  const into = items.filter(item => item.id !== piece.id && item.components?.includes(piece.id));
  if (!parts.length && !into.length) {
    return "";
  }
  let from = "";
  if (parts.length) {
    const whole =
      parts.length === wanted.length && parts.every(entry => entry.price) && piece.price;
    const rest = whole ? piece.price - parts.reduce((sum, entry) => sum + entry.price, 0) : null;
    from = `<h3>${t("Built from")}</h3><ul class="gd-parts">${parts.map(entry => part(view, entry)).join("")}</ul>${rest !== null && rest >= 0 ? `<p class="gd-combine muted">${view.esc(t("+ {price} gold to put them together", { price: number(rest) }))}</p>` : ""}`;
  }
  const upgrades = into.length
    ? `<h3>${t("Builds into")}</h3><ul class="gd-parts">${into.map(entry => part(view, entry)).join("")}</ul>`
    : "";
  return `<div class="gd-recipe">${from}${upgrades}</div>`;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { recipe };
