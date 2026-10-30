// team routes, teams me: registerTeamsMeRoutes.
import {
  MAX_TEAMS_PER_USER,
  TEAM_LEVELS,
  TEAM_REGIONS,
  canManage,
  parseTeam
} from "./team-domain.js";
import { notFound } from "../../platform/errors.js";
import {
  parsePagination,
  parseQueryChoice,
  parseQueryText,
  parseUuid
} from "../../platform/validation.js";
import { wrap } from "../../platform/http/async.js";
import { account } from "./team-routes-shared.js";

export function registerTeamsMeRoutes(ctx) {
  ctx.router.get(
    "/teams",
    wrap(async request => {
      const { page, pageSize } = parsePagination(request.query, { defaultSize: 18, maxSize: 50 });
      return ctx.store.listTeams({
        query: parseQueryText(request.query, "q", 40),
        level: parseQueryChoice(request.query, "level", TEAM_LEVELS, ""),
        region: parseQueryChoice(request.query, "region", TEAM_REGIONS, ""),
        page,
        pageSize
      });
    })
  );

  ctx.router.get(
    "/teams/:id",
    wrap(async request => {
      const team = await ctx.store.getTeam(parseUuid(request.params.id, "team id"));
      if (!team) {
        throw notFound("Team not found.");
      }
      const role =
        request.user && !request.user.isGuest
          ? await ctx.store.roleOf(team.id, request.user.id)
          : null;
      return {
        ...team,
        myRole: role,
        invitations: canManage(role) ? await ctx.store.invitationsOfTeam(team.id) : []
      };
    })
  );

  ctx.router.get(
    "/me/teams",
    wrap(async request => ({ items: await ctx.store.teamsOfUser(account(request).id) }))
  );
  ctx.router.get(
    "/me/invitations",
    wrap(async request => ({ items: await ctx.store.invitationsOfUser(account(request).id) }))
  );

  ctx.router.post(
    "/teams",
    ctx.limiters.write,
    wrap(async (request, response) => {
      const user = account(request);
      const id = await ctx.store.createTeam(user.id, parseTeam(request.body), MAX_TEAMS_PER_USER);
      response.status(201);
      return { id };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerTeamsMeRoutes };
