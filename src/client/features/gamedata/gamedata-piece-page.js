// gamedata page, the page of one piece (/items/12, /arcana/3, /spells/5), opened from its address: its sheet, large,
// then a few pieces of the same category and the way to the whole list (owner, 2026-11-15). The list with its filters
// stays on /items, /arcana and /spells: 145 pages that each showed the whole catalogue were read as copies of one
// another by search engines.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { arcanaInOrder, itemsInOrder, piecesByName } from "../../domain/catalog-display.js";

/** The pieces a page shows under its sheet. */
const MORE = 6;

/** Pieces of the same category (items) or colour (arcana), or the other spells: the nearest first. */
export function neighbours(view, piece) {
  const others = view.all().filter(other => other.id !== piece.id);
  if (view.section === "items") {
    const same = others.filter(
      other => piece.shopCategory && other.shopCategory === piece.shopCategory
    );
    return itemsInOrder(same, piece.shopCategory);
  }
  if (view.section === "arcana") {
    return arcanaInOrder(others.filter(other => other.color === piece.color));
  }
  return piecesByName(others);
}

/** The whole page of `piece`: what paint() draws under the stage when the address names a piece. */
export function piecePage(view, piece) {
  const more = neighbours(view, piece).slice(0, MORE);
  // t with a literal key each time (the key tool reads them)
  const heading = view.section === "spells" ? t("Other spells") : t("In the same category");
  const every =
    view.section === "items"
      ? t("See every item")
      : view.section === "arcana"
        ? t("See every arcana")
        : t("See every spell");
  return `<div class="gd-page rise d-1"><article class="gd-detail gd-detail--page card card--feature is-open" id="gd-detail">${view.detail()}</article><section class="gd-more" aria-labelledby="gd-more-title"><h2 id="gd-more-title">${view.esc(heading)}</h2>${more.length ? `<div class="gd-grid gd-grid--more">${more.map(view.tile).join("")}</div>` : ""}<a class="btn btn--lg gd-all" href="/${view.section}">${view.esc(every)}${icon("arrow", "i--sm")}</a></section></div>`;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { neighbours, piecePage };
