// catalog routes, admin: registerAdminRoutes.
import { badRequest, notFound } from "../../platform/errors.js";
import { parseItem, parseItemSort, parseStat, parseTag, parseTagGroups } from "./catalog-domain.js";
import { wrap } from "../../platform/http/async.js";
import { positive } from "./catalog-routes-shared.js";

export function registerAdminRoutes(ctx) {
  // ---- stats ------------------------------------------------------------------------------------
  ctx.router.post(
    "/admin/catalog/stats",
    ctx.limiters.write,
    wrap(async request => ({ id: await ctx.store.createStat(parseStat(request.body)) }))
  );
  ctx.router.put(
    "/admin/catalog/stats/:id",
    ctx.limiters.write,
    wrap(async request => {
      const id = positive(request.params.id);
      const previous = (await ctx.store.readCatalog()).stats.find(entry => entry.id === id);
      if (!previous) {
        throw notFound("Stat not found.");
      }
      if (!(await ctx.store.updateStat(id, parseStat(request.body, previous.options)))) {
        throw notFound("Stat not found.");
      }
      return { id: Number(request.params.id) };
    })
  );
  ctx.router.delete(
    "/admin/catalog/stats/:id",
    ctx.limiters.write,
    wrap(async request => {
      if (!(await ctx.store.deleteStat(positive(request.params.id)))) {
        throw notFound("Stat not found.");
      }
      return { deleted: true };
    })
  );

  // ---- tags -------------------------------------------------------------------------------------
  ctx.router.post(
    "/admin/catalog/tags",
    ctx.limiters.write,
    wrap(async request => {
      const { tagIds } = await ctx.known();
      return { id: await ctx.store.createTag(parseTag(request.body, tagIds)) };
    })
  );
  ctx.router.put(
    "/admin/catalog/tags/:id",
    ctx.limiters.write,
    wrap(async request => {
      const id = positive(request.params.id);
      const { tagIds } = await ctx.known();
      if (!tagIds.has(id)) {
        throw notFound("Tag not found.");
      }
      await ctx.store.updateTag(id, parseTag(request.body, tagIds, id));
      return { id };
    })
  );
  ctx.router.delete(
    "/admin/catalog/tags/:id",
    ctx.limiters.write,
    wrap(async request => {
      if (!(await ctx.store.deleteTag(positive(request.params.id)))) {
        throw notFound("Tag not found.");
      }
      return { deleted: true };
    })
  );

  // two tags that say the same thing: the first one goes, everything that used it uses the other one
  ctx.router.post(
    "/admin/catalog/tags/:id/merge",
    ctx.limiters.write,
    wrap(async request => {
      const from = positive(request.params.id);
      const into = positive(request.body?.into);
      if (from === into) {
        throw badRequest("A tag cannot be merged into itself.", "invalid_body");
      }
      if (!(await ctx.store.mergeTag(from, into))) {
        throw notFound("Tag not found.");
      }
      return { id: into };
    })
  );
  ctx.router.put(
    "/admin/catalog/tag-groups",
    ctx.limiters.write,
    wrap(async request => {
      await ctx.store.saveTagGroups(parseTagGroups(request.body));
      return { saved: true };
    })
  );

  // ---- items ------------------------------------------------------------------------------------
  ctx.router.post(
    "/admin/catalog/items",
    ctx.limiters.write,
    wrap(async request => ({
      id: await ctx.store.createItem(parseItem(request.body, await ctx.known()))
    }))
  );
  // Sorts many items at once: { ids, category?, shopCategory? } (the slot, the shop category, or both).
  ctx.router.post(
    "/admin/catalog/items/bulk",
    ctx.limiters.write,
    wrap(async request => {
      const { ids, changes } = parseItemSort(request.body);
      return { updated: await ctx.store.sortItems(ids, changes) };
    })
  );
  ctx.router.put(
    "/admin/catalog/items/:id",
    ctx.limiters.write,
    wrap(async request => {
      const id = positive(request.params.id);
      if (!(await ctx.store.updateItem(id, parseItem(request.body, await ctx.known())))) {
        throw notFound("Item not found.");
      }
      return { id };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerAdminRoutes };
