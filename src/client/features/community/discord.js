// Discord & onboarding. Wireframe:
//   1. the stage: a cover, the title, the link to Discord, three numbers (steps done, messages on, team servers);
//   2. on the left the four first steps as large tiles that say where the person stands (done, or the button that
//      does it), then the Discord account: link it, unlink it, and the three kinds of message as switches;
//   3. on the right what the bot sends (three messages as Discord shows them) and the Discord server of each team
//      the person leads.
import { bindTo } from "../../../shared/bind-to.js";
import { onView as discordParts } from "./discord-parts.js";
import { actionsOf } from "./discord-actions.js";

export function createDiscordPage(ctx) {
  const view = { ctx };
  bindTo(view, discordParts);
  ({ api: view.api, tell: view.tell } = view.ctx);

  view.actions = actionsOf(view);

  return { show: view.show, actions: view.actions };
}
