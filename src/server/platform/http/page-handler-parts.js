// page handler, small helpers: shell, origin, say, localized, and 4 more.
import { NOT_FOUND, SITE_NAME, matchRoute } from "../../../shared/routes.js";
import { loadFirstPaintCss } from "./page-handler-assets.js";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { tr } from "../server-i18n.js";
import { wide } from "../../../shared/media.js";

export const shell = async ctx =>
  (ctx.template ??= await readFile(path.join(ctx.web.client, "index.html"), "utf8"));

export const origin = (ctx, request) =>
  ctx.config.appOrigin || `${request.protocol}://${request.get("host")}`;

export const say = (language, key, params) => tr(language, key, { site: SITE_NAME, ...params });

export const localized = (language, route) => ({
  ...route,
  title: say(language, route.title),
  description: say(language, route.description)
});

/**
 * The banner of a hero sheet is the largest picture of the page: it starts loading with the HTML
 * instead of after the data.
 */
export async function bannerSrcset(ctx, heroId, language) {
  try {
    const stored =
      (language !== "en" && (await ctx.store.getHeroDetails(heroId, language))) ||
      (await ctx.store.getHeroDetails(heroId, "en"));
    const cover = stored?.details?.art?.cover;
    if (typeof cover !== "string" || !cover.startsWith("https://")) {
      return "";
    }
    return /srcset="([^"]*)"/.exec(wide(cover, [640, 960, 1280]))?.[1] ?? "";
  } catch {
    return "";
  }
}

const missing = language => ({ status: 404, ...localized(language, NOT_FOUND) });

export async function describe(ctx, request, language) {
  const matched = matchRoute(request.path);
  if (matched.view === "not-found") {
    return missing(language);
  }
  if (matched.view === "team") {
    // a team that was deleted (or never was) is a real 404 for a search engine, not a page that the browser then calls empty
    return (await ctx.store.getTeam(matched.teamId))
      ? { status: 200, ...localized(language, matched.route) }
      : missing(language);
  }
  if (matched.view !== "hero") {
    return { status: 200, ...localized(language, matched.route) };
  }
  const hero = (await ctx.store.readHeroes()).find(
    item => item.id === matched.heroId && item.availableGlobal !== false
  );
  if (!hero) {
    return missing(language);
  }
  const name = /^Flowborn/i.test(hero.name) ? "Flowborn" : hero.name;
  const lanes = hero.lanes.join(" / ");
  return {
    status: 200,
    index: true,
    banner: await ctx.bannerSrcset(hero.id, language),
    title: say(language, "{name} — Honor of Kings Global hero guide | {site}", { name }),
    description: say(
      language,
      "{name} in Honor of Kings Global: {roles} hero for {lanes}. Skills with videos, artwork and full patch history.",
      { name, roles: hero.roles.join(" / "), lanes }
    ).slice(0, 300),
    image: hero.image
  };
}

/**
 * Whether the page the person opens is a series whose game is being drafted (or played): it can show the room
 * before the series arrives. The address of a series, or "Live draft" (the first series in progress of the person).
 */
export async function draftInProgress(ctx, userId, matched) {
  try {
    if (matched.view === "live") {
      const { items } = await ctx.store.listSeries(userId, {
        limit: 1,
        filters: { status: "active" }
      });
      return Boolean(items[0]?.series.currentGame);
    }
    const found = await ctx.store.getSeries(matched.seriesId, userId);
    return found?.series.status === "active" && Boolean(found.series.currentGame);
  } catch {
    return false;
  }
}

export const inlineCss = (ctx, view) => {
  if (!ctx.firstPaint.has(view)) {
    ctx.firstPaint.set(view, loadFirstPaintCss(view, ctx.web));
  }
  return ctx.firstPaint.get(view);
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { shell, origin, bannerSrcset, describe, draftInProgress, inlineCss };
