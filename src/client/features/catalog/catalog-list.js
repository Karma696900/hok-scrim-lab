// What the table of a section shows: its filters, its columns, its order.
import { ARCANA_COLORS, ITEM_CATEGORIES } from "../../../shared/build-model.js";
import { STAT_UNITS, isChoice } from "../../../shared/stat-values.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { laneLogos } from "../../domain/lanes.js";
import { number, t } from "../../app/browser-i18n.js";
import { shopCategoryLabel } from "../../domain/catalog-display.js";
import { categoryLabel, colorLabel, unitLabel } from "./catalog-shared.js";
import { heroName, numberCell } from "./catalog-parts.js";

/** The things to fix in each section: [key, what it says, which entries it is true of]. */
export const flagDefs = view =>
  ({
    items: [
      ["shop", t("Without a category"), entry => !entry.shopCategory],
      ["stats", t("Without stats"), entry => !entry.stats.length],
      ["price", t("Without a price"), entry => !entry.price],
      ["text", t("Without a description"), entry => !entry.description.trim()]
    ],
    arcana: [
      ["stats", t("Without stats"), entry => !entry.stats.length],
      ["text", t("Without a description"), entry => !entry.description.trim()]
    ],
    spells: [
      ["cooldown", t("Without a cooldown"), entry => entry.cooldownSeconds == null],
      ["level", t("Without an unlock level"), entry => entry.unlockLevel == null],
      ["text", t("Without a description"), entry => !entry.description.trim()]
    ],
    stats: [
      [
        "unused",
        t("Not used yet"),
        entry => {
          const use = view.statUse(entry.id);
          return !use.items && !use.arcana;
        }
      ]
    ],
    tags: [
      [
        "unused",
        t("Not used yet"),
        entry => {
          const use = view.tagUse(entry.id);
          return !use.items && !use.arcana && !use.heroes;
        }
      ]
    ],
    "hero-tags": [["none", t("Without a tag"), hero => !view.tagsOfHero(hero).length]]
  })[view.tab] ?? [];

/** The entries of the section that is open (before any filter). */
export const collection = view =>
  view.tab === "hero-tags" ? view.heroes : (view.catalog[view.tab] ?? []);

const num = (key, label, value) => ({
  key,
  label,
  value,
  num: true,
  className: "ct-opt2",
  cell: entry => `<span class="num">${number(value(entry))}</span>`
});

/** The columns of the table of each section: the first one is the name, with the picture. */
const COLUMNS = {
  items: view => [
    { key: "name", label: t("Name"), value: entry => entry.name },
    {
      key: "slot",
      label: t("Goes in"),
      className: "ct-opt2",
      value: entry => ITEM_CATEGORIES.indexOf(entry.category),
      cell: entry => esc(categoryLabel(entry.category))
    },
    {
      key: "shop",
      label: t("Category"),
      value: entry => entry.shopCategory ?? "~",
      cell: entry =>
        entry.shopCategory
          ? `<span class="pill pill--grey">${esc(shopCategoryLabel(entry.shopCategory))}</span>`
          : `<span class="ws-none">&mdash;</span>`
    },
    {
      key: "price",
      label: t("Price"),
      value: entry => entry.price ?? -1,
      num: true,
      className: "ct-opt",
      cell: entry => numberCell(entry.price || null)
    },
    {
      key: "tags",
      label: t("Tags"),
      value: entry => entry.tags.length,
      className: "ct-opt",
      cell: entry => view.tagCell(entry.tags)
    }
  ],
  arcana: view => [
    { key: "name", label: t("Name"), value: entry => entry.name },
    {
      key: "color",
      label: t("Colour"),
      value: entry => ARCANA_COLORS.indexOf(entry.color),
      cell: entry =>
        `<span class="ct-colour ct-colour--${esc(entry.color)}">${esc(colorLabel(entry.color))}</span>`
    },
    {
      key: "tags",
      label: t("Tags"),
      value: entry => entry.tags.length,
      className: "ct-opt",
      cell: entry => view.tagCell(entry.tags)
    }
  ],
  spells: () => [
    { key: "name", label: t("Name"), value: entry => entry.name },
    {
      key: "cooldown",
      label: t("Cooldown (s)"),
      value: entry => entry.cooldownSeconds ?? -1,
      num: true,
      cell: entry => numberCell(entry.cooldownSeconds)
    },
    {
      key: "level",
      label: t("Unlocked at level"),
      className: "ct-opt2",
      value: entry => entry.unlockLevel ?? -1,
      num: true,
      cell: entry => numberCell(entry.unlockLevel)
    }
  ],
  stats: view => [
    { key: "name", label: t("Name"), value: entry => entry.name },
    {
      key: "unit",
      label: t("Shown as"),
      value: entry => STAT_UNITS.indexOf(entry.unit),
      cell: entry => esc(unitText(entry))
    },
    num("order", t("Position in the lists"), entry => entry.sortOrder),
    num("items", t("Items"), entry => view.statUse(entry.id).items),
    num("arcana", t("Arcana"), entry => view.statUse(entry.id).arcana)
  ],
  tags: view => [
    { key: "name", label: t("Name"), value: entry => entry.name },
    {
      key: "meaning",
      label: t("What it means (optional)"),
      value: entry => entry.description,
      className: "ct-opt",
      cell: entry =>
        entry.description ? esc(entry.description) : `<span class="ws-none">&mdash;</span>`
    },
    num("items", t("Items"), entry => view.tagUse(entry.id).items),
    num("arcana", t("Arcana"), entry => view.tagUse(entry.id).arcana),
    num("heroes", t("Heroes"), entry => view.tagUse(entry.id).heroes)
  ],
  heroes: view => [
    { key: "name", label: t("Hero"), value: hero => heroName(hero) },
    {
      key: "lanes",
      label: t("Lane"),
      value: hero => (hero.lanes ?? []).length,
      className: "ct-opt",
      cell: hero => laneLogos(hero.lanes ?? [], 24)
    },
    {
      key: "tags",
      label: t("Tags"),
      value: hero => view.tagsOfHero(hero).length,
      cell: hero => view.tagCell(view.tagsOfHero(hero).map(tag => tag.id))
    },
    {
      key: "open",
      label: "",
      value: () => 0,
      cell: hero =>
        `<a class="btn btn--ghost btn--sm" href="/heroes/${encodeURIComponent(hero.id)}">${t("See the hero page")}</a>`
    }
  ]
};

/** The columns of the table of the section that is open (the hero tags use the table of the heroes). */
export const columns = view => (COLUMNS[view.tab] ?? COLUMNS.heroes)(view);

// ---- the filters and the order ---------------------------------------------------------------------

/** Passes an item through the category filter of the list (the slot has its own). */
export const shopMatches = (view, entry) =>
  !view.shopFilter ||
  (view.shopFilter === "none" ? !entry.shopCategory : entry.shopCategory === view.shopFilter);

// the arcana list by colour (red, blue, green) then by name, like everywhere else; the rest by name
export const sortOf = view =>
  view.sorts[view.tab] ?? {
    key: view.tab === "stats" ? "order" : view.tab === "arcana" ? "color" : "name",
    dir: 1
  };

export function listFor(view) {
  const needle = view.filter.trim().toLocaleLowerCase();
  const defs = view.flagDefs();
  const flagged = entry =>
    [...view.flags].every(key => defs.find(def => def[0] === key)?.[2](entry) ?? true);
  const entries = view.collection().filter(entry => {
    const name = view.tab === "hero-tags" ? heroName(entry) : entry.name;
    return (
      (!needle || name.toLocaleLowerCase().includes(needle)) &&
      flagged(entry) &&
      (view.tab !== "items" ||
        ((!view.categoryFilter || entry.category === view.categoryFilter) &&
          view.shopMatches(entry))) &&
      (view.tab !== "arcana" || !view.colorFilter || entry.color === view.colorFilter)
    );
  });
  const { key, dir } = view.sortOf();
  const value = (view.columns().find(col => col.key === key) ?? view.columns()[0]).value;
  const nameOf = entry => (view.tab === "hero-tags" ? heroName(entry) : entry.name);
  entries.sort((a, b) => {
    const [x, y] = [value(a), value(b)];
    const order =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
    return (order || nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: "base" })) * dir;
  });
  return entries.map(entry => ({ id: entry.id, entry }));
}

/** The ticked items that the list shows now (a tick on an item the filters hide counts for nothing). */
export const selectedIn = (view, rows) =>
  rows.filter(row => view.picked.has(row.id)).map(row => row.id);

/** What a stat is, for the list: its unit, and for a choice its options. */
const unitText = stat =>
  isChoice(stat)
    ? t("Choice: {options}", { options: stat.options.map(option => option.name).join(" / ") })
    : unitLabel(stat.unit);

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { flagDefs, collection, columns, shopMatches, sortOf, listFor, selectedIn };
