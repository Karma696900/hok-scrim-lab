// training routes, small helpers: knownHeroIds, knownMapIds.

export const knownHeroIds = async ctx =>
  new Set(
    (await ctx.store.readHeroes())
      .filter(hero => hero.availableGlobal !== false)
      .map(hero => hero.id)
  );

export const knownMapIds = async ctx =>
  new Set((await ctx.store.listTrainingMaps()).map(map => map.id));

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { knownHeroIds, knownMapIds };
