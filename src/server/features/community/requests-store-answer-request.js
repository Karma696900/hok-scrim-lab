// requests store, answer request: answerRequest, blockTeam, listReports, dismissReport.
import { conflict, forbidden, notFound } from "../../platform/errors.js";
import { isStaff, notify, sideOf, staffOf } from "./store-helpers.js";
import { randomUUID } from "node:crypto";

/**
 * accept | decline | counter (the team whose turn it is) and cancel (the other one). Accepting
 * puts the scrim in both agendas.
 */
export async function answerRequest(
  ctx,
  requestId,
  userId,
  action,
  counter = null,
  now = Date.now()
) {
  return ctx.inTransaction(async connection => {
    const [[row]] = await connection.query("SELECT * FROM scrim_requests WHERE id = ? FOR UPDATE", [
      requestId
    ]);
    if (!row) {
      throw notFound("Request not found.");
    }
    const side = await sideOf(connection, row, userId);
    if (!side) {
      throw notFound("Request not found.");
    }
    if (!["pending", "countered"].includes(row.status)) {
      throw conflict("This request is already settled.", "request_closed");
    }
    const mineTurn = side === row.awaiting_team_id;
    if (action === "cancel" ? mineTurn : !mineTurn) {
      throw forbidden(
        action === "cancel"
          ? "Only the team that proposed the time can cancel."
          : "It is the other team's turn to answer."
      );
    }
    const other = side === row.from_team_id ? row.to_team_id : row.from_team_id;
    const [[mine]] = await connection.query("SELECT name FROM teams WHERE id = ?", [side]);
    const [[theirs]] = await connection.query("SELECT name FROM teams WHERE id = ?", [other]);
    let status = row.status,
      awaiting = row.awaiting_team_id,
      startsAt = Number(row.starts_at),
      endsAt = Number(row.ends_at),
      note = row.note,
      body = "";
    if (action === "accept") {
      status = "accepted";
      const details = `BO${row.format} · ${row.hero_rule === "global-ban-pick" ? "Global Ban & Pick" : "Free For All"} · ${row.control === "online" ? "online room" : "external lobby"}`;
      for (const [teamId, opponent] of [
        [side, theirs.name],
        [other, mine.name]
      ]) {
        await connection.execute(
          "INSERT INTO team_events (id, team_id, kind, title, starts_at, ends_at, note, created_by, created_at) VALUES (?, ?, 'scrim', ?, ?, ?, ?, ?, ?)",
          [
            randomUUID(),
            teamId,
            `Scrim vs ${opponent}`.slice(0, 80),
            startsAt,
            endsAt,
            details,
            userId,
            now
          ]
        );
      }
      body = String(startsAt);
    } else if (action === "decline") {
      status = "declined";
    } else if (action === "cancel") {
      status = "cancelled";
    } else if (action === "counter") {
      status = "countered";
      awaiting = other;
      startsAt = counter.startsAt;
      endsAt = counter.endsAt;
      note = counter.note || row.note;
      body = String(startsAt);
    }
    await connection.execute(
      "UPDATE scrim_requests SET status = ?, awaiting_team_id = ?, starts_at = ?, ends_at = ?, note = ?, updated_at = ? WHERE id = ?",
      [status, awaiting, startsAt, endsAt, note, now, requestId]
    );
    await connection.execute(
      "INSERT INTO request_messages (id, request_id, user_id, team_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [randomUUID(), requestId, userId, side, action, body || action, now]
    );
    const kind = action === "counter" ? "request" : "answer";
    const notifications = await notify(connection, await staffOf(connection, other), kind, {
      requestId,
      team: mine.name,
      action,
      startsAt
    });
    const accepted =
      action === "accept"
        ? {
            fromName: row.from_team_id === side ? mine.name : theirs.name,
            toName: row.from_team_id === side ? theirs.name : mine.name,
            teamIds: [side, other],
            startsAt,
            format: row.format,
            heroRule: row.hero_rule
          }
        : null;
    return { status, notifications, accepted };
  });
}

export async function blockTeam(ctx, userId, teamId, blockedTeamId) {
  if (!(await isStaff(ctx.pool, teamId, userId))) {
    throw forbidden("Only the staff and the captain can do this.");
  }
  if (teamId === blockedTeamId) {
    throw conflict("A team cannot block itself.", "invalid_body");
  }
  await ctx.pool.execute(
    "INSERT IGNORE INTO team_blocks (team_id, blocked_team_id, created_at) VALUES (?, ?, ?)",
    [teamId, blockedTeamId, Date.now()]
  );
}

/**
 * What the administrators read: who reported, why, which two teams were talking and the last
 * text messages of that conversation.
 */
export async function listReports(ctx, limit = 100) {
  const [rows] = await ctx.pool.query(
    `SELECT r.id, r.request_id, r.reason, r.created_at, u.name, u.tag, f.name AS from_name, t.name AS to_name
           FROM reports r JOIN users u ON u.id = r.reporter_id
           LEFT JOIN scrim_requests q ON q.id = r.request_id LEFT JOIN teams f ON f.id = q.from_team_id LEFT JOIN teams t ON t.id = q.to_team_id
           ORDER BY r.created_at DESC LIMIT ?`,
    [limit]
  );
  const items = [];
  for (const row of rows) {
    let messages = [];
    if (row.request_id) {
      const [thread] = await ctx.pool.query(
        "SELECT m.body, m.created_at, u2.name, u2.tag FROM request_messages m JOIN users u2 ON u2.id = m.user_id WHERE m.request_id = ? AND m.kind = 'text' ORDER BY m.created_at DESC LIMIT 20",
        [row.request_id]
      );
      messages = thread.reverse().map(message => ({
        text: message.body,
        at: Number(message.created_at),
        author: { name: message.name, tag: message.tag }
      }));
    }
    items.push({
      id: row.id,
      requestId: row.request_id,
      reason: row.reason,
      at: Number(row.created_at),
      reporter: { name: row.name, tag: row.tag },
      teams: row.from_name ? [row.from_name, row.to_name] : [],
      messages
    });
  }
  return items;
}

export async function dismissReport(ctx, reportId) {
  const [result] = await ctx.pool.execute("DELETE FROM reports WHERE id = ?", [reportId]);
  return result.affectedRows > 0;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { answerRequest, blockTeam, listReports, dismissReport };
