// catalog routes, catalog admin: registerCatalogAdminRoutes.
import {
  CATALOG_IMAGE_MAX_BYTES,
  processCatalogImage
} from "../../platform/images/catalog-image.js";
import express from "express";
import { notFound } from "../../platform/errors.js";
import { adminOnly, wrap } from "../../platform/http/async.js";
import { revalidate } from "../../platform/http/cache-control.js";
import { positive } from "./catalog-routes-shared.js";

export function registerCatalogAdminRoutes(ctx) {
  ctx.router.get(
    "/catalog/:family",
    wrap(async (request, response) => {
      const family = ctx.FAMILIES[request.params.family];
      if (!family) {
        throw notFound("Not found.");
      }
      const catalog = await ctx.store.readCatalog();
      revalidate(response, { shared: true });
      return { [family]: catalog[family] };
    })
  );
  ctx.router.get(
    "/catalog/:family/:id",
    wrap(async (request, response) => {
      const family = ctx.FAMILIES[request.params.family];
      if (!family) {
        throw notFound("Not found.");
      }
      const id = positive(request.params.id);
      const piece = (await ctx.store.readCatalog())[family].find(entry => entry.id === id);
      if (!piece) {
        throw notFound("Not found.");
      }
      revalidate(response, { shared: true });
      return piece;
    })
  );

  ctx.router.use("/admin/catalog", adminOnly);

  // A picture is sent as the raw file; the answer is its id, which an item or an arcana then refers
  // to.
  ctx.router.post(
    "/admin/catalog/images",
    ctx.limiters.write,
    express.raw({
      type: ["image/png", "image/jpeg", "image/webp", "image/gif"],
      limit: CATALOG_IMAGE_MAX_BYTES + 1024
    }),
    wrap(async request => {
      // an arcana drawn small is made bigger; anything else is an item
      const kind = request.query.kind === "arcana" ? "arcana" : "item";
      const bytes = await processCatalogImage(request.body, request.headers["content-type"], {
        kind
      });
      const id = await ctx.store.saveImage(bytes);
      return { id, url: `/catalog-images/${id}` };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerCatalogAdminRoutes };
