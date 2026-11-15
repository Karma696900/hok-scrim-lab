// The page of one piece of the catalogue (/items/12, /arcana/3, /spells/5): its title names HOK and the
// piece (players search "hok <item name>"), and a piece nobody entered is a real 404.
import { SITE_NAME } from "../../../shared/routes.js";
import { tr } from "../server-i18n.js";

/** The section of the catalogue of each view (they are named alike). */
export const PIECE_VIEWS = ["items", "arcana", "spells"];

const plain = text =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** What a search result shows of a description. */
const DESCRIPTION_ROOM = 160;

/** "+80 Physical Attack, +10% Cooldown Reduction": the numbers of a piece, in the order they were entered. */
function statsLine(piece, catalog) {
  const stats = new Map((catalog.stats ?? []).map(stat => [stat.id, stat]));
  return (piece.stats ?? [])
    .map(entry => ({ stat: stats.get(entry.statId), value: entry.value }))
    .filter(({ stat, value }) => stat && stat.unit !== "choice" && typeof value === "number")
    .map(({ stat, value }) => `+${value}${stat.unit === "percent" ? "%" : ""} ${stat.name}`)
    .join(", ");
}

/** Some room is worth a cut sentence; less is not. */
const CUT_MIN = 40;

/**
 * Sentences joined until a search result has no room left: the first one that does not fit is cut at a word
 * (with "…") when enough room is left, and the ones after it are left out.
 */
function fit(sentences) {
  let text = "";
  for (const sentence of sentences.filter(Boolean)) {
    const next = text ? `${text} ${sentence}` : sentence;
    if (next.length <= DESCRIPTION_ROOM) {
      text = next;
      continue;
    }
    const room = DESCRIPTION_ROOM - text.length - (text ? 2 : 1);
    if (room >= CUT_MIN) {
      const cut = sentence.slice(0, room).replace(/[\s,;:.]+\S*$/, "");
      text = `${text ? `${text} ` : ""}${cut}…`;
    }
    break;
  }
  return text;
}

/**
 * The description of a piece page, its own one: the name and the price, what the editors wrote (the passive), the
 * numbers, what it is built from. Pages that shared one description are read as copies by search engines.
 */
function pieceDescription(language, view, piece, catalog) {
  const stats = statsLine(piece, catalog);
  const own = plain(piece.description);
  const sentence = own && !/[.!?]$/.test(own) ? `${own}.` : own;
  if (view === "items") {
    const names = new Map((catalog.items ?? []).map(item => [item.id, item.name]));
    const parts = (piece.components ?? []).map(id => names.get(id)).filter(Boolean);
    return fit([
      Number.isFinite(piece.price)
        ? tr(language, "{name}, Honor of Kings item for {price} gold.", {
            name: piece.name,
            price: piece.price
          })
        : tr(language, "{name}, Honor of Kings item.", { name: piece.name }),
      sentence,
      stats && `${stats}.`,
      parts.length && tr(language, "Built from {parts}.", { parts: parts.join(", ") })
    ]);
  }
  if (view === "arcana") {
    // tr with a literal key each time (the key tool reads them)
    const head =
      piece.color === "red"
        ? tr(language, "{name}, red arcana of Honor of Kings.", { name: piece.name })
        : piece.color === "blue"
          ? tr(language, "{name}, blue arcana of Honor of Kings.", { name: piece.name })
          : piece.color === "green"
            ? tr(language, "{name}, green arcana of Honor of Kings.", { name: piece.name })
            : tr(language, "{name}, arcana of Honor of Kings.", { name: piece.name });
    return fit([head, sentence, stats && `${stats}.`]);
  }
  return own ? `${piece.name}: ${own}`.slice(0, 300) : "";
}

/** Title and description of a piece page, or null when the catalogue has no such piece. */
export async function describePiece(ctx, matched, language, localized) {
  const id = Number((matched.section ?? "").slice(1));
  const catalog = await ctx.store.readCatalog();
  const piece = catalog[matched.view]?.find(entry => entry.id === id);
  if (!piece) {
    return null;
  }
  const values = { site: SITE_NAME, name: piece.name };
  // tr with a literal key each time: the key tool reads the second argument of tr() (scripts/i18n/keys.mjs)
  const title =
    matched.view === "items"
      ? tr(language, "HOK {name} — Honor of Kings item: stats, price and passive | {site}", values)
      : matched.view === "arcana"
        ? tr(language, "HOK {name} — Honor of Kings arcana: stats and color | {site}", values)
        : tr(language, "HOK {name} — Honor of Kings spell: effect and cooldown | {site}", values);
  const description = pieceDescription(language, matched.view, piece, catalog);
  return {
    status: 200,
    ...localized(language, matched.route),
    index: true,
    title,
    ...(description ? { description } : {})
  };
}

/** The addresses of every piece, for the sitemap. */
export async function pieceUrls(store) {
  const catalog = await store.readCatalog();
  return PIECE_VIEWS.flatMap(view => (catalog[view] ?? []).map(piece => `/${view}/${piece.id}`));
}
