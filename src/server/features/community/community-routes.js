import { randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { wrap } from "../../platform/http/async.js";
import { parseCounter } from "./community-domain.js";
import { channelText } from "../discord/discord-service.js";
import { parseUuid } from "../../platform/validation.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as communityRoutesParts } from "./community-routes-parts.js";
import { onView as communityRoutesRequestsScrimPosts } from "./community-routes-requests-scrim-posts.js";
import { onView as communityRoutesAdminNotifications } from "./community-routes-admin-notifications.js";
import { onView as communityRoutesMe } from "./community-routes-me.js";
import { onView as communityRoutesPlayers } from "./community-routes-players.js";
import { account } from "./community-routes-shared.js";

/**
 * Scrim announcements ("looking for a scrim"), requests between teams and their conversation,
 * notifications, RSVPs, the agenda of a person, public player profiles, and the Discord link.
 * Reading announcements and profiles needs no account; everything else does.
 */
export function createCommunityRouter({ store, limiters, notifier, discord, config }) {
  const ctx = { store, discord, limiters, notifier, config };
  bindTo(
    ctx,
    communityRoutesParts,
    communityRoutesRequestsScrimPosts,
    communityRoutesAdminNotifications,
    communityRoutesMe,
    communityRoutesPlayers
  );
  ctx.router = Router();

  ctx.registerRequestsScrimPostsRoutes();

  for (const action of ["accept", "decline", "cancel", "counter"]) {
    ctx.router.post(
      `/requests/:id/${action}`,
      ctx.limiters.write,
      wrap(async request => {
        const user = account(request);
        const counter = action === "counter" ? parseCounter(request.body) : null;
        const { status, notifications, accepted } = await ctx.store.answerRequest(
          parseUuid(request.params.id, "request id"),
          user.id,
          action,
          counter
        );
        ctx.notifier.send(notifications);
        if (accepted) {
          for (const teamId of accepted.teamIds) {
            ctx.notifier.team(teamId, channelText.scrim(accepted));
          }
        }
        return { status };
      })
    );
  }

  ctx.registerAdminNotificationsRoutes();

  ctx.registerMeRoutes();

  ctx.registerMeRoutes2();

  return ctx.router;
}

/**
 * The two browser redirects of the Discord link (they are not under /api). The state cookie ties
 * the answer to the browser that asked.
 */
export function createDiscordLinkRouter({ store, discord, identity, limiter, logger }) {
  const router = Router();
  const stateCookie = identity.names.discord;

  router.get("/auth/discord", limiter, (request, response) => {
    if (!discord.enabled) {
      return response.status(503).send("Discord is not configured on this server.");
    }
    if (!request.user || request.user.isGuest) {
      return response.redirect("/login?next=%2Fdiscord");
    }
    const state = randomBytes(24).toString("base64url");
    identity.setCookie(response, stateCookie, state, 600);
    response.redirect(discord.authorizeUrl(state));
  });

  router.get("/auth/discord/callback", limiter, async (request, response) => {
    const expected = identity.readCookies(request)[stateCookie] || "";
    const supplied = String(request.query.state || "");
    identity.clearCookie(response, stateCookie);
    if (
      !discord.enabled ||
      request.query.error ||
      !expected ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      return response.redirect("/discord?error=1");
    }
    if (!request.user || request.user.isGuest) {
      return response.redirect("/login?next=%2Fdiscord");
    }
    try {
      const token = await discord.exchange(String(request.query.code || ""));
      await store.linkDiscord(request.user.id, await discord.fetchUser(token));
      response.redirect("/discord?linked=1");
    } catch (error) {
      logger?.warn?.("discord link failed", { message: error.message });
      response.redirect(`/discord?error=${error.code === "discord_taken" ? "taken" : "1"}`);
    }
  });
  return router;
}
