// The order the pieces of the catalogue are listed in.
import { ARCANA_COLORS } from "./build-model-shared.js";

// ---- the order the pieces of the catalogue are listed in ---------------------------------------------
// One rule per kind of piece, for every page (the data of the game, the picker of the build lab, the catalogue) and
// for the API. A page passes `compareNames` to say how two names order: it puts the names as the visitor reads them
// (the staff's texts are translated) in the alphabet of the visitor's language.

const collator = new Intl.Collator("en", { sensitivity: "base" });

/** Two pieces by their stored name, capitals and accents not counting. */
const byName = (a, b) => collator.compare(a.name, b.name);

/**
 * Arcana: by colour, in the order of ARCANA_COLORS (red, blue, green), then by name. It is the order of the list
 * whatever is shown, all the arcana or one colour.
 */
export const compareArcana = (a, b, compareNames = byName) =>
  ARCANA_COLORS.indexOf(a.color) - ARCANA_COLORS.indexOf(b.color) || compareNames(a, b);

/** The type of an item: what comes before " - " in its name ("Guardian - Howl" is a Guardian). */
export const itemType = item => String(item.name).split(" - ")[0].trim();

/**
 * The types of the Roaming items, in the order they are listed in: Guardian, then Crimson Shadow (a type that is not
 * named here comes after them).
 */
export const ROAMING_TYPES = ["Guardian", "Crimson Shadow"];

/**
 * How the items of one shop category ("" for any) are put in order: by name, except the Roaming ones, which go by
 * type first (ROAMING_TYPES) and by name inside a type.
 */
export const compareItems = (shopCategory, compareNames = byName) => {
  if (shopCategory !== "roaming") {
    return compareNames;
  }
  const rank = item => {
    const at = ROAMING_TYPES.indexOf(itemType(item));
    return at < 0 ? ROAMING_TYPES.length : at;
  };
  return (a, b) => rank(a) - rank(b) || compareNames(a, b);
};

const indexBy = list => new Map((list ?? []).map(entry => [entry.id, entry]));

/** Lookup tables over a catalog ({ stats, tags, items, arcana }). */
export function indexCatalog(catalog) {
  return {
    stats: indexBy(catalog.stats),
    tags: indexBy(catalog.tags),
    items: indexBy(catalog.items),
    arcana: indexBy(catalog.arcana),
    spells: indexBy(catalog.spells)
  };
}

/**
 * Arcana of a colour in display order: the biggest quantity first, then by name (so ×7 comes before
 * ×3).
 */
export function sortArcana(entries, arcanaById) {
  return [...entries].sort(
    (a, b) =>
      b.count - a.count ||
      String(arcanaById.get(a.id)?.name ?? "").localeCompare(
        String(arcanaById.get(b.id)?.name ?? "")
      )
  );
}
