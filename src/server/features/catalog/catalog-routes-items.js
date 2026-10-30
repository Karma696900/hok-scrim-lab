// catalog routes, items: registerAdminRoutes2.
import { notFound } from "../../platform/errors.js";
import { parseArcana, parseSpell } from "./catalog-domain.js";
import { wrap } from "../../platform/http/async.js";
import { positive } from "./catalog-routes-shared.js";

export function registerAdminRoutes2(ctx) {
  ctx.router.delete(
    "/admin/catalog/items/:id",
    ctx.limiters.write,
    wrap(async request => {
      if (!(await ctx.store.deleteItem(positive(request.params.id)))) {
        throw notFound("Item not found.");
      }
      return { deleted: true };
    })
  );

  // ---- spells -----------------------------------------------------------------------------------
  ctx.router.post(
    "/admin/catalog/spells",
    ctx.limiters.write,
    wrap(async request => ({
      id: await ctx.store.createSpell(parseSpell(request.body, await ctx.known()))
    }))
  );
  ctx.router.put(
    "/admin/catalog/spells/:id",
    ctx.limiters.write,
    wrap(async request => {
      const id = positive(request.params.id);
      if (!(await ctx.store.updateSpell(id, parseSpell(request.body, await ctx.known())))) {
        throw notFound("Spell not found.");
      }
      return { id };
    })
  );
  ctx.router.delete(
    "/admin/catalog/spells/:id",
    ctx.limiters.write,
    wrap(async request => {
      if (!(await ctx.store.deleteSpell(positive(request.params.id)))) {
        throw notFound("Spell not found.");
      }
      return { deleted: true };
    })
  );

  // ---- arcana -----------------------------------------------------------------------------------
  ctx.router.post(
    "/admin/catalog/arcana",
    ctx.limiters.write,
    wrap(async request => ({
      id: await ctx.store.createArcana(parseArcana(request.body, await ctx.known()))
    }))
  );
  ctx.router.put(
    "/admin/catalog/arcana/:id",
    ctx.limiters.write,
    wrap(async request => {
      const id = positive(request.params.id);
      if (!(await ctx.store.updateArcana(id, parseArcana(request.body, await ctx.known())))) {
        throw notFound("Arcana not found.");
      }
      return { id };
    })
  );
  ctx.router.delete(
    "/admin/catalog/arcana/:id",
    ctx.limiters.write,
    wrap(async request => {
      if (!(await ctx.store.deleteArcana(positive(request.params.id)))) {
        throw notFound("Arcana not found.");
      }
      return { deleted: true };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerAdminRoutes2 };
