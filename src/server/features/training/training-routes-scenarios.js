// training routes, scenarios: registerScenariosRoutes.
import { notFound } from "../../platform/errors.js";
import { parseAnswer, parseScenario } from "./training-domain.js";
import { parseUuid } from "../../platform/validation.js";
import { requireAdmin, wrap } from "../../platform/http/async.js";
import { account } from "./training-routes-shared.js";

export function registerScenariosRoutes(ctx) {
  ctx.router.delete(
    "/training/maps/:id",
    ctx.limiters.write,
    wrap(async request => {
      requireAdmin(request);
      if (!(await ctx.store.deleteTrainingMap(parseUuid(request.params.id, "map id")))) {
        throw notFound("Map not found.");
      }
      return { deleted: true };
    })
  );

  // ---- situations -------------------------------------------------------------------------------
  ctx.router.get(
    "/training/scenarios",
    wrap(async request => ({
      scenarios: await ctx.store.listTrainingScenarios({
        includeDrafts: Boolean(request.user?.isAdmin)
      })
    }))
  );
  ctx.router.get(
    "/training/scenarios/:id",
    wrap(async request => {
      const scenario = await ctx.store.getTrainingScenario(
        parseUuid(request.params.id, "situation id"),
        { includeDrafts: Boolean(request.user?.isAdmin) }
      );
      if (!scenario) {
        throw notFound("Situation not found.");
      }
      const answer =
        request.user && !request.user.isGuest
          ? await ctx.store.getTrainingAnswer(request.user.id, scenario.id)
          : null;
      return { ...scenario, answer };
    })
  );
  ctx.router.post(
    "/training/scenarios",
    ctx.limiters.write,
    wrap(async request => {
      const user = requireAdmin(request);
      return ctx.store.createTrainingScenario(
        parseScenario(request.body, {
          knownHeroIds: await ctx.knownHeroIds(),
          knownMapIds: await ctx.knownMapIds()
        }),
        user.id
      );
    })
  );
  ctx.router.put(
    "/training/scenarios/:id",
    ctx.limiters.write,
    wrap(async request => {
      requireAdmin(request);
      const scenario = await ctx.store.updateTrainingScenario(
        parseUuid(request.params.id, "situation id"),
        parseScenario(request.body, {
          knownHeroIds: await ctx.knownHeroIds(),
          knownMapIds: await ctx.knownMapIds()
        })
      );
      if (!scenario) {
        throw notFound("Situation not found.");
      }
      return scenario;
    })
  );
  ctx.router.delete(
    "/training/scenarios/:id",
    ctx.limiters.write,
    wrap(async request => {
      requireAdmin(request);
      if (!(await ctx.store.deleteTrainingScenario(parseUuid(request.params.id, "situation id")))) {
        throw notFound("Situation not found.");
      }
      return { deleted: true };
    })
  );
  ctx.router.put(
    "/training/scenarios/:id/answer",
    ctx.limiters.write,
    wrap(async request => {
      const user = account(request);
      const scenario = await ctx.store.getTrainingScenario(
        parseUuid(request.params.id, "situation id"),
        { includeDrafts: Boolean(user.isAdmin) }
      );
      if (!scenario) {
        throw notFound("Situation not found.");
      }
      return ctx.store.saveTrainingAnswer(user.id, scenario.id, parseAnswer(request.body));
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerScenariosRoutes };
