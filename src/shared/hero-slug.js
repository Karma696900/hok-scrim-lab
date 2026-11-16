// The address of a hero carries its name: /heroes/agudo, not /heroes/533 (owner, 2026-11-16: players search
// "agudo build", and the words of the address count). The old addresses with the number still open the hero: the
// server sends them on to the new one for good (301), so that what search engines learnt follows.

/** "Luban No.7" -> "luban-no-7": lowercase words joined by dashes, no accent, no sign. */
export function slugOfName(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The roster's addresses, computed once per list: { bySlug: slug -> id, byId: id -> slug }. */
const known = new WeakMap();

function addresses(heroes) {
  if (known.has(heroes)) {
    return known.get(heroes);
  }
  const wanted = heroes.map(hero => {
    // the English name: a list in Japanese carries it beside the Japanese one, and the address must not change
    const slug = slugOfName(hero.englishName ?? hero.name);
    return [hero.id, /^\d*$/.test(slug) ? `hero-${slug}`.replace(/-$/, "") : slug];
  });
  const count = new Map();
  for (const [, slug] of wanted) {
    count.set(slug, (count.get(slug) ?? 0) + 1);
  }
  const byId = new Map();
  const bySlug = new Map();
  for (const [id, slug] of wanted) {
    // two heroes with the same name: each takes its number too, so that no address is shared
    const own = slug === "hero" || count.get(slug) > 1 ? `${slug}-${id}` : slug;
    byId.set(String(id), own);
    bySlug.set(own, String(id));
  }
  const found = { byId, bySlug };
  known.set(heroes, found);
  return found;
}

/** The address of the hero `id` in the roster `heroes`; its number when the roster does not know it. */
export function heroPath(heroes, id) {
  const slug = addresses(heroes ?? []).byId.get(String(id));
  return `/heroes/${slug ?? encodeURIComponent(id)}`;
}

/** The id of the hero an address names, by its name or by its old number; null when none. */
export function heroIdOf(heroes, segment) {
  const { byId, bySlug } = addresses(heroes ?? []);
  const text = String(segment ?? "");
  return bySlug.get(text) ?? (byId.has(text) ? text : null);
}
