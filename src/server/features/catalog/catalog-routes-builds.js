// catalog routes, builds: registerBuildsRoutes.
import { notFound } from "../../platform/errors.js";
import { parseBuildSet } from "./catalog-domain.js";
import { wrap } from "../../platform/http/async.js";
import { editorOnly } from "../../platform/http/async.js";
import { variantOf } from "./catalog-routes-heroes-profile.js";

export function registerBuildsRoutes(ctx) {
  /** Who has which recommended build: the list of the builds editor. */
  ctx.router.get(
    "/builds",
    editorOnly,
    wrap(async () => ({ builds: await ctx.store.listBuildSummaries() }))
  );
  ctx.router.put(
    "/builds/:heroId/:variant",
    editorOnly,
    ctx.limiters.write,
    wrap(async request => {
      const hero = await ctx.requireHero(request.params.heroId);
      const set = parseBuildSet(
        request.body,
        variantOf(request.params.variant),
        await ctx.store.readCatalog()
      );
      await ctx.store.saveBuildSet(hero.id, set, request.user.id);
      return { heroId: hero.id, ...set };
    })
  );
  ctx.router.delete(
    "/builds/:heroId/:variant",
    editorOnly,
    ctx.limiters.write,
    wrap(async request => {
      const hero = await ctx.requireHero(request.params.heroId);
      if (!(await ctx.store.deleteBuildSet(hero.id, variantOf(request.params.variant)))) {
        throw notFound("Build not found.");
      }
      return { removed: true };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerBuildsRoutes };
