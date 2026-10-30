import { bindTo } from "../../../shared/bind-to.js";
import { onView as seriesStoreParts } from "./series-store-parts.js";
import { onView as seriesStoreTeamsSeries } from "./series-store-teams-series.js";

/**
 * Database access for series (a series is stored as one document, with a few columns copied out so
 * that lists can be filtered and paged in SQL).
 */
export function createSeriesStore({ pool, inTransaction }) {
  const env = { pool, inTransaction };
  bindTo(env, seriesStoreParts, seriesStoreTeamsSeries);

  env.store = {
    listSeries: env.listSeries,
    countVisibleSeries: env.countVisibleSeries,
    countOwnScrims: env.countOwnScrims,
    listOwnScrims: env.listOwnScrims,
    getSeries: env.getSeries,
    teamsOfSeries: env.teamsOfSeries,
    shareSeriesWithTeam: env.shareSeriesWithTeam,
    unshareSeriesFromTeam: env.unshareSeriesFromTeam,
    listTeamSeries: env.listTeamSeries,
    mutateSeries: env.mutateSeries,
    createSeries: env.createSeries,
    createOnlineSeries: env.createOnlineSeries,
    joinOnlineSeries: env.joinOnlineSeries,
    deleteSeries: env.deleteSeries
  };
  return env.store;
}
