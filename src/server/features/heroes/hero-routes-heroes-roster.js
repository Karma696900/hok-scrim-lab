// hero routes, heroes roster: registerHeroesRosterRoutes.
import { computeHeroScrimStats } from "../series/scrim-stats.js";
import { describeError, notFound } from "../../platform/errors.js";
import { presentHero } from "./hero-domain.js";
import { requireAdmin, wrap } from "../../platform/http/async.js";

export function registerHeroesRosterRoutes(ctx) {
  // "Your scrims": computed from the viewer's own recorded games only, percentages withheld below
  // minGames.
  ctx.router.get(
    "/heroes/:id/scrims",
    wrap(async request => {
      const hero = (await ctx.store.readHeroes()).find(item => item.id === request.params.id);
      if (!hero) {
        throw notFound("Hero not found.");
      }
      return computeHeroScrimStats(
        await ctx.store.listOwnScrims(request.user?.id ?? null),
        hero.id,
        {
          minGames: ctx.minGames(request)
        }
      );
    })
  );

  // Admin only: launches Chromium. Single flight + cooldown live in the roster sync service.
  ctx.router.post(
    "/roster/sync",
    ctx.limiters.rosterSync,
    wrap(async (request, response) => {
      requireAdmin(request);
      try {
        const result = await ctx.rosterSync.run({ manual: true });
        return {
          ...result,
          heroes: (await ctx.store.readHeroes()).map(presentHero),
          usingCache: false
        };
      } catch (error) {
        const { status, body } = describeError(error, request.language);
        // Cooldown and other typed errors keep their status; a failed sync reports the retained
        // cache.
        response.status(status === 500 ? 503 : status).json({
          ...body,
          ...(status === 500
            ? { error: "Roster sync failed; the last valid roster is still in use." }
            : {}),
          heroes: (await ctx.store.readHeroes()).map(presentHero),
          usingCache: true
        });
      }
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerHeroesRosterRoutes };
