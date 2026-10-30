import { Router } from "express";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as catalogRoutesParts } from "./catalog-routes-parts.js";
import { onView as catalogRoutesHeroesProfile } from "./catalog-routes-heroes-profile.js";
import { onView as catalogRoutesCatalog } from "./catalog-routes-catalog.js";
import { onView as catalogRoutesCatalogAdmin } from "./catalog-routes-catalog-admin.js";
import { onView as catalogRoutesAdmin } from "./catalog-routes-admin.js";
import { onView as catalogRoutesItems } from "./catalog-routes-items.js";
import { onView as catalogRoutesArcana } from "./catalog-routes-arcana.js";
import { onView as catalogRoutesBuilds } from "./catalog-routes-builds.js";

/**
 * The game catalogue. Everybody reads it (GET /api/catalog: the build lab needs no account); only
 * administrators write it: stats, tags, pictures, items, arcana and the profile of a hero (base
 * stats, spells, tags). The recommended builds of the heroes are also written by the people an
 * administrator gave the Contributor label to (see shared/access-rules.js).
 */
export function createCatalogRouter({ store, limiters }) {
  const ctx = { store, limiters };
  bindTo(
    ctx,
    catalogRoutesParts,
    catalogRoutesHeroesProfile,
    catalogRoutesCatalog,
    catalogRoutesCatalogAdmin,
    catalogRoutesAdmin,
    catalogRoutesItems,
    catalogRoutesArcana,
    catalogRoutesBuilds
  );
  ctx.router = Router();

  ctx.registerCatalogRoutes();

  // The same catalogue, one family at a time and one piece at a time: what a program that reads the game
  // wants (GET /api/v1/catalog/items/12). Cut from the same cached object as /catalog, so it can never
  // disagree with it.
  ctx.FAMILIES = {
    stats: "stats",
    tags: "tags",
    items: "items",
    arcana: "arcana",
    spells: "spells"
  };

  ctx.registerCatalogAdminRoutes();

  ctx.registerAdminRoutes();

  ctx.registerAdminRoutes2();

  ctx.registerAdminRoutes3();

  ctx.registerBuildsRoutes();

  return ctx.router;
}
