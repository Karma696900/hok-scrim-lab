import { Router } from "express";
import { badRequest } from "../../platform/errors.js";
import { wrap } from "../../platform/http/async.js";
import { summarize } from "../series/series-summary.js";
import { computeAllHeroScrimStats, computeOverviewStats } from "../series/scrim-stats.js";
import { parsePagination, parseQueryChoice, parseQueryText } from "../../platform/validation.js";
import { parseSeriesFilters } from "../series/series-validation.js";

const HERO_SORTS = ["presence", "picked", "banned", "winrate"];
/** The pictures of the game data shown on the overview, per family. */
const OVERVIEW_PICTURES = 10;

/**
 * What the overview says of a family of the game data: how many there are, and ten pictures spread over its list
 * (the first ten of the arcana would all be one colour).
 */
const dataSummary = list => {
  const pictured = list.filter(piece => piece.imageId);
  const shown = Math.min(OVERVIEW_PICTURES, pictured.length);
  return {
    count: list.length,
    images: Array.from(
      { length: shown },
      (_, position) => pictured[Math.floor((position * pictured.length) / shown)].imageId
    )
  };
};

/**
 * Overview, history statistics and hero tables. Everything is scoped to the viewer and
 * filtered/paged on the server.
 */
export function createStatsRouter({ store, config }) {
  const router = Router();
  const viewerId = request => request.user?.id ?? null;

  function minGames(request) {
    if (request.query.minGames === undefined) {
      return config.minSampleGames;
    }
    const value = Number(request.query.minGames);
    if (!Number.isInteger(value) || value < 1 || value > 1000) {
      throw badRequest("minGames must be a whole number between 1 and 1000.", "invalid_query");
    }
    return value;
  }

  router.get(
    "/overview",
    wrap(async request => {
      const id = viewerId(request);
      const [totals, active, recent, tierLists, heroes, lastUpdated, sourceUpdated, catalog] =
        await Promise.all([
          store.countVisibleSeries(id),
          store.listSeries(id, { limit: 5, offset: 0, filters: { status: "active" } }),
          store.listSeries(id, { limit: 5, offset: 0, filters: {} }),
          store.listTierLists(id, { limit: 1, offset: 0 }),
          store.readHeroes(),
          store.readMetadata("rosterUpdatedAt"),
          store.readMetadata("rosterSourceUpdated"),
          store.readCatalog()
        ]);
      const present = ({ series, ctx }) => summarize(series, ctx);
      return {
        counts: {
          heroes: heroes.filter(hero => hero.availableGlobal).length,
          series: totals.series,
          activeSeries: totals.active,
          games: totals.games,
          tierLists: tierLists.total
        },
        active: active.items.map(present),
        recent: recent.items.map(present),
        roster: { lastUpdated, sourceUpdated, usingCache: Boolean(lastUpdated) },
        // known to everybody, and small: the overview draws it at once (a block filled afterwards would
        // change the page the server sent)
        gameData: {
          items: dataSummary(catalog.items),
          arcana: dataSummary(catalog.arcana),
          spells: dataSummary(catalog.spells)
        }
      };
    })
  );

  router.get(
    "/stats/overview",
    wrap(async request => {
      const filters = parseSeriesFilters(request.query);
      return computeOverviewStats(await store.listOwnScrims(viewerId(request), { filters }), {
        minGames: minGames(request)
      });
    })
  );

  router.get(
    "/stats/heroes",
    wrap(async request => {
      const filters = parseSeriesFilters(request.query);
      const paging = parsePagination(request.query, { defaultSize: 10, maxSize: 100 });
      const sort = parseQueryChoice(request.query, "order", HERO_SORTS, "presence");
      const needle = parseQueryText(request.query, "hero").toLocaleLowerCase();
      const table = computeAllHeroScrimStats(
        await store.listOwnScrims(viewerId(request), { filters: { ...filters, sort: undefined } }),
        { minGames: minGames(request) }
      );
      const names = new Map((await store.readHeroes()).map(hero => [hero.id, hero.name]));
      const rows = table.rows.filter(
        row => !needle || (names.get(row.heroId) ?? row.heroId).toLocaleLowerCase().includes(needle)
      );
      const order = {
        presence: (left, right) => right.picked + right.banned - (left.picked + left.banned),
        picked: (left, right) => right.picked - left.picked,
        banned: (left, right) => right.banned - left.banned,
        winrate: (left, right) =>
          (right.winRate ?? -1) - (left.winRate ?? -1) || right.picked - left.picked
      }[sort];
      rows.sort((left, right) => order(left, right) || left.heroId.localeCompare(right.heroId));
      return {
        label: table.label,
        minGames: table.minGames,
        totalGames: table.totalGames,
        sort,
        rows: rows.slice(paging.offset, paging.offset + paging.limit),
        total: rows.length,
        page: paging.page,
        pageSize: paging.pageSize
      };
    })
  );

  return router;
}
