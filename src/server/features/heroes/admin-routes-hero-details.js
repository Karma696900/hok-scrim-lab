// admin routes, hero details: registerHeroDetailsRoutes.
import { adminOnly, wrap } from "../../platform/http/async.js";
import { badRequest } from "../../platform/errors.js";
import { isLanguage } from "../../../shared/i18n.js";

export function registerHeroDetailsRoutes(ctx) {
  ctx.router.use("/admin", adminOnly);

  // Hero sheets from Camp: start (background) and follow progress.
  ctx.router.get(
    "/admin/hero-details",
    wrap(async request => ({
      ...(ctx.detailsSync?.status() ?? { running: false, total: 0, done: 0, failed: 0 }),
      available: Boolean(ctx.detailsSync),
      stored: (await ctx.store.heroDetailsStatus(request.language ?? "en")).size,
      lang: request.language ?? "en"
    }))
  );

  ctx.router.post(
    "/admin/hero-details/sync",
    ctx.limiters.rosterSync,
    wrap(async request => {
      if (!ctx.detailsSync) {
        throw badRequest("Hero details sync is not available on this server.", "unavailable");
      }
      const force = request.body?.force === true;
      const lang = isLanguage(request.body?.lang) ? request.body.lang : (request.language ?? "en");
      const running = ctx.detailsSync.run({ manual: true, force, lang });
      running.catch(() => {});
      return { started: true, ...ctx.detailsSync.status() };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerHeroDetailsRoutes };
