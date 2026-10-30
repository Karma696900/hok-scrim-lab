// The build being edited: the index of the catalog, setting the build, what can be added.
import {
  GROUP_OF,
  SLOTS,
  checkBuild,
  emptyBuild,
  formatEntry,
  indexCatalog
} from "../../../shared/build-model.js";
import { escapeHtml } from "../../lib/escape.js";
import { t } from "../../app/browser-i18n.js";
import { tx } from "../../domain/staff-content.js";

export const index = view => {
  const catalog = view.getCatalog();
  if (view.indexed.catalog !== catalog) {
    view.indexed = { catalog, index: indexCatalog(catalog) };
  }
  return view.indexed.index;
};

/** Takes a build (a link, a saved build, a recommended one) and says what is wrong with it. */
export function setBuild(view, raw) {
  // An item that left the build is no longer a core item (not a mistake of the visitor).
  const result = checkBuild(
    { ...raw, core: (raw.core ?? []).filter(id => (raw.items ?? []).includes(id)) },
    view.getCatalog()
  );
  view.build = result.build;
  view.error = result.problems.length
    ? t(result.problems[0].template, result.problems[0].params)
    : "";
}

export const usedItems = view =>
  new Set([...view.build.items, ...view.build.utility, ...view.build.late]);

/** Can this item still be added? (slot left, right group, not already in, one pair of boots) */
export function canAdd(view, item) {
  const group = GROUP_OF[item.category];
  if (view.usedItems().has(item.id) || view.build[group].length >= SLOTS[group]) {
    return false;
  }
  return !(
    item.category === "boots" &&
    view.build.items.some(id => view.index().items.get(id)?.category === "boots")
  );
}

/** The two or three first stats of a piece, as a short line (the ones that always count come first). */
export const statsLine = (view, piece) => {
  const lines = piece.stats ?? [];
  const main = lines.filter(line => !line.temporary && !line.when);
  return (main.length ? main : lines)
    .slice(0, 3)
    .map(line => {
      const stat = view.index().stats.get(line.statId);
      return stat
        ? `<bdi>${escapeHtml(formatEntry(stat, line, tx))} ${escapeHtml(tx(stat.name).toLocaleLowerCase())}</bdi>`
        : "";
    })
    .filter(Boolean)
    .join(", ");
};

export function changeArcana(view, id, delta) {
  const piece = view.index().arcana.get(id);
  const list = view.build.arcana[piece.color].map(entry => ({ ...entry }));
  const entry = list.find(row => row.id === id);
  if (entry) {
    entry.count += delta;
  } else if (delta > 0) {
    list.push({ id, count: 1 });
  }
  view.setBuild({
    ...view.build,
    arcana: { ...view.build.arcana, [piece.color]: list.filter(row => row.count > 0) }
  });
}

export function clear(view) {
  view.setBuild(emptyBuild());
  view.info = null;
}

export function closeInfo(view) {
  view.info = null;
}

/** The piece a reference like "item:12" stands for, as { kind, piece }, or null. */
export function lookup(view, reference) {
  const [kind, id] = String(reference).split(":");
  const piece = (
    kind === "item"
      ? view.index().items
      : kind === "spell"
        ? view.index().spells
        : view.index().arcana
  ).get(Number(id));
  return piece ? { kind, piece } : null;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  index,
  setBuild,
  usedItems,
  canAdd,
  statsLine,
  changeArcana,
  clear,
  closeInfo,
  lookup
};
