// team routes, small helpers: managed, answer, scheduler.
import { MAX_TEAMS_PER_USER, canManage, canSchedule } from "./team-domain.js";
import { forbidden, notFound } from "../../platform/errors.js";
import { parseUuid } from "../../platform/validation.js";
import { wrap } from "../../platform/http/async.js";
import { account } from "./team-routes-shared.js";

// The role of the caller in a team; 404 for an unknown team, 403 when the caller may not manage
// it.
export const managed = async (ctx, request) => {
  const user = account(request);
  const teamId = parseUuid(request.params.id, "team id");
  const role = await ctx.store.roleOf(teamId, user.id);
  if (role === null && !(await ctx.store.getTeam(teamId))) {
    throw notFound("Team not found.");
  }
  if (!canManage(role)) {
    throw forbidden("Only the owner and the managers can do this.");
  }
  return { user, teamId, role };
};

export const answer = (ctx, accept) =>
  wrap(async request => {
    const user = account(request);
    const result = await ctx.store.answerInvitation(
      parseUuid(request.params.id, "invitation id"),
      user.id,
      accept,
      { maxTeams: MAX_TEAMS_PER_USER }
    );
    if (!result) {
      throw notFound("Invitation not found.");
    }
    return result;
  });

export const scheduler = async (ctx, request) => {
  const user = account(request);
  const teamId = parseUuid(request.params.id, "team id");
  const role = await ctx.store.roleOf(teamId, user.id);
  if (role === null && !(await ctx.store.getTeam(teamId))) {
    throw notFound("Team not found.");
  }
  if (!canSchedule(role)) {
    throw forbidden("Only the staff and the captain can change the agenda.");
  }
  return { user, teamId };
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { managed, answer, scheduler };
