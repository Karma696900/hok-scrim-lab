// series routes, teams: registerTeamsRoutes.
import { SERIES_TEAMS_MAX, canShareSeries } from "../teams/team-domain.js";
import { assertSeriesPermission } from "./policy.js";
import { forbidden, notFound } from "../../platform/errors.js";
import { parsePagination, parseQueryChoice, parseUuid } from "../../platform/validation.js";
import { parseSeriesFilters } from "./series-validation.js";
import { wrap } from "../../platform/http/async.js";
import { seriesList } from "./series-routes-teams-series.js";
import { viewerId } from "./series-routes-parts.js";

export function registerTeamsRoutes(env) {
  /** The series a team shared: for its members only (anyone else is told the team does not exist). */
  env.router.get(
    "/teams/:id/series",
    wrap(async request => {
      const teamId = parseUuid(request.params.id);
      if (!request.user || !(await env.store.roleOf(teamId, request.user.id))) {
        throw notFound("Team not found.");
      }
      const paging = parsePagination(request.query);
      const filters = parseSeriesFilters(request.query);
      const view = parseQueryChoice(request.query, "view", ["full", "summary"], "full");
      const { items, total } = await env.store.listTeamSeries(teamId, request.user.id, {
        ...paging,
        filters
      });
      return {
        items: seriesList(items, view, Date.now()),
        total,
        page: paging.page,
        pageSize: paging.pageSize
      };
    })
  );

  /** What the creator of a series can do with its teams: where it is, and the teams they lead. */
  env.router.get(
    "/series/:id/teams",
    wrap(async request => {
      const found = await env.store.getSeries(parseUuid(request.params.id), viewerId(request));
      if (!found) {
        throw notFound("Series not found.");
      }
      assertSeriesPermission(found.ctx, "share");
      const [shared, mine] = await Promise.all([
        env.store.teamsOfSeries(request.params.id),
        env.store.teamsOfUser(request.user.id)
      ]);
      const sharedIds = new Set(shared.map(team => team.id));
      return {
        shared,
        available: mine
          .filter(team => canShareSeries(team.myRole) && !sharedIds.has(team.id))
          .map(team => ({ id: team.id, name: team.name })),
        max: SERIES_TEAMS_MAX
      };
    })
  );

  env.router.put(
    "/series/:id/teams/:teamId",
    env.limiters.share,
    wrap(async request => {
      const found = await env.store.getSeries(parseUuid(request.params.id), viewerId(request));
      if (!found) {
        throw notFound("Series not found.");
      }
      assertSeriesPermission(found.ctx, "share");
      const teamId = parseUuid(request.params.teamId);
      const role = await env.store.roleOf(teamId, request.user.id);
      if (!role) {
        throw notFound("Team not found.");
      }
      if (!canShareSeries(role)) {
        throw forbidden(
          "Only the owner, a manager or a coach of the team can share a series with it."
        );
      }
      const added = await env.store.shareSeriesWithTeam(
        request.params.id,
        teamId,
        request.user.id,
        {
          max: SERIES_TEAMS_MAX
        }
      );
      return { shared: true, added };
    })
  );

  /** The creator takes their series off a team, or a leader of the team removes it from theirs. */
  env.router.delete(
    "/series/:id/teams/:teamId",
    env.limiters.share,
    wrap(async request => {
      const found = await env.store.getSeries(parseUuid(request.params.id), viewerId(request));
      if (!found) {
        throw notFound("Series not found.");
      }
      const teamId = parseUuid(request.params.teamId);
      const role = await env.store.roleOf(teamId, request.user.id);
      if (found.ctx.role !== "owner" && !(role && canShareSeries(role))) {
        throw forbidden("Only the creator of the series, or a leader of the team, can do this.");
      }
      if (!(await env.store.unshareSeriesFromTeam(request.params.id, teamId))) {
        throw notFound("This series is not on this team.");
      }
      return { shared: false };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerTeamsRoutes };
