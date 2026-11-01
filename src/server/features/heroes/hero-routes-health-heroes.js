// hero routes, health heroes: registerHealthHeroesRoutes, registerHeroSheetRoutes.
import { heroTournamentStats, parseDay } from "../tournaments/tournament-domain.js";
import { notFound } from "../../platform/errors.js";
import { presentHero } from "./hero-domain.js";
import { currentTierList, heroTiers } from "../tier-lists/public-tier-list-service.js";
import { revalidate } from "../../platform/http/cache-control.js";
import { summariseCompetitive } from "../tournaments/competitive-import.js";
import { wrap } from "../../platform/http/async.js";

export function registerHealthHeroesRoutes(ctx) {
  // Liveness: the process answers. Readiness (below) also needs MySQL.
  ctx.router.get("/health/live", (_request, response) => response.json({ status: "ok" }));

  // Readiness: the database answers and this instance is not on its way out (see createShutdown).
  ctx.router.get(
    "/health",
    wrap(async (request, response) => {
      if (request.app.locals.draining) {
        response.status(503);
        return { status: "draining" };
      }
      await ctx.store.ping();
      return { status: "ok", storage: "mysql" };
    })
  );

  ctx.router.get(
    "/heroes",
    wrap(async (request, response) => {
      const lang = request.language ?? "en";
      const [heroes, lastUpdated, sourceUpdated, names] = await Promise.all([
        ctx.store.readHeroes(),
        ctx.store.readMetadata("rosterUpdatedAt"),
        ctx.store.readMetadata("rosterSourceUpdated"),
        ctx.store.readHeroNames(lang)
      ]);
      if (lang !== "en" && !names.size) {
        ctx.rosterSync?.requestNames?.(lang)?.catch?.(() => {});
      }
      revalidate(response); // it varies with the language, so only the browser keeps it, and asks again
      return {
        heroes: heroes.map(presentHero).map(hero => localizeHero(hero, names)),
        lastUpdated,
        sourceUpdated,
        usingCache: Boolean(lastUpdated),
        language: lang,
        namesLanguage: names.size ? lang : "en"
      };
    })
  );

  // The heroes whose Camp presentation video can play behind the pages (the client picks one at
  // random unless the visitor chose).
  ctx.router.get(
    "/backgrounds",
    wrap(async (request, response) => {
      const [items, heroes, names] = await Promise.all([
        ctx.store.listBackgroundVideos(request.language ?? "en"),
        ctx.store.readHeroes(),
        ctx.store.readHeroNames(request.language ?? "en")
      ]);
      const byId = new Map(heroes.map(hero => [hero.id, hero]));
      measureVideos(
        items.map(item => item.video),
        ctx.mediaProbe
      );
      revalidate(response);
      const light = items.filter(item => {
        const size = videoSizes.get(item.video);
        return size > 0 && size <= BACKGROUND_MAX_BYTES;
      });
      return {
        items: light
          .filter(item => byId.get(item.heroId)?.availableGlobal)
          .map(item => ({
            heroId: item.heroId,
            name: names.get(item.heroId)?.name ?? presentHero(byId.get(item.heroId)).displayName,
            video: item.video
          }))
      };
    })
  );
  registerHeroSheetRoutes(ctx);
}

/** Hero Sheet Routes: the second half of registerHealthHeroesRoutes. */
export function registerHeroSheetRoutes(ctx) {
  // Hero sheet. Anything we have no verified source for is null: the UI says "Data unavailable" and
  // nothing is guessed.
  ctx.router.get(
    "/heroes/:id",
    wrap(async request => {
      const hero = (await ctx.store.readHeroes()).find(item => item.id === request.params.id);
      if (!hero) {
        throw notFound("Hero not found.");
      }
      const competitive = (await ctx.store.getHeroCompetitive(hero.id)).map(entry => ({
        source: entry.source,
        sourceUrl: entry.sourceUrl,
        region: entry.region,
        patch: entry.patch,
        updatedAt: entry.updatedAt,
        license: entry.license,
        attribution: entry.attribution,
        importedAt: entry.importedAt,
        ...summariseCompetitive(entry, entry.totalGames)
      }));
      const lang = request.language ?? "en";
      // The sheet in the visitor's language when Camp's copy has been fetched; otherwise the
      // English one while the other is fetched in the background.
      let stored = lang === "en" ? null : await ctx.store.getHeroDetails(hero.id, lang);
      let detailsLanguage = lang;
      if (!stored) {
        stored = await ctx.store.getHeroDetails(hero.id, "en");
        detailsLanguage = "en";
        if (lang !== "en") {
          ctx.detailsSync?.requestHero?.(hero.id, lang);
        }
      }
      const names = await ctx.store.readHeroNames(lang);
      const since = parseSince(request.query.since);
      const [games, builds, summary, profile, tierList, combos] = await Promise.all([
        ctx.store.competitiveGames(since),
        ctx.store.listBuildSets(hero.id),
        ctx.store.competitiveSummary(),
        ctx.store.getHeroProfile(hero.id),
        currentTierList(ctx.store),
        ctx.store.listCombos(hero.id)
      ]);
      const rules = ["classic", "free-for-all", "global-ban-pick"];
      const tournament = {
        since,
        ...heroTournamentStats(games, hero.id),
        byRule: Object.fromEntries(
          rules.map(rule => [rule, heroTournamentStats(games, hero.id, rule)])
        ),
        range: {
          first: summary.first,
          last: summary.last
        }
      };
      const tiers = heroTiers(tierList, hero.id, hero.lanes);
      return {
        hero: localizeHero(presentHero(hero), names),
        competitive,
        tournament,
        builds,
        profile,
        // the tier of the hero in each of its lanes (SS to D), as the public tier list gives it, and
        // where it comes from: "tournaments" (played enough) or "editors" (their rating)
        ratings: tiers.ratings,
        ratingSources: tiers.sources,
        // the combos the editors wrote for the hero, in their order (steps are skills of `details`)
        combos,
        details: stored?.details ?? null,
        detailsFetchedAt: stored?.fetchedAt ?? null,
        detailsLanguage,
        language: lang
      };
    })
  );
}

/** The recency window of the statistics: a YYYY-MM-DD, or none (every game). */
const parseSince = value =>
  value === undefined || value === "" || value === "all" ? null : parseDay(String(value), "since");

/**
 * The hero with the name and classes Camp gives in the visitor's language (English when that
 * language has none yet).
 */
function localizeHero(hero, names) {
  const local = names.get(hero.id);
  if (!local) {
    return hero;
  }
  const shown = hero.isFlowborn
    ? local.name.replace(/\s*[(（][^)）]*[)）]\s*$/, "").trim() || local.name
    : local.name;
  return {
    ...hero,
    name: local.name,
    displayName: shown,
    englishName: hero.name,
    roles: local.roles
  };
}

const BACKGROUND_MAX_BYTES = 20 * 1024 * 1024;

const videoSizes = new Map(); // url -> bytes (0 = unknown / refused); filled in the background, never on a request

let sizing = null;

/**
 * Looks the size of the Camp videos up (HEAD, four at a time, once per address): only light ones
 * are offered as page background.
 */
function measureVideos(urls, sizeOf) {
  const todo = urls.filter(url => !videoSizes.has(url));
  if (!todo.length || sizing) {
    return;
  }
  sizing = (async () => {
    const queue = [...todo];
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (queue.length) {
          const url = queue.shift();
          try {
            videoSizes.set(url, await sizeOf(url));
          } catch {
            videoSizes.set(url, 0);
          }
        }
      })
    );
  })().finally(() => {
    sizing = null;
  });
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerHealthHeroesRoutes };
