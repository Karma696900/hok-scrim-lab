// gamedata page, small helpers: kindOf, all, nameOf, matches, and 4 more.
import { arcanaInOrder, itemsInOrder, piecesByName } from "../../domain/catalog-display.js";
import { formatEntry, indexCatalog } from "../../../shared/build-model.js";
import { tx } from "../../domain/staff-content.js";

export const kindOf = view => ({ items: "item", arcana: "arcana", spells: "spell" })[view.section];

export const all = view => (view.catalog ? (view.catalog[view.section] ?? []) : []);

export const nameOf = piece => tx(piece.name);

export const matches = (view, piece) => {
  const needle = view.search.trim().toLocaleLowerCase();
  return (
    !needle ||
    nameOf(piece).toLocaleLowerCase().includes(needle) ||
    piece.name.toLocaleLowerCase().includes(needle)
  );
};

/** The pieces the filters let through, in the order that was asked for. */
export const list = view => {
  let pieces = view.all().filter(view.matches);
  if (view.section === "items") {
    pieces = itemsInOrder(
      pieces.filter(
        piece =>
          (!view.slot || piece.category === view.slot) &&
          (!view.shop || piece.shopCategory === view.shop)
      ),
      view.shop
    );
  } else if (view.section === "arcana") {
    // by colour (red, blue, green) then by name, whether all the arcana are shown or one colour
    pieces = arcanaInOrder(pieces.filter(piece => !view.color || piece.color === view.color));
  } else {
    pieces = piecesByName(pieces);
  }
  const key = view.order === "price" ? "price" : view.order === "cooldown" ? "cooldownSeconds" : "";
  if (key) {
    // the pieces that have the number come first, from the smallest; the others stay in name order after them
    pieces = [...pieces].sort((a, b) => (a[key] ?? Infinity) - (b[key] ?? Infinity));
  }
  return pieces;
};

export const filtered = view => Boolean(view.search.trim() || view.slot || view.shop || view.color);

/** The two main stats of a piece (the ones that always count come first), as short lines. */
export function mainStats(view, piece) {
  const stats = indexCatalog(view.catalog).stats;
  const lines = piece.stats ?? [];
  const main = lines.filter(line => !line.temporary && !line.when);
  return (main.length ? main : lines)
    .map(line => {
      const stat = stats.get(line.statId);
      return stat ? `${formatEntry(stat, line, tx)} ${tx(stat.name)}` : "";
    })
    .filter(Boolean)
    .slice(0, 2);
}

// ---- events ------------------------------------------------------------------------------------------

/** Asks for the catalogue and draws the page with it (or with the line that says why it could not). */
export async function load(view) {
  view.problem = "";
  try {
    view.catalog = await view.api("/api/catalog");
  } catch (error) {
    view.problem = error.message;
  }
  if (view.root?.isConnected) {
    view.paint();
    if (view.wantedTile) {
      view.wantedTile = false;
      view.root.querySelector(".gd-tile.is-open")?.scrollIntoView({ block: "nearest" });
    }
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { kindOf, all, matches, list, filtered, mainStats, load };
