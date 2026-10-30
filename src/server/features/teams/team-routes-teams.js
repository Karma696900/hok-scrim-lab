// team routes, teams: registerTeamsRoutes.
import { AVATAR_MAX_BYTES, processAvatar } from "../../platform/images/avatar.js";
import express from "express";
import { forbidden, notFound } from "../../platform/errors.js";
import { parseInvitation, parseTeam } from "./team-domain.js";
import { parseUuid } from "../../platform/validation.js";
import { wrap } from "../../platform/http/async.js";
import { account } from "./team-routes-shared.js";

export function registerTeamsRoutes(ctx) {
  ctx.router.put(
    "/teams/:id",
    ctx.limiters.write,
    wrap(async request => {
      const { teamId } = await ctx.managed(request);
      if (!(await ctx.store.updateTeam(teamId, parseTeam(request.body)))) {
        throw notFound("Team not found.");
      }
      return { id: teamId };
    })
  );

  // The logo is sent as the raw file; it is cropped to a square and re-encoded (never stored or
  // served as sent).
  ctx.router.put(
    "/teams/:id/logo",
    ctx.limiters.write,
    express.raw({
      type: ["image/png", "image/jpeg", "image/webp", "image/gif"],
      limit: AVATAR_MAX_BYTES + 1024
    }),
    wrap(async request => {
      const { teamId } = await ctx.managed(request);
      const data = await processAvatar(request.body, request.headers["content-type"]);
      return { logoVersion: await ctx.store.saveTeamLogo(teamId, { mime: "image/webp", data }) };
    })
  );
  ctx.router.delete(
    "/teams/:id/logo",
    ctx.limiters.write,
    wrap(async request => {
      const { teamId } = await ctx.managed(request);
      await ctx.store.removeTeamLogo(teamId);
      return { logoVersion: 0 };
    })
  );

  ctx.router.delete(
    "/teams/:id",
    ctx.limiters.write,
    wrap(async request => {
      const user = account(request);
      const teamId = parseUuid(request.params.id, "team id");
      const role = await ctx.store.roleOf(teamId, user.id);
      if (role !== "owner") {
        throw forbidden("Only the owner can delete the team.");
      }
      await ctx.store.deleteTeam(teamId);
      return { deleted: true };
    })
  );

  ctx.router.post(
    "/teams/:id/invitations",
    ctx.limiters.write,
    wrap(async (request, response) => {
      const { user, teamId } = await ctx.managed(request);
      const input = parseInvitation(request.body);
      const target = await ctx.store.findUserByTag(input.tag);
      if (!target) {
        throw notFound("No player has this tag.");
      }
      const id = await ctx.store.invite(teamId, target.id, user.id, input);
      const team = await ctx.store.getTeam(teamId);
      ctx.notifier?.send(
        await ctx.store.notify([target.id], "invitation", {
          team: team.name,
          by: user.name,
          role: input.role
        })
      );
      response.status(201);
      return { id };
    })
  );

  ctx.router.delete(
    "/teams/:id/invitations/:invitationId",
    ctx.limiters.write,
    wrap(async request => {
      const { teamId } = await ctx.managed(request);
      if (
        !(await ctx.store.cancelInvitation(
          teamId,
          parseUuid(request.params.invitationId, "invitation id")
        ))
      ) {
        throw notFound("Invitation not found.");
      }
      return { deleted: true };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerTeamsRoutes };
