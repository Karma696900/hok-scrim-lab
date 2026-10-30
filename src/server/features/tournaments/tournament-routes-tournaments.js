// tournament routes, tournaments: registerTournamentsRoutes.
import { VERIFICATIONS, parseTournamentSeries } from "./tournament-domain.js";
import { notFound } from "../../platform/errors.js";
import { parseUuid } from "../../platform/validation.js";
import { wrap } from "../../platform/http/async.js";
import { pageOf } from "./tournament-routes-parts.js";

export function registerTournamentsRoutes(ctx) {
  ctx.router.get(
    "/admin/tournaments",
    wrap(async request => {
      const q = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 80) : "";
      const verification = VERIFICATIONS.includes(request.query.verification)
        ? request.query.verification
        : "";
      const [list, summary] = await Promise.all([
        ctx.store.listTournaments({ q, page: pageOf(request.query.page), verification }),
        ctx.store.competitiveSummary()
      ]);
      return { ...list, summary };
    })
  );

  ctx.router.get(
    "/admin/tournaments/suggestions",
    wrap(async () => ctx.store.tournamentSuggestions())
  );

  ctx.router.get(
    "/admin/tournaments/:id",
    wrap(async request => {
      const series = await ctx.store.getTournament(parseUuid(request.params.id));
      if (!series) {
        throw notFound("Series not found.");
      }
      return series;
    })
  );

  ctx.router.post(
    "/admin/tournaments",
    ctx.limiters.write,
    wrap(async request => {
      const series = parseTournamentSeries(request.body, await ctx.heroIds(), {
        flowbornIds: await ctx.flowbornIds()
      });
      return { id: await ctx.store.createTournament(series, request.user.id), score: series.score };
    })
  );

  ctx.router.put(
    "/admin/tournaments/:id",
    ctx.limiters.write,
    wrap(async request => {
      const id = parseUuid(request.params.id);
      const series = parseTournamentSeries(request.body, await ctx.heroIds(), {
        flowbornIds: await ctx.flowbornIds()
      });
      if (!(await ctx.store.replaceTournament(id, series))) {
        throw notFound("Series not found.");
      }
      return { id, score: series.score };
    })
  );

  ctx.router.delete(
    "/admin/tournaments/:id",
    ctx.limiters.write,
    wrap(async request => {
      if (!(await ctx.store.deleteTournament(parseUuid(request.params.id)))) {
        throw notFound("Series not found.");
      }
      return { deleted: true };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerTournamentsRoutes };
