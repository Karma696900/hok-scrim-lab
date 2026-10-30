// discord routes, small helpers: managed, present.
import { canManage } from "../teams/team-domain.js";
import { forbidden, notFound, unauthorized } from "../../platform/errors.js";
import { parseUuid } from "../../platform/validation.js";

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
  return { user, teamId };
};

export const present = async (ctx, teamId) => {
  const link = await ctx.store.getTeamDiscord(teamId);
  const base = {
    configured: ctx.discord.serverEnabled,
    connected: Boolean(link),
    guildName: link?.guildName ?? null,
    channelId: link?.channelId ?? null,
    channelName: link?.channelName ?? null,
    channels: [],
    problem: null
  };
  if (!link) {
    return base;
  }
  try {
    base.channels = await ctx.discord.listChannels(link.guildId);
  } catch {
    base.problem = "bot_missing"; // the bot was removed from the server, or Discord is unreachable
  }
  return base;
};

const account = request => {
  if (!request.user || request.user.isGuest) {
    throw unauthorized("Sign in to use the community features.");
  }
  return request.user;
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { managed, present };
