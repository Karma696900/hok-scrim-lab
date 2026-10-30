// series routes, small helpers: viewerId, present, mutation.
import { assertSeriesPermission } from "./policy.js";
import { conflict } from "../../platform/errors.js";
import { parseExpectedVersion, parseUuid } from "../../platform/validation.js";
import { presentSeries } from "./presenters.js";
import { wrap } from "../../platform/http/async.js";

export const viewerId = request => request.user?.id ?? null;

export const present = (outcome, now) => presentSeries(outcome.series, outcome.ctx, now);

/**
 * One server-side transaction per mutation: the series row is locked (SELECT … FOR UPDATE), the
 * caller must be allowed to perform `operation`, an optional `expectedVersion` from the client
 * must still match, then the domain rule runs and the result is saved with version + 1. `work`
 * returns undefined (respond with the series) or { json } / { noChange, json }.
 */
export function mutation(
  env,
  operation,
  work,
  { needsHeroes = false, actingSide = () => null, middleware = [] } = {}
) {
  return [
    ...middleware,
    wrap(async request => {
      const expectedVersion = parseExpectedVersion(request.body);
      const heroes = needsHeroes ? await env.store.readHeroes() : null; // read before locking: never hold a connection while waiting for another
      const outcome = await env.store.mutateSeries(
        parseUuid(request.params.id),
        viewerId(request),
        async (series, ctx) => {
          if (expectedVersion !== null && expectedVersion !== ctx.version) {
            throw conflict(
              "This series changed since you loaded it. Reload and retry.",
              "version_conflict"
            );
          }
          assertSeriesPermission(ctx, operation, { actingSide: actingSide(series) });
          return work({
            series,
            ctx,
            body: request.body ?? {},
            heroes,
            user: request.user,
            params: request.params
          });
        }
      );
      const now = Date.now();
      const json = outcome.result?.json;
      return typeof json === "function"
        ? json(present(outcome, now))
        : (json ?? present(outcome, now));
    })
  ];
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { mutation };
