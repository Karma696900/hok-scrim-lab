// community routes, me: registerMeRoutes.
import { forbidden, notFound } from "../../platform/errors.js";
import { parseProfile, toIcs } from "./community-domain.js";
import { parseUuid } from "../../platform/validation.js";
import { wrap } from "../../platform/http/async.js";
import { account, instantQuery } from "./community-routes-shared.js";

export function registerMeRoutes(ctx) {
  ctx.router.get(
    "/me/agenda",
    wrap(async request => {
      const user = account(request);
      const now = Date.now();
      const from = instantQuery(request.query, "from") ?? now - 3600_000,
        to = instantQuery(request.query, "to") ?? from + 62 * 24 * 3600_000;
      if (to <= from || to - from > 366 * 24 * 3600_000) {
        return { items: [] };
      }
      const items = await ctx.store.agendaOfUser(user.id, { from, to });
      const rsvps = await ctx.store.rsvpsFor(
        items.map(item => item.id),
        user.id
      );
      return {
        items: items.map(item => ({
          ...item,
          rsvp: rsvps.get(item.id) ?? { going: [], maybe: [], no: [], mine: null }
        }))
      };
    })
  );
  ctx.router.get(
    "/teams/:id/events.ics",
    wrap(async (request, response) => {
      const user = account(request);
      const teamId = parseUuid(request.params.id, "team id");
      const team = await ctx.store.getTeam(teamId);
      if (!team) {
        throw notFound("Team not found.");
      }
      if ((await ctx.store.roleOf(teamId, user.id)) === null) {
        throw forbidden("Only members of the team can export its agenda.");
      }
      const now = Date.now();
      const events = await ctx.store.listEvents(teamId, {
        from: now - 24 * 3600_000,
        to: now + 366 * 24 * 3600_000,
        publicOnly: false
      });
      response.set({
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="agenda.ics"',
        "Cache-Control": "no-store"
      });
      response.send(toIcs(events, team.name, now));
    })
  );

  // ---- players ----------------------------------------------------------------------------------
  ctx.router.get(
    "/players/:tag",
    wrap(async request => {
      const tag = String(request.params.tag).toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(tag)) {
        throw notFound("Player not found.");
      }
      const player = await ctx.store.getPlayer(tag);
      if (!player) {
        throw notFound("Player not found.");
      }
      const { email, ...publicPart } = player;
      return {
        ...publicPart,
        admin: ctx.config.adminEmails.has(String(email ?? "").toLowerCase()),
        isMe: request.user?.id === player.id
      };
    })
  );
  ctx.router.put(
    "/me/player-profile",
    ctx.limiters.write,
    wrap(async request => {
      await ctx.store.saveProfile(account(request).id, parseProfile(request.body));
      return { saved: true };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerMeRoutes };
