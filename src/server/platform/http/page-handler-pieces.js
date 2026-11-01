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

/** Title and description of a piece page, or null when the catalogue has no such piece. */
export async function describePiece(ctx, matched, language, localized) {
  const id = Number((matched.section ?? "").slice(1));
  const piece = (await ctx.store.readCatalog())[matched.view]?.find(entry => entry.id === id);
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
  const own = plain(piece.description);
  return {
    status: 200,
    ...localized(language, matched.route),
    index: true,
    title,
    ...(own ? { description: `${piece.name}: ${own}`.slice(0, 300) } : {})
  };
}

/** The addresses of every piece, for the sitemap. */
export async function pieceUrls(store) {
  const catalog = await store.readCatalog();
  return PIECE_VIEWS.flatMap(view => (catalog[view] ?? []).map(piece => `/${view}/${piece.id}`));
}
