// catalog routes, arcana: registerAdminRoutes3.
import { parseHeroProfile } from "./catalog-domain.js";
import { wrap } from "../../platform/http/async.js";
import { adminOnly } from "../../platform/http/async.js";

export function registerAdminRoutes3(ctx) {
  ctx.router.put(
    "/admin/heroes/:id/profile",
    adminOnly,
    ctx.limiters.write,
    wrap(async request => {
      const hero = await ctx.requireHero(request.params.id);
      await ctx.store.saveHeroProfile(hero.id, parseHeroProfile(request.body, await ctx.known()));
      return ctx.store.getHeroProfile(hero.id);
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerAdminRoutes3 };
