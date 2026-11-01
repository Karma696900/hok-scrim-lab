// gamedata page, markup: tile, group, filters, resultHead, and 12 more.
import {
  ARCANA_COLORS,
  GROUP_OF,
  ITEM_TIERS,
  SHOP_CATEGORIES,
  buildAddress,
  emptyBuild
} from "../../../shared/build-model.js";
import {
  arcanaInOrder,
  itemsInOrder,
  shopCategoryLabel,
  tierLabel
} from "../../domain/catalog-display.js";
import {
  categoryLabel,
  colorLabel,
  pieceDetails,
  pieceImage,
  spellFacts
} from "../build-lab/build-lab-view.js";
import { fillSceneArt, sceneArtSlot, sceneHero } from "../../domain/scene-art.js";
import { icon } from "../../../shared/icons.js";
import { number, t } from "../../app/browser-i18n.js";
import { skeleton } from "../../lib/skeleton.js";
import { tx } from "../../domain/staff-content.js";
import { SECTIONS } from "./gamedata-page-shared.js";
import { nameOf } from "./gamedata-page-parts.js";

// ---- the markup --------------------------------------------------------------------------------------

export const tile = (view, piece) => {
  const cost =
    view.section === "items"
      ? piece.price
        ? t("{price} gold", { price: number(piece.price) })
        : piece.shopCategory
          ? shopCategoryLabel(piece.shopCategory)
          : categoryLabel(piece.category)
      : view.section === "arcana"
        ? colorLabel(piece.color)
        : spellFacts(piece);
  const stats = view.section === "spells" ? [] : view.mainStats(piece);
  return `<a class="gd-tile${piece.id === view.picked ? " is-open" : ""}${view.section === "arcana" ? ` gd-${piece.color}` : ""}" href="/${view.section}/${piece.id}" data-pick="${piece.id}"${piece.id === view.picked ? ' aria-current="true"' : ""} title="${view.esc(nameOf(piece))}"><span class="gd-frame">${pieceImage(piece, 88, view.esc)}</span><b>${view.esc(nameOf(piece))}</b>${cost ? `<em>${view.esc(cost)}</em>` : ""}${stats.length ? `<small>${stats.map(line => `<bdi>${view.esc(line)}</bdi>`).join("<br>")}</small>` : ""}</a>`;
};

/** A filter: a column of buttons, each with how many pieces it holds. */
export const group = (view, title, values, current, name, counts, keepEmpty = false) =>
  `<div class="gd-group"><h2>${view.esc(title)}</h2><div class="gd-chips" role="group" aria-label="${view.esc(title)}">${[
    ["", t("All"), view.all().length],
    ...values.map(([value, text]) => [value, text, counts(value)])
  ]
    .filter(([value, , count]) => keepEmpty || value === "" || count > 0)
    .map(
      ([value, text, count]) =>
        `<button type="button" class="gd-chip${name === "color" && value ? ` gd-dot-${value}` : ""}" aria-pressed="${current === value}" data-${name}="${view.esc(value)}"><span>${view.esc(text)}</span><em>${number(count)}</em></button>`
    )
    .join("")}</div></div>`;

export const filters = view => {
  const parts = [];
  if (view.section === "items") {
    parts.push(
      view.group(
        t("Goes in"),
        SLOTS.map(value => [value, categoryLabel(value)]),
        view.slot,
        "slot",
        value => view.all().filter(piece => piece.category === value).length
      )
    );
    if (view.all().some(piece => piece.tier)) {
      parts.push(
        view.group(
          t("Level"),
          ITEM_TIERS.map(value => [value, tierLabel(value)]),
          view.tier,
          "tier",
          value => view.all().filter(piece => piece.tier === value).length
        )
      );
    }
    if (view.all().some(piece => piece.shopCategory)) {
      parts.push(
        view.group(
          t("Category"),
          SHOP_CATEGORIES.map(value => [value, shopCategoryLabel(value)]),
          view.shop,
          "shop",
          value => view.all().filter(piece => piece.shopCategory === value).length,
          true
        )
      );
    }
  } else if (view.section === "arcana") {
    parts.push(
      view.group(
        t("Color"),
        ARCANA_COLORS.map(value => [value, colorLabel(value)]),
        view.color,
        "color",
        value => view.all().filter(piece => piece.color === value).length
      )
    );
  }
  const sorts = [["name", t("Name")]];
  if (view.section === "items" && view.all().some(piece => piece.price)) {
    sorts.push(["price", t("Price")]);
  }
  if (view.section === "spells" && view.all().some(piece => piece.cooldownSeconds)) {
    sorts.push(["cooldown", t("Cooldown")]);
  }
  if (sorts.length > 1) {
    parts.push(
      `<div class="gd-group"><h2>${t("Sort by")}</h2><div class="gd-chips" role="group" aria-label="${t("Sort by")}">${sorts
        .map(
          ([value, text]) =>
            `<button type="button" class="gd-chip" aria-pressed="${view.order === value}" data-order="${value}"><span>${view.esc(text)}</span></button>`
        )
        .join("")}</div></div>`
    );
  }
  return `<div class="gd-filters__body"><label class="field field--search">${icon("search", "i--sm")}<input id="gd-search" type="search" placeholder="${view.esc(t("Search"))}" aria-label="${view.esc(t("Search"))}" value="${view.esc(view.search)}" autocomplete="off"></label>${parts.join("")}</div>`;
};

/** How many pieces the filters kept, and the way to take the filters off. */
export const resultHead = (view, pieces) =>
  `<span class="gd-count">${t("{count, plural, one {# result} other {# results}}", { count: pieces.length })}</span>${view.filtered() ? `<button type="button" class="btn btn--ghost btn--sm" data-clear>${icon("x", "i--sm")}${t("Clear filters")}</button>` : ""}`;

export const grid = (view, pieces) => {
  if (!pieces.length) {
    return `<p class="gd-none">${icon("search", "i--sm")}<span>${view.all().length ? t("No match.") : t("The catalog is empty for now.")}</span></p>`;
  }
  return pieces.map(view.tile).join("");
};

/** What the sheet shows while no piece is open: how the pieces of the section are shared out. */
export function overview(view) {
  const pieces = view.all();
  const count = test => pieces.filter(test).length;
  // each group is a title and its rows: [label, how many, what to write instead of the number]
  let groups;
  if (view.section === "items") {
    groups = [
      [t("Goes in"), SLOTS.map(value => [categoryLabel(value), count(p => p.category === value)])],
      [t("Level"), ITEM_TIERS.map(value => [tierLabel(value), count(p => p.tier === value)])],
      [
        t("Category"),
        SHOP_CATEGORIES.map(value => [
          shopCategoryLabel(value),
          count(p => p.shopCategory === value)
        ])
      ]
    ];
  } else if (view.section === "arcana") {
    groups = [
      [t("Color"), ARCANA_COLORS.map(value => [colorLabel(value), count(p => p.color === value)])]
    ];
  } else {
    groups = [
      [
        t("Cooldown"),
        pieces
          .filter(piece => piece.cooldownSeconds)
          .sort((a, b) => a.cooldownSeconds - b.cooldownSeconds)
          .map(piece => [
            nameOf(piece),
            piece.cooldownSeconds,
            t("{seconds} s", { seconds: number(piece.cooldownSeconds) })
          ])
      ]
    ];
  }
  const lists = groups
    .map(([title, rows]) => [title, rows.filter(([, many]) => many > 0)])
    .filter(([, rows]) => rows.length)
    .map(([title, rows]) => {
      const top = Math.max(1, ...rows.map(([, many]) => many));
      return `<h3>${view.esc(title)}</h3><ul>${rows
        .map(
          ([label, many, shown]) =>
            `<li><span>${view.esc(label)}</span><b>${shown ? view.esc(shown) : number(many)}</b><span class="bar" aria-hidden="true"><i data-p="${Math.round((many / top) * 100)}"></i></span></li>`
        )
        .join("")}</ul>`;
    })
    .join("");
  return `<div class="gd-overview"><h2>${t("Choose a piece to see its details.")}</h2>${lists}</div>`;
}

/** The way into the build lab with this piece already in a build. */
export function labLink(view, piece) {
  const build = emptyBuild();
  if (view.section === "items") {
    build[GROUP_OF[piece.category] ?? "items"] = [piece.id];
  } else if (view.section === "arcana") {
    build.arcana[piece.color] = [{ id: piece.id, count: 1 }];
  } else {
    build.spells = [piece.id];
  }
  return buildAddress("/build-lab", { build });
}

/** Pieces of the same category or colour, as pictures that open their own sheet. */
export function related(view, piece) {
  const same = view
    .all()
    .filter(
      other =>
        other.id !== piece.id &&
        (view.section === "items"
          ? piece.shopCategory && other.shopCategory === piece.shopCategory
          : view.section === "arcana"
            ? other.color === piece.color
            : false)
    );
  const near = (
    view.section === "items" ? itemsInOrder(same, piece.shopCategory) : arcanaInOrder(same)
  ).slice(0, 8);
  if (!near.length) {
    return "";
  }
  return `<div class="gd-related"><h3>${t("In the same category")}</h3><div>${near
    .map(
      other =>
        `<button type="button" data-pick="${other.id}" aria-label="${view.esc(nameOf(other))}" title="${view.esc(nameOf(other))}">${pieceImage(other, 48, view.esc)}</button>`
    )
    .join("")}</div></div>`;
}

export const detail = view => {
  const piece = view.picked === null ? null : view.all().find(entry => entry.id === view.picked);
  if (!piece) {
    return view.overview();
  }
  const body =
    view.section === "spells"
      ? `<div class="piece-details">${pieceImage(piece, 96, view.esc, "piece-image-big")}<div><h3>${view.esc(nameOf(piece))}</h3><p class="muted">${view.esc(spellFacts(piece)) || view.esc(t("Not entered yet."))}</p>${piece.description ? `<p>${view.esc(tx(piece.description))}</p>` : ""}</div></div>`
      : pieceDetails(view.kindOf(), piece, view.catalog, view.esc);
  // a piece nobody described yet says so in one line, so that its sheet is not a name and nothing else
  const bare =
    view.section !== "spells" &&
    !(piece.stats?.length || piece.effects?.length || piece.description || piece.price);
  return `<button type="button" class="btn btn--ghost btn--icon btn--sm gd-detail__close" data-pick="${piece.id}" aria-label="${t("Close")}">${icon("x", "i--sm")}</button>${body}${bare ? `<p class="gd-missing muted">${icon("info", "i--sm")}${t("Not entered yet.")}</p>` : ""}${view.section === "items" ? view.recipe(piece) : ""}${view.related(piece)}<a class="btn gd-lab" href="${view.esc(view.labLink(piece))}">${icon("layers", "i--sm")}${t("Try it in the build lab")}</a>`;
};

/** Three tabs as big as buttons, each with the number of pieces of its section. */
export const tabs = view =>
  SECTIONS.map(
    name =>
      `<a class="gd-tab${name === view.section ? " is-here" : ""}" href="/${name}" data-count="${view.catalog ? number((view.catalog[name] ?? []).length) : ""}"${name === view.section ? ' aria-current="page"' : ""}>${icon(TAB_ICONS[name])}${view.esc(sectionLabel(name))}</a>`
  ).join("");

/** A few pictures of the section, large, on the stage: real pieces, spread over the list. */
export function stageIcons(view) {
  const pieces = view.all().filter(piece => piece.imageId);
  if (pieces.length < 3) {
    return "";
  }
  const step = Math.max(1, Math.floor(pieces.length / 5));
  return `<div class="gd-stage__icons" aria-hidden="true">${Array.from({ length: Math.min(5, pieces.length) }, (_, index) => pieceImage(pieces[(index * step) % pieces.length], 96, view.esc)).join("")}</div>`;
}

export const stageHero = view => sceneHero(2 + SECTIONS.indexOf(view.section));

/** The heading of the page: the open piece (its own address), or the section. */
export function heading(view) {
  const piece = view.picked === null ? null : view.all().find(entry => entry.id === view.picked);
  return piece ? nameOf(piece) : sectionLabel(view.section);
}

// The sheet of the open piece is `position: fixed` on a small screen, so it must not live inside an element that is
// animated: a finished entrance animation keeps an identity transform, an element with a transform holds its fixed
// descendants, and the sheet would be placed at the bottom of the page, out of sight. The entrance animation is
// therefore on the two columns and not on the body that holds the sheet.
export function paint(view) {
  if (!view.root) {
    return;
  }
  const pieces = view.catalog && !view.problem ? view.list() : [];
  view.root.innerHTML = `<header class="page-head gd-stage keep-dark rise">${sceneArtSlot("gd-stage__art", view.stageHero())}<div class="gd-stage__title"><h1>${view.esc(view.heading())}</h1><p>${view.esc(sectionLead(view.section))}</p></div>${view.catalog ? view.stageIcons() : ""}<nav class="gd-tabs" aria-label="${view.esc(t("Game data"))}">${view.tabs()}</nav></header>${
    view.problem
      ? `<div class="gd-error" role="alert">${icon("warn", "i--sm")}<span>${view.esc(view.problem)}</span><button type="button" class="btn btn--sm" data-retry>${icon("refresh", "i--sm")}${t("Try again")}</button></div>`
      : view.catalog
        ? `<div class="gd-body"><aside class="gd-filters rise d-1${view.filtersOpen ? " is-open" : ""}" id="gd-filters"><button type="button" class="btn gd-filters__toggle" data-gd-filters aria-expanded="${view.filtersOpen}">${icon("sliders", "i--sm")}${t("Filters")}</button>${view.filters()}</aside><section class="gd-main rise d-1"><div class="gd-resulthead" id="gd-resulthead">${view.resultHead(pieces)}</div><div class="gd-grid" id="gd-grid">${view.grid(pieces)}</div></section><aside class="gd-detail card card--feature${view.picked === null ? " is-idle" : " is-open"}" id="gd-detail" aria-live="polite">${view.detail()}</aside></div>`
        : `<div class="gd-body">${skeleton("grid", 8)}</div>`
  }`;
  fillSceneArt(view.root.querySelector(".gd-stage__art"), view.stageHero());
}

/** The grid, the count and the sheet again; the filters and what is typed in the search are left alone. */
export function repaintResults(view) {
  const pieces = view.list();
  view.root.querySelector("#gd-grid").innerHTML = view.grid(pieces);
  view.root.querySelector("#gd-resulthead").innerHTML = view.resultHead(pieces);
  view.repaintDetail();
}

export function repaintDetail(view) {
  const sheet = view.root.querySelector("#gd-detail");
  sheet.innerHTML = view.detail();
  sheet.classList.toggle("is-idle", view.picked === null);
  sheet.classList.toggle("is-open", view.picked !== null);
}

/** Draws everything again and puts the focus back on the control that was used. */
export function repaintKeepingFocus(view) {
  const active = document.activeElement;
  const key = active?.dataset
    ? ["slot", "shop", "tier", "color", "order"].find(name => name in active.dataset)
    : null;
  const value = key ? active.dataset[key] : null;
  view.paint();
  if (key) {
    view.root.querySelector(`[data-${key}="${CSS.escape(value)}"]`)?.focus();
  }
}

const SLOTS = ["boots", "regular", "utility", "late"];

const TAB_ICONS = { items: "gem", arcana: "star", spells: "bolt" };

const sectionLabel = section =>
  ({ items: t("Items"), arcana: t("Arcana"), spells: t("Spells") })[section] ?? section;

const sectionLead = section =>
  ({
    items: t("Every item of the game, by slot and by shop category."),
    arcana: t("The arcana of the game, red, blue and green, and what each one gives."),
    spells: t("The spells a player takes into a match: what they do and when they come back.")
  })[section];

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  tile,
  group,
  filters,
  resultHead,
  grid,
  overview,
  labLink,
  related,
  detail,
  tabs,
  stageIcons,
  stageHero,
  heading,
  paint,
  repaintResults,
  repaintDetail,
  repaintKeepingFocus
};
