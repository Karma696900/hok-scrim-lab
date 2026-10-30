// catalog routes, small helpers: known.

/** What a body can refer to: the stats (with their options), the tags, the pictures, the heroes and their classes. */
export const known = async ctx => {
  const [catalog, heroes, imageIds] = await Promise.all([
    ctx.store.readCatalog(),
    ctx.store.readHeroes(),
    ctx.store.imageIds()
  ]);
  return {
    catalog,
    stats: new Map(catalog.stats.map(entry => [entry.id, entry])),
    tagIds: new Set(catalog.tags.map(entry => entry.id)),
    imageIds,
    heroIds: new Set(heroes.map(hero => hero.id)),
    roles: new Set(heroes.flatMap(hero => hero.roles ?? []))
  };
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { known };
