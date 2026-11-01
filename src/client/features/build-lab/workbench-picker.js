// The pieces to add: the grid, the categories, the bar above.
import {
  ARCANA_COLORS,
  ARCANA_PER_COLOR,
  GROUP_OF,
  SPELLS_MAX,
  arcanaTotal,
  inBuilds
} from "../../../shared/build-model.js";
import {
  SHOP_CATEGORIES,
  arcanaInOrder,
  itemsInOrder,
  piecesByName,
  shopCategoryLabel
} from "../../domain/catalog-display.js";
import { categoryLabel, colorLabel, groupLabel, pieceImage } from "./build-lab-view.js";
import { escapeHtml } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { number, t } from "../../app/browser-i18n.js";
import { state } from "../../app/app-state.js";
import { tx } from "../../domain/staff-content.js";

export function pickerGrid(view) {
  const catalog = view.getCatalog();
  const needle = view.search.trim().toLocaleLowerCase();
  const matches = piece =>
    !needle ||
    tx(piece.name).toLocaleLowerCase().includes(needle) ||
    piece.name.toLocaleLowerCase().includes(needle);
  let cells;
  if (view.tab === "spells") {
    cells = piecesByName((catalog.spells ?? []).filter(matches)).map(piece => ({
      kind: "spell",
      piece,
      // a spell already taken can be clicked to take it out; a third one is not offered
      disabled: !view.build.spells.includes(piece.id) && view.build.spells.length >= SPELLS_MAX,
      count: view.build.spells.includes(piece.id) ? 1 : 0
    }));
  } else if (ARCANA_COLORS.includes(view.tab)) {
    const total = arcanaTotal(view.build.arcana[view.tab]);
    cells = arcanaInOrder(
      catalog.arcana.filter(piece => piece.color === view.tab && matches(piece))
    ).map(piece => ({
      kind: "arcana",
      piece,
      disabled: total >= ARCANA_PER_COLOR,
      count: view.build.arcana[view.tab].find(entry => entry.id === piece.id)?.count ?? 0
    }));
  } else {
    cells = itemsInOrder(
      catalog.items.filter(
        piece =>
          GROUP_OF[piece.category] === view.tab &&
          inBuilds(piece) &&
          (!view.shop || piece.shopCategory === view.shop) &&
          matches(piece)
      ),
      view.shop
    ).map(piece => ({
      kind: "item",
      piece,
      disabled: !view.canAdd(piece),
      count: view.usedItems().has(piece.id) ? 1 : 0
    }));
  }
  // a slot that no item of the catalogue goes in yet: that is not "no match", and the staff can put that right
  if (
    !cells.length &&
    (view.tab === "utility" || view.tab === "late") &&
    !catalog.items.some(piece => GROUP_OF[piece.category] === view.tab)
  ) {
    return `<div class="empty">${icon("layers")}<b>${t("No item goes in this slot yet.")}</b><span>${t("An administrator chooses the slot of each item in the Catalog.")}</span>${state.auth?.user?.isAdmin ? `<a class="btn btn--sm" href="/catalog">${t("Open the Catalog")}</a>` : ""}</div>`;
  }
  if (!cells.length) {
    return `<div class="empty">${icon("search")}<b>${catalog.items.length || catalog.arcana.length || (catalog.spells ?? []).length ? t("No match.") : t("The catalog is empty for now.")}</b></div>`;
  }
  return `<div class="catalog lab-grid">${cells
    .map(({ kind, piece, disabled, count }) => {
      const detail =
        kind === "item"
          ? piece.shopCategory
            ? shopCategoryLabel(piece.shopCategory)
            : categoryLabel(piece.category)
          : colorLabel(piece.color);
      const price =
        kind === "item" && piece.price
          ? `<em>${t("{price} gold", { price: number(piece.price) })}</em>`
          : "";
      return `<button type="button" class="it${count ? " chosen" : ""}" data-add="${kind}:${piece.id}"${disabled ? " disabled" : ""} aria-label="${escapeHtml(tx(piece.name))}" title="${escapeHtml(tx(piece.name))}"><span class="orb">${pieceImage(piece, 64, escapeHtml)}${kind === "arcana" && count ? `<span class="avatar-count">×${count}</span>` : ""}</span><span><b>${escapeHtml(tx(piece.name))}</b><small>${view.statsLine(piece) || escapeHtml(detail)}</small>${price}</span></button>`;
    })
    .join("")}</div>`;
}

/** The categories of the shop narrow the items down: drawn once an administrator has sorted some. */
export const categoryChips = view =>
  ARCANA_COLORS.includes(view.tab) ||
  view.tab === "spells" ||
  !view.getCatalog().items.some(piece => piece.shopCategory)
    ? ""
    : `<div class="seg lab-categories" role="group" aria-label="${t("Category")}">${["", ...SHOP_CATEGORIES].map(name => `<button type="button" class="${view.shop === name ? "on" : ""}" aria-pressed="${view.shop === name}" data-shop="${name}">${name ? shopCategoryLabel(name) : t("All")}</button>`).join("")}</div>`;

/** The card of the pieces to add: a search, the groups, the pieces. */
export function pickerCard(view, { depth = "d-3" } = {}) {
  return `<section class="card rise ${depth}">
              <div class="card__head"><h2>${t("Add")}</h2><label class="field field--search">${icon("search", "i--sm")}<input id="lab-search" type="search" placeholder="${t("Search")}" aria-label="${t("Search")}" value="${escapeHtml(view.search)}" autocomplete="off"></label></div>
              <div class="tabs lab-tabs" role="tablist" aria-label="${t("Add")}">${TABS.map(name => `<button type="button" role="tab" class="${view.tab === name ? "on" : ""}" aria-selected="${view.tab === name}" data-tab="${name}">${tabLabel(name)}</button>`).join("")}</div>
              ${view.categoryChips()}
            <div id="lab-grid">${view.pickerGrid()}</div>
            </section>`;
}

/**
 * The bar above the pieces of the lab: three big tabs (items, arcana, spells) with how many pieces
 * each holds, the search, the slots or the colours as pills under them, and the shop categories.
 */
export function catalogBar(view) {
  const catalog = view.getCatalog();
  const holds = {
    items: catalog.items.filter(inBuilds).length,
    red: catalog.arcana.length,
    spells: (catalog.spells ?? []).length
  };
  const labels = { items: groupLabel("items"), red: t("Arcana"), spells: groupLabel("spells") };
  const mainTab = ([name, group]) =>
    `<button type="button" role="tab" class="${group.includes(view.tab) ? "on" : ""}" aria-selected="${group.includes(view.tab)}" data-tab="${name}">${labels[name]}<em>${number(holds[name])}</em></button>`;
  const group = MAIN_TABS.find(([, tabs]) => tabs.includes(view.tab))?.[1] ?? [];
  const pills =
    group.length > 1
      ? `<div class="lb-pills" role="group" aria-label="${t("Goes in")}">${group
          .map(
            name =>
              `<button type="button" class="lb-pill${ARCANA_COLORS.includes(name) ? ` lb-pill--${name}` : ""}${view.tab === name ? " on" : ""}" aria-pressed="${view.tab === name}" data-tab="${name}">${tabLabel(name)}</button>`
          )
          .join("")}</div>`
      : "";
  return `<div class="lab-tabs lb-tabs"><div class="lb-tabs__main" role="tablist" aria-label="${t("Add")}">${MAIN_TABS.map(mainTab).join("")}</div><label class="field field--search">${icon("search", "i--sm")}<input id="lab-search" type="search" placeholder="${t("Search")}" aria-label="${t("Search")}" value="${escapeHtml(view.search)}" autocomplete="off"></label>${pills}${view.categoryChips()}</div>`;
}

// What the build lab and the builds editor both draw and handle: the build itself (the items in their
// slots, the arcana by colour), the pieces to add it from and the details of a piece. The page that
// uses it draws the rest (the stats and the hero for the lab, the list of heroes for the editor) and
// repaints when a click or an input was handled here.

const TABS = ["items", "utility", "late", "spells", "red", "blue", "green"];

const tabLabel = tab => (ARCANA_COLORS.includes(tab) ? colorLabel(tab) : groupLabel(tab));

/** The three big tabs of the lab: the tab each one opens, and the tabs it holds (items and their slots, the arcana, the spells). */
const MAIN_TABS = [
  ["items", ["items", "utility", "late"]],
  ["red", ARCANA_COLORS],
  ["spells", ["spells"]]
];

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { pickerGrid, categoryChips, pickerCard, catalogBar };
