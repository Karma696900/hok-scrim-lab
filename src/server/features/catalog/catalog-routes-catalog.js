// catalog routes, catalog: registerCatalogRoutes.
import { revalidate } from "../../platform/http/cache-control.js";
import { wrap } from "../../platform/http/async.js";

export function registerCatalogRoutes(ctx) {
  // The same for everybody, and not language dependent: a CDN may keep it, provided it asks again each
  // time (the ETag turns that into a 304 while nothing changed, a new copy as soon as a staff edit lands).
  ctx.router.get(
    "/catalog",
    wrap(async (request, response) => {
      const [catalog, heroTags] = await Promise.all([
        ctx.store.readCatalog(),
        ctx.store.heroTags()
      ]);
      revalidate(response, { shared: true });
      return { ...catalog, heroTags: Object.fromEntries(heroTags) };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerCatalogRoutes };
