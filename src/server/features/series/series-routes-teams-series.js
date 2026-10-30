// series routes, teams series: seriesList, draftEdit, registerMainRoutes2, registerGameRoutes2.
import { HERO_ID_PATTERN, array, parseUuid, plainObject } from "../../platform/validation.js";
import { assertSeriesPermission } from "./policy.js";
import { badRequest, notFound } from "../../platform/errors.js";
import { completeCurrentGame, setGameDuration } from "./series.js";
import { getSeriesScore } from "../../../shared/draft-model.js";
import { parseSeriesCreate, parseSeriesImport } from "./series-validation.js";
import { presentSeries } from "./presenters.js";
import { randomBytes } from "node:crypto";
import { requireGoogleUser, wrap } from "../../platform/http/async.js";
import { summarize } from "./series-summary.js";
import { flowbornIdsOf } from "./series-routes-shared.js";
import { viewerId } from "./series-routes-parts.js";

// ---- the teams a series is on: the members of a team read what the team shares --------------------
export const seriesList = (items, view, now) =>
  items.map(({ series, ctx }) =>
    view === "summary" ? summarize(series, ctx) : presentSeries(series, ctx, now)
  );

// Correct the bans/picks of a finished draft (a mistake noticed later). Same rights as editing a
// duration.
export const draftEdit = body => {
  const lists = key => {
    const group = plainObject(body[key] ?? {}, key);
    return Object.fromEntries(
      ["blue", "red"].map(side => [
        side,
        array(group[side] ?? [], `${key}.${side}`, 5).map(item => {
          if (item === null && key === "bans") {
            return null;
          }
          if (typeof item !== "string" || !HERO_ID_PATTERN.test(item)) {
            throw badRequest("{key}.{side} contains an invalid hero id.", "invalid_body", {
              key,
              side
            });
          }
          return item;
        })
      ])
    );
  };
  return { bans: lists("bans"), picks: lists("picks") };
};

export function registerMainRoutes2(env) {
  env.router.post(
    "/series",
    env.limiters.createSeries,
    wrap(async (request, response) => {
      const series = parseSeriesCreate(request.body);
      const user = await env.identity.ensureUser(request, response);
      await env.store.assertQuota("series", user);
      await env.store.createSeries(series, user.id);
      const created = await env.store.getSeries(series.id, user.id);
      return presentSeries(created.series, created.ctx);
    })
  );

  env.router.post(
    "/online/series",
    env.limiters.createSeries,
    wrap(async request => {
      const user = requireGoogleUser(request);
      const series = parseSeriesCreate(request.body, { online: true });
      await env.store.assertQuota("series", user);
      await env.store.createOnlineSeries(series, randomBytes(8).toString("hex"), user.id);
      const created = await env.store.getSeries(series.id, user.id);
      return presentSeries(created.series, created.ctx);
    })
  );

  env.router.post(
    "/online/:code/join",
    env.limiters.join,
    wrap(async request => {
      const user = requireGoogleUser(request);
      const code = String(request.params.code || "").toLowerCase();
      if (!/^[0-9a-f]{16}$/.test(code)) {
        throw notFound("Online invitation not found.");
      }
      const joined = await env.store.joinOnlineSeries(code, user.id);
      return presentSeries(joined.series, joined.ctx);
    })
  );

  // Import always creates a NEW series: the id, owner, status and drafts come from the server.
  env.router.post(
    "/series/import",
    env.limiters.import,
    wrap(async (request, response) => {
      plainObject(request.body);
      const heroes = await env.store.readHeroes();
      const knownHeroIds = new Set(heroes.map(hero => hero.id));
      const series = parseSeriesImport(request.body, knownHeroIds, {
        flowbornIds: flowbornIdsOf(heroes)
      });
      const user = await env.identity.ensureUser(request, response);
      await env.store.assertQuota("series", user);
      await env.store.createSeries(series, user.id);
      const created = await env.store.getSeries(series.id, user.id);
      return presentSeries(created.series, created.ctx);
    })
  );

  env.router.get(
    "/series/:id",
    wrap(async request => {
      const found = await env.store.getSeries(parseUuid(request.params.id), viewerId(request));
      if (!found) {
        throw notFound("Series not found.");
      }
      return presentSeries(found.series, found.ctx);
    })
  );

  env.router.delete(
    "/series/:id",
    wrap(async request => {
      const id = parseUuid(request.params.id);
      const found = await env.store.getSeries(id, viewerId(request));
      if (!found) {
        throw notFound("Series not found.");
      }
      assertSeriesPermission(found.ctx, "delete");
      if (!(await env.store.deleteSeries(id, viewerId(request)))) {
        throw notFound("Series not found.");
      }
      return { deleted: true };
    })
  );

  // Replaces the old whole-object PUT: the only client edit left is a game's duration.
  env.router.patch(
    "/series/:id/games/:index",
    ...env.mutation("duration", ({ series, body, params }) => {
      const index = Number(params.index);
      if (!Number.isInteger(index) || index < 0 || index >= series.games.length) {
        throw notFound("This game does not exist.");
      }
      setGameDuration(series, index, body.durationSeconds);
    })
  );
}

export function registerGameRoutes2(env) {
  env.router.post(
    "/series/:id/game/timer/:operation",
    (request, _response, next) => {
      if (!Object.hasOwn(env.TIMER_OPERATIONS, request.params.operation)) {
        return next(notFound("Unknown timer operation."));
      }
      next();
    },
    ...env.mutation("timer", ({ series, params }) => ({
      json: env.TIMER_OPERATIONS[params.operation](series)
    }))
  );

  env.router.post(
    "/series/:id/game/complete",
    ...env.mutation("complete", ({ series, body }) => {
      completeCurrentGame(series, { winner: body.winner, durationSeconds: body.durationSeconds });
      return { json: presented => ({ series: presented, score: getSeriesScore(series) }) };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerMainRoutes2, registerGameRoutes2 };
