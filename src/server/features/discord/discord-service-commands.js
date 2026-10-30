// discord service, commands: registerCommands.

/** Registers the two slash commands (global, idempotent). */
export async function registerCommands(ctx) {
  if (!ctx.interactionsEnabled || !ctx.settings.clientId) {
    return false;
  }
  await ctx.bot(`/applications/${ctx.settings.clientId}/commands`, {
    method: "PUT",
    body: JSON.stringify([
      {
        name: "agenda",
        description: "Your next events (scrims, matches, reviews) from your teams' agendas",
        type: 1,
        integration_types: [0, 1],
        contexts: [0, 1, 2]
      },
      {
        name: "requests",
        description: "The scrim requests waiting for your answer",
        type: 1,
        integration_types: [0, 1],
        contexts: [0, 1, 2]
      }
    ])
  });
  return true;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerCommands };
