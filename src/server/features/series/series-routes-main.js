// series routes, main: registerMainRoutes.
import { parsePagination, parseQueryChoice } from "../../platform/validation.js";
import { parseSeriesFilters } from "./series-validation.js";
import { presentSeries } from "./presenters.js";
import { summarize } from "./series-summary.js";
import { wrap } from "../../platform/http/async.js";
import { viewerId } from "./series-routes-parts.js";

export function registerMainRoutes(env) {
  env.router.get(
    "/series",
    wrap(async request => {
      const paging = parsePagination(request.query);
      const filters = parseSeriesFilters(request.query);
      const view = parseQueryChoice(request.query, "view", ["full", "summary"], "full");
      const { items, total } = await env.store.listSeries(viewerId(request), {
        ...paging,
        filters
      });
      const now = Date.now();
      return {
        items: items.map(({ series, ctx }) =>
          view === "summary" ? summarize(series, ctx) : presentSeries(series, ctx, now)
        ),
        total,
        page: paging.page,
        pageSize: paging.pageSize
      };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerMainRoutes };
