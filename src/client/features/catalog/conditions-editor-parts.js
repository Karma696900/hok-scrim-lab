// conditions editor, small helpers: heroName, roles, statOf.

export const heroName = hero => hero.displayName || hero.name;

export const roles = view =>
  [...new Set(view.getHeroes().flatMap(hero => hero.roles ?? []))].sort((a, b) =>
    a.localeCompare(b)
  );

export const statOf = (view, id) => view.getCatalog().stats.find(stat => stat.id === id);

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { roles, statOf };
