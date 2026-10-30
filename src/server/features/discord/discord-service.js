import { PREFERENCE_OF } from "../community/community-domain.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as discordServiceParts } from "./discord-service-parts.js";
import { onView as discordServiceTeamS } from "./discord-service-team-s.js";
import { onView as discordServiceCommands } from "./discord-service-commands.js";
import { avatarUrl } from "./discord-service-parts.js";

/**
 * Discord, used for:
 *  - linking an account (OAuth "identify": id, username, avatar; nothing else is asked, no message is read);
 *  - direct messages to people who linked their account and asked for them (bot token, plain REST calls, no connection kept open);
 *  - a team's channel on a server where a staff member added the bot (messages, weekly digest);
 *  - buttons in those messages and two slash commands, received on one HTTPS endpoint whose signature is checked (public key).
 * Everything is optional: without the variables, the site works and says what is missing. `fetchImpl` is replaceable (tests).
 */
export function createDiscordService(config, fetchImpl = fetch) {
  const ctx = { fetchImpl };
  bindTo(ctx, discordServiceParts, discordServiceTeamS, discordServiceCommands);
  ctx.settings = config.discord ?? {};
  const enabled = Boolean(
    ctx.settings.clientId && ctx.settings.clientSecret && ctx.settings.redirectUri
  );
  ctx.botEnabled = Boolean(ctx.settings.botToken);
  const serverEnabled = Boolean(
    ctx.settings.botToken && ctx.settings.clientId && ctx.settings.botRedirectUri
  );
  ctx.interactionsEnabled = Boolean(ctx.settings.publicKey && ctx.settings.botToken);
  ctx.botHeaders = {
    authorization: `Bot ${ctx.settings.botToken}`,
    "content-type": "application/json"
  };

  const api = {
    enabled,
    botEnabled: ctx.botEnabled,
    serverEnabled,
    interactionsEnabled: ctx.interactionsEnabled,

    authorizeUrl: ctx.authorizeUrl,
    exchange: ctx.exchange,
    fetchUser: ctx.fetchUser,
    avatarUrl,

    sendDirectMessage: ctx.sendDirectMessage,

    botInstallUrl: ctx.botInstallUrl,
    getGuild: ctx.getGuild,
    listChannels: ctx.listChannels,
    postMessage: ctx.postMessage,

    verifyInteraction: ctx.verifyInteraction,
    registerCommands: ctx.registerCommands
  };
  return api;
}

/**
 * Why a direct message did not go, in words the person can act on (the page writes the sentence):
 *   shared-server  Discord refuses: the bot shares no server with the person, or they block direct messages from servers
 *   bot-token      Discord does not accept the token of the bot
 *   busy           Discord asks to slow down
 *   unreachable    no answer from Discord at all
 *   unknown        anything else
 */
export function whyNotSent(error) {
  if (error?.discordCode === 50007) {
    return "shared-server";
  }
  if (error?.status === 401) {
    return "bot-token";
  }
  if (error?.status === 429 || error?.discordCode === 40003) {
    return "busy";
  }
  return error?.status ? "unknown" : "unreachable";
}

const when = time => new Date(time).toUTCString().replace(" GMT", " UTC");
const heroRule = rule => (rule === "global-ban-pick" ? "Global Ban & Pick" : "Free For All");

/** The text of a direct message (English: the person's language is not known to the bot). */
export function describeNotification(kind, payload, origin = "") {
  const link = payload.requestId && origin ? `\n${origin}/inbox?open=${payload.requestId}` : "";
  switch (kind) {
    case "request":
      return payload.action === "counter"
        ? `${payload.team} proposes another time for your scrim: ${when(payload.startsAt)}.${link}`
        : `${payload.team} asks you for a BO${payload.format} scrim (${heroRule(payload.heroRule)}) on ${when(payload.startsAt)}.${link}`;
    case "answer":
      return `${payload.team} ${payload.action === "accept" ? "accepted" : payload.action === "decline" ? "declined" : "cancelled"} the scrim request.${link}`;
    case "message":
      return `New message from ${payload.team} about a scrim request.${link}`;
    case "invitation":
      return `${payload.by} invites you to join ${payload.team} as ${payload.role}.${origin ? `\n${origin}/teams` : ""}`;
    case "reminder":
      return `Reminder: ${payload.title} (${payload.team}) starts at ${when(payload.startsAt)}${payload.hours ? ` — in about ${payload.hours} h` : ""}.`;
    default:
      return "You have a new notification.";
  }
}

/**
 * Buttons under a scrim request: answer straight from Discord, or open the conversation on the
 * site.
 */
export function requestButtons(requestId, origin = "") {
  const row = [
    { type: 2, style: 3, label: "Accept", custom_id: `rq:accept:${requestId}` },
    { type: 2, style: 4, label: "Decline", custom_id: `rq:decline:${requestId}` }
  ];
  if (origin) {
    row.push({
      type: 2,
      style: 5,
      label: "Open on the site",
      url: `${origin}/inbox?open=${requestId}`
    });
  }
  return [{ type: 1, components: row }];
}

/** The text posted in a team's channel (reminders, confirmed scrims, weekly digest). */
export const channelText = {
  reminder: ({ title, team, startsAt, hours }) =>
    `⏰ **${title}** (${team}) starts at ${when(startsAt)} — in about ${hours} h.`,
  scrim: ({ fromName, toName, startsAt, format, heroRule: rule }) =>
    `✅ Scrim confirmed: **${fromName}** vs **${toName}** — BO${format}, ${heroRule(rule)}, ${when(startsAt)}.`,
  digest: (team, events) =>
    `📅 **${team} — this week**\n${events.map(event => `• ${when(event.startsAt)} — ${event.title}`).join("\n")}`
};

/**
 * Sends the Discord messages that go with freshly stored notifications, to the people who linked
 * Discord and asked for that kind, and the team channel messages. Never throws and never blocks the
 * request that caused it: a failed message is logged and forgotten (the notification stays on the
 * site).
 */
export function createNotifier({ store, discord, config, logger }) {
  const origin = config.appOrigin ?? "";
  const quiet = promise =>
    promise.catch(error => logger?.warn?.("discord delivery failed", { message: error.message }));
  return {
    send(notifications) {
      if (!discord.botEnabled || !notifications?.length) {
        return;
      }
      void quiet(
        (async () => {
          const targets = await store.discordTargets(notifications.map(item => item.userId));
          for (const item of notifications) {
            const target = targets.get(item.userId);
            if (!target || target.prefs[PREFERENCE_OF[item.kind]] === false) {
              continue;
            }
            const components =
              item.kind === "request" && item.payload.requestId
                ? requestButtons(item.payload.requestId, origin)
                : null;
            try {
              await discord.sendDirectMessage(
                target.discordId,
                describeNotification(item.kind, item.payload, origin),
                components
              );
            } catch (error) {
              logger?.warn?.("discord message failed", { message: error.message });
            }
          }
        })()
      );
    },
    /** A message in the channel a team chose (nothing when the team has not connected a server). */
    team(teamId, content) {
      if (!discord.botEnabled) {
        return;
      }
      void quiet(
        (async () => {
          const link = await store.getTeamDiscord(teamId);
          if (link?.channelId) {
            await discord.postMessage(link.channelId, content);
          }
        })()
      );
    },
    async channel(channelId, content) {
      if (!discord.botEnabled) {
        return false;
      }
      try {
        return await discord.postMessage(channelId, content);
      } catch (error) {
        logger?.warn?.("discord channel message failed", { message: error.message });
        return false;
      }
    }
  };
}
