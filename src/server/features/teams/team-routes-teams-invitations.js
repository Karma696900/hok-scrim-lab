// team routes, teams invitations: registerTeamsInvitationsRoutes.
import {
  ASSIGNABLE_ROLES,
  canManage,
  canSchedule,
  parseMemberRole,
  parseWindow
} from "./team-domain.js";
import { badRequest, forbidden, notFound } from "../../platform/errors.js";
import { parseUuid } from "../../platform/validation.js";
import { wrap } from "../../platform/http/async.js";
import { account } from "./team-routes-shared.js";

export function registerTeamsInvitationsRoutes(ctx) {
  ctx.router.post("/invitations/:id/accept", ctx.limiters.write, ctx.answer(true));
  ctx.router.post("/invitations/:id/decline", ctx.limiters.write, ctx.answer(false));

  ctx.router.put(
    "/teams/:id/members/:userId",
    ctx.limiters.write,
    wrap(async request => {
      const { teamId, role } = await ctx.managed(request);
      const change = parseMemberRole(request.body);
      if (change.role === "manager" && role !== "owner") {
        throw forbidden("Only the owner can name a manager.");
      }
      if (!ASSIGNABLE_ROLES.includes(change.role)) {
        throw badRequest("Role is not one of the allowed values.", "invalid_body");
      }
      const target = parseUuid(request.params.userId, "user id");
      if ((await ctx.store.roleOf(teamId, target)) === "manager" && role !== "owner") {
        throw forbidden("Only the owner can change a manager.");
      }
      if (!(await ctx.store.setTeamMember(teamId, target, change))) {
        throw notFound("Member not found.");
      }
      return { updated: true };
    })
  );

  // A member can always leave; the owner and the managers can remove others (a manager cannot
  // remove another manager). The owner cannot leave: they delete the team.
  ctx.router.delete(
    "/teams/:id/members/:userId",
    ctx.limiters.write,
    wrap(async request => {
      const user = account(request);
      const teamId = parseUuid(request.params.id, "team id");
      const target = parseUuid(request.params.userId, "user id");
      const mine = await ctx.store.roleOf(teamId, user.id);
      const theirs = await ctx.store.roleOf(teamId, target);
      if (theirs === null) {
        throw notFound("Member not found.");
      }
      if (theirs === "owner") {
        throw forbidden("The owner cannot leave: delete the team instead.");
      }
      const leaving = target === user.id;
      if (!leaving && !(canManage(mine) && (mine === "owner" || theirs !== "manager"))) {
        throw forbidden("Only the owner and the managers can do this.");
      }
      await ctx.store.removeTeamMember(teamId, target);
      return { removed: true };
    })
  );

  // ---- agenda: the team sees everything; a stranger (or a visitor) only sees the windows marked available
  ctx.router.get(
    "/teams/:id/events",
    wrap(async request => {
      const teamId = parseUuid(request.params.id, "team id");
      if (!(await ctx.store.getTeam(teamId))) {
        throw notFound("Team not found.");
      }
      const role =
        request.user && !request.user.isGuest
          ? await ctx.store.roleOf(teamId, request.user.id)
          : null;
      const { from, to } = parseWindow(request.query);
      const items = await ctx.store.listEvents(teamId, { from, to, publicOnly: role === null });
      if (role === null) {
        return { items, canSchedule: false };
      }
      const rsvps = await ctx.store.rsvpsFor(
        items.map(item => item.id),
        request.user.id
      );
      return {
        items: items.map(item => ({
          ...item,
          rsvp: rsvps.get(item.id) ?? { going: [], maybe: [], no: [], mine: null }
        })),
        canSchedule: canSchedule(role)
      };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerTeamsInvitationsRoutes };
