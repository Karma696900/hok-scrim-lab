// agenda store, agenda extras: setRsvp, rsvpsFor, agendaOfUser, dueReminders.
import { REMINDER_HOURS } from "./community-domain.js";
import { forbidden, notFound } from "../../platform/errors.js";
import { notify } from "./store-helpers.js";

// ---- agenda extras --------------------------------------------------------------------------
export async function setRsvp(ctx, eventId, userId, answer) {
  const [[event]] = await ctx.pool.query("SELECT team_id FROM team_events WHERE id = ?", [eventId]);
  if (!event) {
    throw notFound("Event not found.");
  }
  const [[member]] = await ctx.pool.query(
    "SELECT 1 AS yes FROM team_members WHERE team_id = ? AND user_id = ?",
    [event.team_id, userId]
  );
  if (!member) {
    throw forbidden("Only members of the team can answer.");
  }
  await ctx.pool.execute(
    "INSERT INTO event_rsvps (event_id, user_id, answer, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE answer = VALUES(answer), updated_at = VALUES(updated_at)",
    [eventId, userId, answer, Date.now()]
  );
}

export async function rsvpsFor(ctx, eventIds, userId) {
  if (!eventIds.length) {
    return new Map();
  }
  const [rows] = await ctx.pool.query(
    "SELECT r.event_id, r.user_id, r.answer, u.name, u.tag FROM event_rsvps r JOIN users u ON u.id = r.user_id WHERE r.event_id IN (?)",
    [eventIds]
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.event_id)) {
      map.set(row.event_id, { going: [], maybe: [], no: [], mine: null });
    }
    const entry = map.get(row.event_id);
    entry[row.answer].push({ name: row.name, tag: row.tag });
    if (row.user_id === userId) {
      entry.mine = row.answer;
    }
  }
  return map;
}

/** Agenda of all the teams of a person, next window. */
export async function agendaOfUser(ctx, userId, { from, to }) {
  const [rows] = await ctx.pool.query(
    "SELECT e.id, e.kind, e.title, e.starts_at, e.ends_at, e.note, t.id AS team_id, t.name AS team_name, t.tag AS team_tag FROM team_events e JOIN teams t ON t.id = e.team_id JOIN team_members m ON m.team_id = e.team_id AND m.user_id = ? WHERE e.ends_at > ? AND e.starts_at < ? ORDER BY e.starts_at, e.id",
    [userId, from, to]
  );
  return rows.map(row => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    startsAt: Number(row.starts_at),
    endsAt: Number(row.ends_at),
    note: row.note,
    team: { id: row.team_id, name: row.team_name, tag: row.team_tag }
  }));
}

/**
 * Reminders 6, 4 and 2 hours before an event (not for availability windows). For each event the
 * smallest window that is now due is announced once; the larger ones that are already past are
 * marked as done so they are never sent late. Returns the stored notifications (members who did
 * not answer "no") and the team posts to make.
 */
export async function dueReminders(ctx, now = Date.now()) {
  const HOUR = 3600_000;
  return ctx.inTransaction(async connection => {
    const [events] = await connection.query(
      "SELECT e.id, e.team_id, e.title, e.starts_at, t.name AS team_name FROM team_events e JOIN teams t ON t.id = e.team_id WHERE e.reminded_at IS NULL AND e.kind NOT IN ('availability', 'unavailable') AND e.starts_at > ? AND e.starts_at <= ? FOR UPDATE",
      [now, now + REMINDER_HOURS[0] * HOUR]
    );
    const result = { notifications: [], posts: [] };
    // what was already sent, for all the events of the window in ONE query (the loop used to ask once
    // per event, every minute, even when nothing was due)
    const sentBy = new Map();
    if (events.length) {
      const [sent] = await connection.query(
        "SELECT event_id, hours FROM event_reminders WHERE event_id IN (?)",
        [events.map(event => event.id)]
      );
      for (const row of sent) {
        if (!sentBy.has(row.event_id)) {
          sentBy.set(row.event_id, new Set());
        }
        sentBy.get(row.event_id).add(row.hours);
      }
    }
    for (const event of events) {
      const startsAt = Number(event.starts_at);
      const done = sentBy.get(event.id) ?? new Set();
      const due = REMINDER_HOURS.filter(hours => startsAt <= now + hours * HOUR);
      const fresh = due.filter(hours => !done.has(hours));
      if (!fresh.length) {
        continue;
      }
      await connection.query(
        "INSERT IGNORE INTO event_reminders (event_id, hours, sent_at) VALUES ?",
        [due.map(hours => [event.id, hours, now])]
      );
      const hours = Math.min(...fresh);
      const [members] = await connection.query(
        "SELECT m.user_id FROM team_members m LEFT JOIN event_rsvps r ON r.event_id = ? AND r.user_id = m.user_id WHERE m.team_id = ? AND (r.answer IS NULL OR r.answer <> 'no')",
        [event.id, event.team_id]
      );
      result.notifications.push(
        ...(await notify(
          connection,
          members.map(member => member.user_id),
          "reminder",
          { eventId: event.id, title: event.title, team: event.team_name, startsAt, hours }
        ))
      );
      result.posts.push({
        teamId: event.team_id,
        team: event.team_name,
        title: event.title,
        startsAt,
        hours
      });
    }
    return result;
  });
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { setRsvp, rsvpsFor, agendaOfUser, dueReminders };
