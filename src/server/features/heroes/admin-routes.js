import { Router } from "express";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as adminRoutesParts } from "./admin-routes-parts.js";
import { onView as adminRoutesHeroDetails } from "./admin-routes-hero-details.js";
import { onView as adminRoutesHeroes } from "./admin-routes-heroes.js";

/**
 * What an administrator does to the heroes under /api/admin: fetch the hero sheets from Camp, add
 * or remove lanes.
 */
export function createHeroAdminRouter({ store, limiters, detailsSync = null, prerender = null }) {
  const ctx = { store, limiters, detailsSync, prerender };
  bindTo(ctx, adminRoutesParts, adminRoutesHeroDetails, adminRoutesHeroes);
  ctx.router = Router();

  ctx.registerHeroDetailsRoutes();

  ctx.registerHeroesRoutes();

  return ctx.router;
}
