// combo routes, combos: registerCombosRoutes.
import { HERO_ID_PATTERN, parseUuid } from "../../platform/validation.js";
import { notFound } from "../../platform/errors.js";
import { parseCombo, parseOrder } from "./combo-domain.js";
import { wrap } from "../../platform/http/async.js";
import { editorOnly } from "../../platform/http/async.js";
import { player } from "./combo-routes-parts.js";

export function registerCombosRoutes(ctx) {
  // ---- the editors ------------------------------------------------------------------------------
  ctx.router.get(
    "/combos",
    editorOnly,
    wrap(async () => ({ counts: await ctx.store.comboCounts() }))
  );
  ctx.router.put(
    "/combos/:heroId/order",
    editorOnly,
    ctx.limiters.write,
    wrap(async request => {
      const hero = await ctx.requireHero(request.params.heroId);
      const ids = parseOrder(request.body, await ctx.store.comboIds(hero.id));
      await ctx.store.reorderCombos(hero.id, ids);
      return { combos: await ctx.store.listCombos(hero.id) };
    })
  );
  ctx.router.post(
    "/combos/:heroId",
    editorOnly,
    ctx.limiters.write,
    wrap(async request => {
      const hero = await ctx.requireHero(request.params.heroId);
      const combo = parseCombo(request.body, await ctx.skillIdsOf(hero.id));
      return ctx.store.createCombo(hero.id, combo, request.user.id);
    })
  );
  ctx.router.put(
    "/combos/:heroId/:id",
    editorOnly,
    ctx.limiters.write,
    wrap(async request => {
      const hero = await ctx.requireHero(request.params.heroId);
      const combo = parseCombo(request.body, await ctx.skillIdsOf(hero.id));
      const saved = await ctx.store.updateCombo(
        hero.id,
        parseUuid(request.params.id, "combo id"),
        combo,
        request.user.id
      );
      if (!saved) {
        throw notFound("Combo not found.");
      }
      return saved;
    })
  );
  ctx.router.delete(
    "/combos/:heroId/:id",
    editorOnly,
    ctx.limiters.write,
    wrap(async request => {
      const hero = await ctx.requireHero(request.params.heroId);
      if (!(await ctx.store.deleteCombo(hero.id, parseUuid(request.params.id, "combo id")))) {
        throw notFound("Combo not found.");
      }
      return { removed: true };
    })
  );

  // ---- the players ------------------------------------------------------------------------------
  ctx.router.get(
    "/training/combos",
    wrap(async request => {
      const user = player(request);
      const heroId =
        typeof request.query.heroId === "string" && HERO_ID_PATTERN.test(request.query.heroId)
          ? request.query.heroId
          : null;
      return { progress: Object.fromEntries(await ctx.store.comboProgress(user.id, heroId)) };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerCombosRoutes };
