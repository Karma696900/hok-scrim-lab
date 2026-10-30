// community routes, requests scrim posts: registerRequestsScrimPostsRoutes.
import {
  CONTROLS,
  FORMATS,
  HERO_RULES,
  parseMessage,
  parsePost,
  parseRequest
} from "./community-domain.js";
import { TEAM_LEVELS, TEAM_REGIONS } from "../teams/team-domain.js";
import {
  parsePagination,
  parseQueryChoice,
  parseQueryText,
  parseUuid
} from "../../platform/validation.js";
import { wrap } from "../../platform/http/async.js";
import { account, instantQuery } from "./community-routes-shared.js";

export function registerRequestsScrimPostsRoutes(ctx) {
  ctx.router.get(
    "/community/summary",
    wrap(async request =>
      request.user && !request.user.isGuest
        ? ctx.store.communitySummary(request.user.id)
        : {
            unreadNotifications: 0,
            awaitingRequests: 0,
            openPosts: await ctx.store.openPostCount()
          }
    )
  );

  // ---- announcements ----------------------------------------------------------------------------
  ctx.router.get(
    "/scrim-posts",
    wrap(async request => {
      const { page, pageSize } = parsePagination(request.query, { defaultSize: 20, maxSize: 50 });
      const format = parseQueryText(request.query, "format", 2);
      if (format && !FORMATS.includes(Number(format))) {
        return { total: 0, page, pageSize, items: [] };
      }
      return ctx.store.listPosts({
        from: instantQuery(request.query, "from"),
        to: instantQuery(request.query, "to"),
        level: parseQueryChoice(request.query, "level", TEAM_LEVELS, ""),
        region: parseQueryChoice(request.query, "region", TEAM_REGIONS, ""),
        format: format ? Number(format) : null,
        heroRule: parseQueryChoice(request.query, "rule", HERO_RULES, ""),
        control: parseQueryChoice(request.query, "control", CONTROLS, ""),
        minHours: Math.min(12, Math.max(0, Number(request.query.minHours) || 0)),
        mineOf: request.query.mine === "1" ? account(request).id : null,
        page,
        pageSize
      });
    })
  );
  ctx.router.post(
    "/scrim-posts",
    ctx.limiters.write,
    wrap(async (request, response) => {
      const user = account(request);
      const id = await ctx.store.createPost(user.id, parsePost(request.body));
      response.status(201);
      return { id };
    })
  );
  ctx.router.delete(
    "/scrim-posts/:id",
    ctx.limiters.write,
    wrap(async request => {
      await ctx.store.closePost(parseUuid(request.params.id, "post id"), account(request).id);
      return { closed: true };
    })
  );

  // ---- requests and their conversation ----------------------------------------------------------
  ctx.router.get(
    "/requests",
    wrap(async request => ({ items: await ctx.store.listRequests(account(request).id) }))
  );
  ctx.router.post(
    "/requests",
    ctx.limiters.write,
    wrap(async (request, response) => {
      const user = account(request);
      const { id, notifications } = await ctx.store.createRequest(
        user.id,
        parseRequest(request.body)
      );
      ctx.notifier.send(notifications);
      response.status(201);
      return { id };
    })
  );
  ctx.router.get(
    "/requests/:id",
    wrap(async request =>
      ctx.store.getRequest(parseUuid(request.params.id, "request id"), account(request).id)
    )
  );
  ctx.router.post(
    "/requests/:id/messages",
    ctx.limiters.write,
    wrap(async (request, response) => {
      const user = account(request);
      const { id, notifications } = await ctx.store.addMessage(
        parseUuid(request.params.id, "request id"),
        user.id,
        parseMessage(request.body)
      );
      ctx.notifier.send(notifications);
      response.status(201);
      return { id };
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerRequestsScrimPostsRoutes };
