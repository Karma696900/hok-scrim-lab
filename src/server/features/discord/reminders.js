import { channelText } from "./discord-service.js";

/**
 * Once a minute: the reminders 6, 4 and 2 hours before an event (on the site, as a Discord message
 * to the people who want it, and in the team's channel) and, on Monday morning, the weekly digest
 * in the team's channel. Each is sent once.
 */
export async function runReminders({ store, notifier, now = Date.now() }) {
  const { notifications, posts } = await store.dueReminders(now);
  notifier?.send(notifications);
  for (const post of posts) {
    notifier?.team(post.teamId, channelText.reminder(post));
  }
  const digests = await store.dueDigests(now);
  for (const digest of digests) {
    await notifier?.channel(digest.channelId, channelText.digest(digest.team, digest.events));
  }
  return notifications.length;
}

export function startReminders({ store, notifier, logger, intervalMs = 60_000 }) {
  const timer = setInterval(() => {
    runReminders({ store, notifier }).catch(error =>
      logger?.warn?.("reminders failed", { message: error.message })
    );
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
