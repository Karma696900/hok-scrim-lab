// The markup of the page: stage, rail, filters, table, side panel.
import { ARCANA_COLORS, ITEM_CATEGORIES } from "../../../shared/build-model.js";
import { SHOP_CATEGORIES, shopCategoryLabel } from "../../domain/catalog-display.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { number, t } from "../../app/browser-i18n.js";
import { sceneArtSlot } from "../../domain/scene-art.js";
import { categoryLabel, colorLabel } from "./catalog-shared.js";
import { lead } from "./catalog-parts.js";

export const rise = (view, depth = "") => (view.entered ? "" : ` rise${depth}`);

// ---- sorting many items at once ----------------------------------------------------------------

/** The two filters of the items: the slot they go in, and their category in the shop. */
export const itemFilters = view =>
  `<label class="field"><select id="catalog-category" aria-label="${t("Goes in")}"><option value="">${t("All")}</option>${ITEM_CATEGORIES.map(category => `<option value="${category}"${view.categoryFilter === category ? " selected" : ""}>${categoryLabel(category)}</option>`).join("")}</select></label>
            <label class="field"><select id="catalog-shop" aria-label="${t("Category")}"><option value="">${t("All categories")}</option><option value="none"${view.shopFilter === "none" ? " selected" : ""}>${t("No category yet")}</option>${SHOP_CATEGORIES.map(category => `<option value="${category}"${view.shopFilter === category ? " selected" : ""}>${shopCategoryLabel(category)}</option>`).join("")}</select></label>`;

/** Under the filters while sorting: how many are ticked, and what to give them in one click. */
export const sortPanel = (view, rows) => {
  const chosen = view.selectedIn(rows).length;
  const off = chosen ? "" : " disabled";
  return `<div class="sort-panel" role="group" aria-label="${t("Sort several items")}">
      <div class="sort-panel__top"><b>${t("{count, plural, one {# item selected} other {# items selected}}", { count: chosen })}</b>
        <button type="button" class="btn btn--ghost btn--sm" data-sort-all>${t("Select all shown")}</button>
        <button type="button" class="btn btn--ghost btn--sm" data-sort-clear${off}>${t("Clear the selection")}</button></div>
      <div class="sort-panel__row"><span class="muted">${t("Category of the selected items")}</span><div class="hstack wrap">${SHOP_CATEGORIES.map(name => `<button type="button" class="btn btn--sm" data-sort-shop="${name}"${off}>${shopCategoryLabel(name)}</button>`).join("")}<button type="button" class="btn btn--ghost btn--sm" data-sort-shop=""${off}>${t("No category yet")}</button></div></div>
      <div class="sort-panel__row"><span class="muted">${t("Slot of the selected items")}</span><div class="hstack wrap">${ITEM_CATEGORIES.map(name => `<button type="button" class="btn btn--sm" data-sort-slot="${name}"${off}>${categoryLabel(name)}</button>`).join("")}</div></div>
    </div>`;
};

/** One line of the table: opens the entry, or (while sorting) a box to tick. */
export function rowMarkup(view, { id, entry }, cols) {
  const cells = cols
    .map((col, index) =>
      index === 0
        ? `<th scope="row"><div class="ct-name">${view.mainCell(entry)}</div></th>`
        : `<td class="${[col.className ?? "", col.num ? "r" : ""].join(" ").trim()}">${col.cell(entry)}</td>`
    )
    .join("");
  if (view.tab === "hero-tags") {
    return `<tr class="ct-hero-row">${cells}</tr>`;
  }
  if (view.sorting) {
    const on = view.picked.has(id);
    return `<tr class="catalog-entry catalog-entry--pick${on ? " active" : ""}" data-pick-row="${id}"><td class="ct-check"><input type="checkbox" data-pick="${id}"${on ? " checked" : ""} aria-label="${esc(entry.name)}"></td>${cells}</tr>`;
  }
  return `<tr class="catalog-entry${view.editing?.id === id ? " active" : ""}" data-edit="${id}" tabindex="0">${cells}</tr>`;
}

// ---- the page ----------------------------------------------------------------------------------------

/** The number of an entry of the rail: what the section holds, or what waits for a person in the translations. */
export const countOf = (view, name) =>
  name === "translations"
    ? view.translations.waiting() || ""
    : name === "hero-tags"
      ? Object.values(view.catalog.heroTags ?? {}).filter(list => list.length).length
      : view.catalog[name].length;

/** The figures on the stage: what needs a decision, and a way straight to it. */
export function figures(view) {
  const toSort = view.catalog.items.filter(entry => !entry.shopCategory).length;
  const bare = view.catalog.items.filter(entry => !entry.stats.length).length;
  const waiting = view.translations.waiting();
  const figure = (go, count, label) =>
    `<button type="button" class="ws-figure${count ? " is-todo" : ""}" data-ct-go="${go}"><b>${number(count)}</b><span>${label}</span></button>`;
  return `<div class="ws-figures">${figure("shop", toSort, t("Items to sort"))}${figure("stats", bare, t("Items without stats"))}${figure("texts", waiting, t("Texts to translate"))}</div>`;
}

/** The stage: the cover of a hero, the title, the way to see the result, the figures. */
export const stage = view =>
  `<header class="page-head ws-stage keep-dark card--feature${view.rise()}">${sceneArtSlot("ws-stage__art", lead())}
      <div class="ws-stage__main"><h1>${t("Catalog")}</h1><p>${t("The stats, tags, items and arcana of the game, written by hand. Builds are made from them.")}</p>
        <div class="ws-stage__tools"><span class="pill pill--warn">${t("Admin")}</span><a class="btn btn--sm" href="/items">${icon("shield", "i--sm")}${t("Game data")}</a><a class="btn btn--sm" href="/build-lab">${icon("cube", "i--sm")}${t("Build lab")}</a></div></div>
      ${view.figures()}</header>`;

export const rail = view =>
  `<nav class="ws-rail ct-rail" aria-label="${t("Catalog")}">${TABS.map(
    name =>
      `<button type="button" class="ws-rail__item${view.tab === name ? " on" : ""}" aria-current="${view.tab === name}" data-tab="${name}">${icon(TAB_ICONS[name], "i--sm")}<span>${tabLabel(name)}</span>${view.countOf(name) === "" ? "" : `<span class="ws-count${name === "translations" ? " is-todo" : ""}">${number(view.countOf(name))}</span>`}</button>${RULE_AFTER.has(name) ? `<span class="ws-rail__sep"></span>` : ""}`
  ).join("")}</nav>`;

/** On a narrow screen the rail scrolls: the open section is brought into view (the page does not move). */
export function revealTab(view) {
  const rails = view.root?.querySelector(".ws-rail");
  const box = rails?.getBoundingClientRect();
  if (box && box.top >= 0 && box.bottom <= window.innerHeight) {
    rails.querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "center" });
  }
}

/** The chips under the search: the things to fix, how many each has, and the colours of the arcana. */
export function chipsMarkup(view) {
  const defs = view.flagDefs();
  const all = view.collection();
  const flagChips = defs.map(
    ([key, label, test]) =>
      `<button type="button" class="ws-chip${view.flags.has(key) ? " on" : ""}" data-flag="${key}" aria-pressed="${view.flags.has(key)}">${label}<em>${number(all.filter(test).length)}</em></button>`
  );
  const colourChips =
    view.tab === "arcana"
      ? ["", ...ARCANA_COLORS].map(
          color =>
            `<button type="button" class="ws-chip${view.colorFilter === color ? " on" : ""}" data-color="${color}" aria-pressed="${view.colorFilter === color}">${color ? colorLabel(color) : t("All")}</button>`
        )
      : [];
  const chips = [...colourChips, ...flagChips];
  const selects = view.tab === "items" ? view.itemFilters() : "";
  return chips.length || selects
    ? `<div class="ws-chips" role="group" aria-label="${t("Show")}">${selects}${chips.join("")}</div>`
    : "";
}

export function toolbarMarkup(view) {
  const creatable = view.tab !== "hero-tags";
  return `<div class="ws-bar"><label class="field field--search">${icon("search", "i--sm")}<input type="search" id="catalog-filter" placeholder="${t("Filter")}" aria-label="${t("Filter")}" value="${esc(view.filter)}" autocomplete="off"></label>
        <span class="ws-bar__end">${view.tab === "items" ? `<button type="button" class="btn${view.sorting ? " is-on" : ""}" data-sort-toggle aria-pressed="${view.sorting}">${icon("layers", "i--sm")}${view.sorting ? t("Done sorting") : t("Sort several")}</button>` : ""}${creatable ? `<button type="button" class="btn btn--primary" data-new>${icon("plus", "i--sm")}${t("New")}</button>` : ""}</span></div>${view.chipsMarkup()}`;
}

export function tableMarkup(view, rows) {
  if (!rows.length) {
    const narrowed =
      view.filter.trim() ||
      view.flags.size ||
      view.categoryFilter ||
      view.shopFilter ||
      view.colorFilter;
    const start =
      view.tab === "hero-tags" || narrowed
        ? ""
        : `<ol class="ws-steps ct-start">
          <li><b>${t("Stats")}</b><span>${t("Write the stats of the game first: items and arcana are written with them.")}</span></li>
          <li><b>${t("Items")}</b><span>${t("Then the items, the arcana and the spells, each with its picture, its stats and its effects.")}</span></li>
          <li><b>${t("Sort several")}</b><span>${t("Give every item its category in a few clicks, then look at the result in the build lab.")}</span></li>
        </ol>`;
    return `<p class="empty-line ct-empty"><span>${narrowed ? t("No match.") : t("Nothing here yet.")}</span>${view.tab !== "hero-tags" && !narrowed ? `<button type="button" class="btn btn--sm" data-new>${icon("plus", "i--sm")}${t("New")}</button>` : ""}</p>${start}`;
  }
  const cols = view.columns();
  const order = view.sortOf();
  const head = cols
    .map(
      (col, index) =>
        `<th scope="col" class="${[index === 0 ? "ct-first" : "", col.className ?? "", col.num ? "r" : ""].join(" ").trim()}"${order.key === col.key && col.label ? ` aria-sort="${order.dir > 0 ? "ascending" : "descending"}"` : ""}>${col.label ? `<button type="button" class="ws-th" data-order-by="${col.key}">${esc(col.label)}${icon(order.key === col.key ? "up" : "sort", "i--sm")}</button>` : ""}</th>`
    )
    .join("");
  return `<div class="ws-scroll catalog-list"><table class="ws-table ct-table"><thead><tr>${view.sorting ? `<td class="ct-check" aria-hidden="true"></td>` : ""}${head}</tr></thead><tbody>${rows.map(row => view.rowMarkup(row, cols)).join("")}</tbody></table></div>`;
}

/** The panel when a row is open: a form in one column, its actions always in view. */
export function editorMarkup(view) {
  return `<div class="ws-panel__head"><h2>${view.editing.id ? t("Edit") : t("New")}</h2><button type="button" class="btn btn--ghost btn--icon btn--sm" data-cancel aria-label="${t("Cancel")}">${icon("x", "i--sm")}</button></div>
      <form id="catalog-form" class="ct-form" novalidate>
        <div class="ws-panel__body ws-form">${view.formFor(view.editing.draft)}</div>
        <div class="ws-panel__foot"><p class="form-error" role="alert">${esc(view.error)}</p>
          <button type="submit" class="btn btn--primary">${icon("check")}${t("Save")}</button>${view.editing.id ? `<button type="button" class="btn btn--danger" data-delete>${icon("trash")}${t("Delete")}</button>` : ""}<button type="button" class="btn btn--ghost" data-cancel>${t("Cancel")}</button><span class="muted">${t("Ctrl+Enter saves.")}</span></div>
      </form>`;
}

/** The panel while sorting: what to do, and the buttons that give the ticked items their category or slot. */
export const sortingMarkup = (view, rows) =>
  `<div class="ws-panel__head"><h2>${t("Sort several")}</h2></div><div class="ws-panel__body"><p class="empty">${t("Tick the items in the list, then choose their category or their slot.")}</p>${view.sortPanel(rows)}</div>`;

/** The panel when nothing is open: what is left to fix in this section, each with a way to see it. */
export function idleMarkup(view) {
  const all = view.collection();
  const lines = view
    .flagDefs()
    .map(([key, label, test]) => ({ key, label, count: all.filter(test).length }))
    .filter(line => line.count);
  const todo = lines.length
    ? `<ul class="ws-todo">${lines.map(line => `<li class="is-todo"><b>${number(line.count)}</b><span>${line.label}</span><button type="button" class="btn btn--sm" data-flag-go="${line.key}">${t("Show")}</button></li>`).join("")}</ul>`
    : `<p class="empty-line"><span>${t("Nothing to fix here.")}</span></p>`;
  return `<div class="ws-panel__head"><h2>${t("Select an entry or add a new one")}</h2></div>
      <div class="ws-panel__body"><h3 class="ws-title">${t("Needs attention")}</h3>${todo}
        <div class="hstack wrap">${view.tab === "hero-tags" ? "" : `<button type="button" class="btn btn--primary" data-new>${icon("plus", "i--sm")}${t("New")}</button>`}<a class="btn" href="/build-lab">${icon("cube", "i--sm")}${t("Open the build lab")}</a></div></div>`;
}

export function panelMarkup(view, rows) {
  if (view.editing) {
    return view.editorMarkup();
  }
  return view.sorting ? view.sortingMarkup(rows) : view.idleMarkup();
}

// ---- the translations --------------------------------------------------------------------------

/** The section of the translations: the rail and one wide block (the state, then the texts). */
export const translationsPage = (view, inner) =>
  `${view.stage()}<div class="catalog-layout ct-layout is-translations">${view.rail()}<div id="tr-root" class="ct-tr">${inner}</div></div>`;

// The Catalog page (administrators): the stats of the game, the tags, the items, the arcana and the spells,
// entered by hand with their pictures. A work screen: a low stage with the figures that need a decision, a rail
// to move between the sections, a table (sorted and filtered) in the middle and, on the right, a panel that
// edits the open row without covering anything (or, when no row is open, says what is left to fix). Items and
// arcana are written with the stats list (so every stat is displayed properly), and carry tags. A stat is a
// whole number, a number, a percentage or a choice (Melee or Ranged); a line of an item can be temporary and
// can depend on conditions about the hero, and so can each of its passives and actives.

const TABS = ["items", "arcana", "spells", "stats", "tags", "hero-tags", "translations"];

const TAB_ICONS = {
  items: "shield",
  arcana: "gem",
  spells: "bolt",
  stats: "sliders",
  tags: "tag",
  "hero-tags": "users",
  translations: "globe"
};

/** The rail draws a rule after these sections: the pieces, the words they are written with, the texts. */
const RULE_AFTER = new Set(["spells", "hero-tags"]);

const tabLabel = tab =>
  ({
    items: t("Items"),
    arcana: t("Arcana"),
    spells: t("Spells"),
    stats: t("Stats"),
    tags: t("Tags"),
    "hero-tags": t("Hero tags"),
    translations: t("Translations")
  })[tab];

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  rise,
  itemFilters,
  sortPanel,
  rowMarkup,
  countOf,
  figures,
  stage,
  rail,
  revealTab,
  chipsMarkup,
  toolbarMarkup,
  tableMarkup,
  editorMarkup,
  sortingMarkup,
  idleMarkup,
  panelMarkup,
  translationsPage
};
