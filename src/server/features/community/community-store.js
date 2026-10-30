import { createPostsStore } from "./posts-store.js";
import { createRequestsStore } from "./requests-store.js";
import { createNotificationsStore } from "./notifications-store.js";
import { createAgendaStore } from "./agenda-store.js";
import { createTeamDiscordStore } from "./team-discord-store.js";
import { createPlayersStore } from "./players-store.js";
import { createDiscordLinkStore } from "./discord-link-store.js";

/** Database access for scrim announcements and requests, their conversations, notifications, RSVPs, player profiles and Discord links. */
export function createCommunityStore(context) {
  return {
    ...createPostsStore(context),
    ...createRequestsStore(context),
    ...createNotificationsStore(context),
    ...createAgendaStore(context),
    ...createTeamDiscordStore(context),
    ...createPlayersStore(context),
    ...createDiscordLinkStore(context)
  };
}
