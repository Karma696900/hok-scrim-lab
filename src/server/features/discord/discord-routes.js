import { randomBytes, timingSafeEqual } from "node:crypto";
import express, { Router } from "express";
import { notFound } from "../../platform/errors.js";
import { wrap } from "../../platform/http/async.js";
import { SNOWFLAKE, parseChannel } from "../community/community-domain.js";
import { canManage } from "../teams/team-domain.js";
import { channelText } from "./discord-service.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as discordRoutesParts } from "./discord-routes-parts.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const when = time => new Date(time).toUTCString().replace(" GMT", " UTC");

/**
 * A team's Discord server, for its owner and managers: add the bot, choose the channel, send a
 * test, disconnect. The server id Discord sends back is only trusted after the bot proves it is in
 * that server.
 */
export function createTeamDiscordRouter({ store, discord, notifier, limiters, identity, limiter }) {
  const ctx = { store, discord };
  bindTo(ctx, discordRoutesParts);
  const api = Router();
  const browser = Router();
  const stateCookie = identity.names.discordBot;

  api.get(
    "/teams/:id/discord",
    wrap(async request => ctx.present((await ctx.managed(request)).teamId))
  );

  api.put(
    "/teams/:id/discord/channel",
    limiters.write,
    wrap(async request => {
      const { teamId } = await ctx.managed(request);
      const channelId = parseChannel(request.body);
      const link = await ctx.store.getTeamDiscord(teamId);
      if (!link) {
        throw notFound("Add the bot to a Discord server first.");
      }
      const channel = (await ctx.discord.listChannels(link.guildId)).find(
        item => item.id === channelId
      );
      if (!channel) {
        throw notFound("This channel does not exist on your server.");
      }
      await ctx.store.setTeamChannel(teamId, channel.id, channel.name);
      const team = await ctx.store.getTeam(teamId);
      await notifier.channel(
        channel.id,
        `✅ **${team.name}** is connected. Reminders (6 h, 4 h and 2 h before), confirmed scrims and a weekly digest on Monday morning will be posted here.`
      );
      return ctx.present(teamId);
    })
  );

  api.delete(
    "/teams/:id/discord",
    limiters.write,
    wrap(async request => {
      const { teamId } = await ctx.managed(request);
      await ctx.store.removeTeamDiscord(teamId);
      return ctx.present(teamId);
    })
  );

  // ---- the two browser redirects of "Add the bot" -----------------------------------------------
  browser.get(
    "/auth/discord/bot",
    limiter,
    wrap(async (request, response) => {
      if (!ctx.discord.serverEnabled) {
        return response.status(503).send("The Discord bot is not configured on this server.");
      }
      if (!request.user || request.user.isGuest) {
        return response.redirect("/login?next=%2Fteams");
      }
      const teamId = String(request.query.team ?? "");
      if (!UUID.test(teamId) || !canManage(await ctx.store.roleOf(teamId, request.user.id))) {
        return response.redirect("/teams");
      }
      const state = randomBytes(24).toString("base64url");
      identity.setCookie(response, stateCookie, `${state}.${teamId}`, 600);
      response.redirect(ctx.discord.botInstallUrl(state));
    })
  );

  browser.get(
    "/auth/discord/bot/callback",
    limiter,
    wrap(async (request, response) => {
      const [expected = "", teamId = ""] = String(
        identity.readCookies(request)[stateCookie] || ""
      ).split(".");
      const supplied = String(request.query.state || "");
      identity.clearCookie(response, stateCookie);
      const valid =
        ctx.discord.serverEnabled &&
        !request.query.error &&
        expected &&
        Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
        timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)) &&
        UUID.test(teamId);
      if (!valid) {
        return response.redirect("/teams?discord=error");
      }
      if (
        !request.user ||
        request.user.isGuest ||
        !canManage(await ctx.store.roleOf(teamId, request.user.id))
      ) {
        return response.redirect("/teams");
      }
      const guildId = String(request.query.guild_id || "");
      if (!SNOWFLAKE.test(guildId)) {
        return response.redirect(`/teams/${teamId}?discord=error`);
      }
      try {
        const guild = await ctx.discord.getGuild(guildId); // the bot must really be in this server
        await ctx.store.saveTeamGuild(teamId, request.user.id, {
          guildId: guild.id,
          guildName: guild.name
        });
        response.redirect(`/teams/${teamId}?discord=added`);
      } catch {
        response.redirect(`/teams/${teamId}?discord=error`);
      }
    })
  );

  return { api, browser };
}

/**
 * Buttons and slash commands. Discord posts every interaction here, signed (Ed25519). The person is
 * recognised by the Discord account they linked on the site; a button does exactly what the same
 * button does on the site (same rules, same turn-taking). Mounted before the JSON parser: the
 * signature is computed over the raw bytes.
 */
export function createInteractionsRouter({ store, discord, notifier, logger }) {
  const router = Router();
  const reply = (content, extra = {}) => ({
    type: 4,
    data: { content, flags: 64, allowed_mentions: { parse: [] }, ...extra }
  });
  const when2 = when;

  async function onButton(interaction, userId) {
    const [prefix, action, requestId] = String(interaction.data?.custom_id ?? "").split(":");
    if (prefix !== "rq" || !["accept", "decline"].includes(action) || !UUID.test(requestId)) {
      return reply("This button is not valid any more.");
    }
    try {
      const { status, notifications, accepted } = await store.answerRequest(
        requestId,
        userId,
        action
      );
      notifier.send(notifications);
      if (accepted) {
        for (const teamId of accepted.teamIds) {
          notifier.team(teamId, channelText.scrim(accepted));
        }
      }
      return {
        type: 7,
        data: {
          content: `${status === "accepted" ? "✅ You accepted this scrim request." : "❌ You declined this scrim request."}`,
          components: []
        }
      };
    } catch (error) {
      return reply(
        error.status === 409
          ? "This request is already settled."
          : error.status === 403
            ? "It is not your team's turn to answer this request."
            : "This request cannot be answered from here."
      );
    }
  }

  async function onCommand(interaction, userId) {
    const name = interaction.data?.name;
    if (name === "agenda") {
      const now = Date.now();
      const events = (await store.agendaOfUser(userId, { from: now, to: now + 14 * 24 * 3600_000 }))
        .filter(event => !["availability", "unavailable"].includes(event.kind))
        .slice(0, 10);
      return reply(
        events.length
          ? `📅 **Your next events**\n${events.map(event => `• ${when2(event.startsAt)} — ${event.title} (${event.team.name})`).join("\n")}`
          : "Nothing planned in the next 14 days."
      );
    }
    if (name === "requests") {
      const waiting = (await store.listRequests(userId))
        .filter(request => request.awaitingMe)
        .slice(0, 10);
      return reply(
        waiting.length
          ? `📨 **Waiting for your answer**\n${waiting.map(request => `• ${request.mySide === "from" ? request.to.name : request.from.name} — BO${request.format}, ${when2(request.startsAt)}`).join("\n")}`
          : "No scrim request is waiting for you."
      );
    }
    return reply("Unknown command.");
  }

  router.post(
    "/discord/interactions",
    express.raw({ type: "application/json", limit: "100kb" }),
    async (request, response) => {
      if (
        !discord.verifyInteraction(
          request.body,
          request.get("x-signature-ed25519"),
          request.get("x-signature-timestamp")
        )
      ) {
        return response.status(401).send("invalid request signature");
      }
      let interaction;
      try {
        interaction = JSON.parse(request.body.toString("utf8"));
      } catch {
        return response.status(400).send("bad request");
      }
      if (interaction.type === 1) {
        return response.json({ type: 1 });
      } // Discord's ping when the endpoint is saved
      try {
        const discordId = String(interaction.user?.id ?? interaction.member?.user?.id ?? "");
        const userId = SNOWFLAKE.test(discordId) ? await store.userOfDiscord(discordId) : null;
        if (!userId) {
          return response.json(
            reply("Link your Discord account on the site first (Discord page), then try again.")
          );
        }
        if (interaction.type === 3) {
          return response.json(await onButton(interaction, userId));
        }
        if (interaction.type === 2) {
          return response.json(await onCommand(interaction, userId));
        }
        return response.json(reply("Unsupported interaction."));
      } catch (error) {
        logger?.warn?.("discord interaction failed", { message: error.message });
        return response.json(reply("Something went wrong. Try again on the site."));
      }
    }
  );
  return router;
}
