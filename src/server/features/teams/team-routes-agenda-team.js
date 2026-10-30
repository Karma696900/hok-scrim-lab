// team routes, agenda team: registerTeamsRoutes2.
import { MAX_EVENTS_PER_TEAM, parseEvent } from "./team-domain.js";
import { notFound } from "../../platform/errors.js";
import { parseUuid } from "../../platform/validation.js";
import { wrap } from "../../platform/http/async.js";

export function registerTeamsRoutes2(ctx) {
  ctx.router.post(
    "/teams/:id/events",
    ctx.limiters.write,
    wrap(async (request, response) => {
      const { user, teamId } = await ctx.scheduler(request);
      const ids = await ctx.store.createEvent(
        teamId,
        user.id,
        parseEvent(request.body),
        MAX_EVENTS_PER_TEAM
      );
      response.status(201);
      return { id: ids[0], ids };
    })
  );
  ctx.router.put(
    "/teams/:id/events/:eventId",
    ctx.limiters.write,
    wrap(async request => {
      const { teamId } = await ctx.scheduler(request);
      if (
        !(await ctx.store.updateEvent(
          teamId,
          parseUuid(request.params.eventId, "event id"),
          parseEvent(request.body)
        ))
      ) {
        throw notFound("Event not found.");
      }
      return { updated: true };
    })
  );
  ctx.router.delete(
    "/teams/:id/events/:eventId",
    ctx.limiters.write,
    wrap(async request => {
      const { teamId } = await ctx.scheduler(request);
      if (!(await ctx.store.deleteEvent(teamId, parseUuid(request.params.eventId, "event id")))) {
        throw notFound("Event not found.");
      }
      return { deleted: true };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerTeamsRoutes2 };
