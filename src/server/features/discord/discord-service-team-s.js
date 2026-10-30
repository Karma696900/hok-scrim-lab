// discord service, team s: botInstallUrl, getGuild, listChannels, postMessage.

// ---- a team's server ------------------------------------------------------------------------
/**
 * Where a staff member adds the bot to a server; Discord sends them back to the bot redirect
 * with the server id.
 */
export function botInstallUrl(ctx, state) {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: ctx.settings.clientId,
    scope: "bot applications.commands",
    permissions: BOT_PERMISSIONS,
    response_type: "code",
    redirect_uri: ctx.settings.botRedirectUri,
    state
  }).toString();
  return url.toString();
}

/** The server, only if the bot is really in it (so a forged server id is refused). */
export async function getGuild(ctx, guildId) {
  const guild = await ctx.bot(`/guilds/${guildId}`);
  return { id: String(guild.id), name: String(guild.name ?? "").slice(0, 100) };
}

export async function listChannels(ctx, guildId) {
  const channels = await ctx.bot(`/guilds/${guildId}/channels`);
  return channels
    .filter(channel => channel.type === 0 || channel.type === 5)
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    .map(channel => ({ id: String(channel.id), name: String(channel.name).slice(0, 100) }));
}

export async function postMessage(ctx, channelId, content, components = null) {
  if (!ctx.botEnabled) {
    return false;
  }
  await ctx.bot(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: String(content).slice(0, 1900),
      allowed_mentions: { parse: [] },
      ...(components ? { components } : {})
    })
  });
  return true;
}

/** Send Messages (2048) + Embed Links (16384): the only permissions the bot asks for. */
const BOT_PERMISSIONS = "18432";

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { botInstallUrl, getGuild, listChannels, postMessage };
