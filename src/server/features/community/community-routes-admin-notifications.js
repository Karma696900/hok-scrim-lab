// community routes, admin notifications: registerAdminNotificationsRoutes.
import { forbidden, notFound } from "../../platform/errors.js";
import { parseLabels, parseReport, parseRsvp } from "./community-domain.js";
import { parseUuid } from "../../platform/validation.js";
import { requireAdmin, wrap } from "../../platform/http/async.js";
import { account } from "./community-routes-shared.js";

export function registerAdminNotificationsRoutes(ctx) {
  ctx.router.post(
    "/requests/:id/report",
    ctx.limiters.write,
    wrap(async request => {
      await ctx.store.report(
        account(request).id,
        parseUuid(request.params.id, "request id"),
        parseReport(request.body)
      );
      return { reported: true };
    })
  );
  ctx.router.post(
    "/teams/:id/blocks",
    ctx.limiters.write,
    wrap(async request => {
      await ctx.store.blockTeam(
        account(request).id,
        parseUuid(request.params.id, "team id"),
        parseUuid(request.body?.teamId, "team id")
      );
      return { blocked: true };
    })
  );
  ctx.router.put(
    "/admin/players/:tag/labels",
    ctx.limiters.write,
    wrap(async request => {
      const admin = requireAdmin(request);
      await ctx.store.setLabels(
        admin.id,
        String(request.params.tag).toUpperCase(),
        parseLabels(request.body)
      );
      return { saved: true };
    })
  );
  ctx.router.delete(
    "/admin/reports/:id",
    ctx.limiters.write,
    wrap(async request => {
      requireAdmin(request);
      if (!(await ctx.store.dismissReport(parseUuid(request.params.id, "report id")))) {
        throw notFound("Report not found.");
      }
      return { dismissed: true };
    })
  );
  ctx.router.get(
    "/admin/reports",
    wrap(async request => {
      requireAdmin(request);
      return { items: await ctx.store.listReports() };
    })
  );

  // ---- notifications ----------------------------------------------------------------------------
  ctx.router.get(
    "/notifications",
    wrap(async request => ({ items: await ctx.store.listNotifications(account(request).id) }))
  );
  ctx.router.post(
    "/notifications/read",
    ctx.limiters.write,
    wrap(async request => {
      const ids = request.body?.ids;
      if (
        ids !== undefined &&
        (!Array.isArray(ids) ||
          ids.length > 100 ||
          ids.some(id => typeof id !== "string" || id.length > 40))
      ) {
        throw forbidden("Invalid list.");
      }
      await ctx.store.markNotificationsRead(account(request).id, ids ?? null);
      return { read: true };
    })
  );

  // ---- agenda: answers, the agenda of all my teams, the calendar file ---------------------------
  ctx.router.post(
    "/events/:id/rsvp",
    ctx.limiters.write,
    wrap(async request => {
      await ctx.store.setRsvp(
        parseUuid(request.params.id, "event id"),
        account(request).id,
        parseRsvp(request.body)
      );
      return { saved: true };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerAdminNotificationsRoutes };
