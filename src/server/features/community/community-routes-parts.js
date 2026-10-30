// community routes, small helpers: presentDiscord.

// ---- Discord ----------------------------------------------------------------------------------
export const presentDiscord = async (ctx, userId) => {
  const link = await ctx.store.getDiscord(userId);
  return {
    configured: ctx.discord.enabled,
    botConfigured: ctx.discord.botEnabled,
    linked: Boolean(link),
    username: link?.username ?? null,
    avatarUrl: link ? ctx.discord.avatarUrl(link.discordId, link.avatarHash) : null,
    linkedAt: link?.linkedAt ?? null,
    prefs: link?.prefs ?? null
  };
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { presentDiscord };
