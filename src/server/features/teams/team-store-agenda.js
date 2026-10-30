// team store, agenda: listEvents, createEvent, updateEvent, deleteEvent, and 2 more.
import { conflict } from "../../platform/errors.js";
import { randomUUID } from "node:crypto";

// ---- agenda ---------------------------------------------------------------------------------
export async function listEvents(ctx, teamId, { from, to, publicOnly }) {
  const [rows] = await ctx.pool.query(
    "SELECT id, kind, title, starts_at, ends_at, note FROM team_events WHERE team_id = ? AND ends_at > ? AND starts_at < ?" +
      (publicOnly ? " AND kind = 'availability'" : "") +
      " ORDER BY starts_at, id",
    [teamId, from, to]
  );
  return rows.map(row => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    startsAt: Number(row.starts_at),
    endsAt: Number(row.ends_at),
    note: publicOnly ? "" : row.note
  }));
}

/**
 * The event, and its weekly copies when input.repeatWeeks is set (the same hour, every week).
 * Returns the ids.
 */
export async function createEvent(ctx, teamId, userId, input, maxEvents) {
  const WEEK = 7 * 24 * 3600_000;
  const ids = [];
  await ctx.inTransaction(async connection => {
    const [[{ n }]] = await connection.query(
      "SELECT COUNT(*) AS n FROM team_events WHERE team_id = ? FOR UPDATE",
      [teamId]
    );
    const copies = 1 + (input.repeatWeeks ?? 0);
    if (Number(n) + copies > maxEvents) {
      throw conflict(
        "A team agenda holds at most {max} events: delete old ones first.",
        "agenda_full",
        { max: maxEvents }
      );
    }
    for (let week = 0; week < copies; week += 1) {
      const id = randomUUID();
      await connection.execute(
        "INSERT INTO team_events (id, team_id, kind, title, starts_at, ends_at, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          id,
          teamId,
          input.kind,
          input.title,
          input.startsAt + week * WEEK,
          input.endsAt + week * WEEK,
          input.note,
          userId,
          Date.now()
        ]
      );
      ids.push(id);
    }
  });
  return ids;
}

export async function updateEvent(ctx, teamId, eventId, input) {
  const [result] = await ctx.pool.execute(
    "UPDATE team_events SET kind = ?, title = ?, starts_at = ?, ends_at = ?, note = ? WHERE id = ? AND team_id = ?",
    [input.kind, input.title, input.startsAt, input.endsAt, input.note, eventId, teamId]
  );
  return result.affectedRows > 0;
}

export async function deleteEvent(ctx, teamId, eventId) {
  const [result] = await ctx.pool.execute("DELETE FROM team_events WHERE id = ? AND team_id = ?", [
    eventId,
    teamId
  ]);
  return result.affectedRows > 0;
}

export async function setTeamMember(ctx, teamId, userId, { role, lane }) {
  const [result] = await ctx.pool.execute(
    "UPDATE team_members SET role = ?, lane = ? WHERE team_id = ? AND user_id = ? AND role <> 'owner'",
    [role, lane, teamId, userId]
  );
  return result.affectedRows > 0;
}

export async function removeTeamMember(ctx, teamId, userId) {
  const [result] = await ctx.pool.query(
    "DELETE FROM team_members WHERE team_id = ? AND user_id = ? AND role <> 'owner'",
    [teamId, userId]
  );
  return result.affectedRows > 0;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  setTeamMember,
  removeTeamMember
};
