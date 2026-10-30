import { Router } from "express";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as heroRoutesParts } from "./hero-routes-parts.js";
import { onView as heroRoutesHealthHeroes } from "./hero-routes-health-heroes.js";
import { onView as heroRoutesHeroesRoster } from "./hero-routes-heroes-roster.js";

/** Size in bytes of a Camp video (0 when unknown): a HEAD request, no redirect, short timeout. */
const headSize = async url => {
  const response = await fetch(url, {
    method: "HEAD",
    signal: AbortSignal.timeout(6000),
    redirect: "error"
  });
  return response.ok ? Number(response.headers.get("content-length") ?? 0) : 0;
};

export function createHeroRouter({
  store,
  rosterSync,
  detailsSync,
  limiters,
  config,
  mediaProbe = headSize
}) {
  const ctx = { config, store, rosterSync, mediaProbe, detailsSync, limiters };
  bindTo(ctx, heroRoutesParts, heroRoutesHealthHeroes, heroRoutesHeroesRoster);
  ctx.router = Router();

  ctx.registerHealthHeroesRoutes();

  ctx.registerHeroesRosterRoutes();

  return ctx.router;
}
