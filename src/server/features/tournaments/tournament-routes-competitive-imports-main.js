// tournament routes, competitive imports main: registerCompetitiveImportsMainRoutes.
import { notFound } from "../../platform/errors.js";
import { parseCompetitiveImport } from "./tournament-validation.js";
import { parseUuid } from "../../platform/validation.js";
import { wrap } from "../../platform/http/async.js";
import { account, pageOf } from "./tournament-routes-parts.js";

export function registerCompetitiveImportsMainRoutes(ctx) {
  ctx.router.get(
    "/tournaments",
    wrap(async request => {
      account(request);
      const q = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 80) : "";
      const page = pageOf(request.query.page);
      return { ...(await ctx.store.listTournaments({ q, page })), page, pageSize: 25 };
    })
  );
  ctx.router.get(
    "/tournaments/:id",
    wrap(async request => {
      account(request);
      const series = await ctx.store.getTournament(parseUuid(request.params.id));
      if (!series) {
        throw notFound("Series not found.");
      }
      return series;
    })
  );

  ctx.router.post(
    "/admin/competitive-imports",
    ctx.limiters.import,
    wrap(async request => {
      const heroes = await ctx.store.readHeroes();
      const data = parseCompetitiveImport(request.body, new Set(heroes.map(hero => hero.id)));
      const created = await ctx.store.createCompetitiveImport(data, request.user.id);
      return {
        ...created,
        source: data.source,
        patch: data.patch,
        region: data.region,
        license: data.license
      };
    })
  );

  ctx.router.get(
    "/admin/competitive-imports",
    wrap(async () => ({ items: await ctx.store.listCompetitiveImports() }))
  );

  ctx.router.delete(
    "/admin/competitive-imports/:id",
    wrap(async request => {
      if (!(await ctx.store.deleteCompetitiveImport(parseUuid(request.params.id)))) {
        throw notFound("Import not found.");
      }
      return { deleted: true };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerCompetitiveImportsMainRoutes };
