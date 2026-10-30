// community routes, players: registerMeRoutes2.
import { notFound } from "../../platform/errors.js";
import { parseDiscordPrefs } from "./community-domain.js";
import { whyNotSent } from "../discord/discord-service.js";
import { wrap } from "../../platform/http/async.js";
import { account } from "./community-routes-shared.js";

export function registerMeRoutes2(ctx) {
  ctx.router.get(
    "/me/discord",
    wrap(async request => ctx.presentDiscord(account(request).id))
  );
  ctx.router.delete(
    "/me/discord",
    ctx.limiters.write,
    wrap(async request => {
      await ctx.store.unlinkDiscord(account(request).id);
      return ctx.presentDiscord(request.user.id);
    })
  );
  ctx.router.put(
    "/me/discord/prefs",
    ctx.limiters.write,
    wrap(async request => {
      if (
        !(await ctx.store.saveDiscordPrefs(account(request).id, parseDiscordPrefs(request.body)))
      ) {
        throw notFound("Link your Discord account first.");
      }
      return ctx.presentDiscord(request.user.id);
    })
  );

  // A test message to the person's own Discord, answered with what happened: sent, or why not (a bot can only write
  // to people who share a server with it: without this, that is found out only when a request goes unnoticed).
  ctx.router.post(
    "/me/discord/test",
    ctx.limiters.write,
    wrap(async request => {
      const link = await ctx.store.getDiscord(account(request).id);
      if (!link) {
        throw notFound("Link your Discord account first.");
      }
      if (!ctx.discord.botEnabled) {
        return { sent: false, reason: "no-bot" };
      }
      try {
        await ctx.discord.sendDirectMessage(
          link.discordId,
          "Test message from HOK Global Scrim Lab: direct messages work. You can ignore this one."
        );
        return { sent: true };
      } catch (error) {
        return { sent: false, reason: whyNotSent(error) };
      }
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerMeRoutes2 };
