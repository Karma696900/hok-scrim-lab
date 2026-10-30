// requests store, create request: createRequest, listRequests, getRequest, addMessage.
import { REQUESTS_PER_DAY } from "./community-domain.js";
import { conflict, forbidden, notFound } from "../../platform/errors.js";
import {
  isStaff,
  notify,
  requestRow,
  requestSelect,
  sideOf,
  staffList,
  staffOf
} from "./store-helpers.js";
import { randomUUID } from "node:crypto";

// ---- requests -------------------------------------------------------------------------------
export async function createRequest(ctx, userId, input, now = Date.now()) {
  return ctx.inTransaction(async connection => {
    if (!(await isStaff(connection, input.fromTeamId, userId))) {
      throw forbidden("Only the staff and the captain can do this.");
    }
    const [[target]] = await connection.query("SELECT id, name FROM teams WHERE id = ?", [
      input.toTeamId
    ]);
    if (!target) {
      throw notFound("Team not found.");
    }
    const [[blocked]] = await connection.query(
      "SELECT 1 AS yes FROM team_blocks WHERE (team_id = ? AND blocked_team_id = ?) OR (team_id = ? AND blocked_team_id = ?)",
      [input.toTeamId, input.fromTeamId, input.fromTeamId, input.toTeamId]
    );
    if (blocked) {
      throw forbidden("This team does not take requests from you.");
    }
    if (input.postId) {
      const [[post]] = await connection.query(
        "SELECT team_id, closed, ends_at FROM scrim_posts WHERE id = ?",
        [input.postId]
      );
      if (!post || post.team_id !== input.toTeamId || post.closed || Number(post.ends_at) <= now) {
        throw conflict("This announcement is no longer open.", "post_closed");
      }
    }
    const [[{ n }]] = await connection.query(
      "SELECT COUNT(*) AS n FROM scrim_requests WHERE from_team_id = ? AND created_at > ?",
      [input.fromTeamId, now - 24 * 3600_000]
    );
    if (Number(n) >= REQUESTS_PER_DAY) {
      throw conflict("You can send {max} requests per day per team.", "request_limit", {
        max: REQUESTS_PER_DAY
      });
    }
    const [[twin]] = await connection.query(
      "SELECT 1 AS yes FROM scrim_requests WHERE from_team_id = ? AND to_team_id = ? AND starts_at = ? AND status IN ('pending', 'countered')",
      [input.fromTeamId, input.toTeamId, input.startsAt]
    );
    if (twin) {
      throw conflict(
        "A request for this time is already waiting for an answer.",
        "request_duplicate"
      );
    }
    const id = randomUUID();
    await connection.execute(
      "INSERT INTO scrim_requests (id, from_team_id, to_team_id, post_id, created_by, starts_at, ends_at, format, hero_rule, control, note, status, awaiting_team_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
      [
        id,
        input.fromTeamId,
        input.toTeamId,
        input.postId,
        userId,
        input.startsAt,
        input.endsAt,
        input.format,
        input.heroRule,
        input.control,
        input.note,
        input.toTeamId,
        now,
        now
      ]
    );
    const [[from]] = await connection.query("SELECT name FROM teams WHERE id = ?", [
      input.fromTeamId
    ]);
    const notifications = await notify(
      connection,
      await staffOf(connection, input.toTeamId),
      "request",
      {
        requestId: id,
        team: from.name,
        startsAt: input.startsAt,
        format: input.format,
        heroRule: input.heroRule
      }
    );
    return { id, notifications };
  });
}

export async function listRequests(ctx, userId) {
  // The teams this person runs come first (a handful), so that the requests are read with their ids
  // in plain lists: MySQL then goes through the two team indexes. With a subquery in the same place
  // it read every request of the site (8 383 rows on the probe's data).
  const [staff] = await ctx.pool.query(
    `SELECT team_id FROM team_members WHERE user_id = ? AND role IN (${staffList})`,
    [userId]
  );
  const mine = new Set(staff.map(row => row.team_id));
  if (!mine.size) {
    return [];
  }
  const teams = [...mine];
  const [rows] = await ctx.pool.query(
    `${requestSelect} WHERE r.from_team_id IN (?) OR r.to_team_id IN (?) ORDER BY r.updated_at DESC LIMIT 100`,
    [teams, teams]
  );
  return rows.map(row => {
    const request = requestRow(row);
    return {
      ...request,
      mySide: mine.has(request.from.id) ? "from" : "to",
      awaitingMe:
        ["pending", "countered"].includes(request.status) && mine.has(request.awaitingTeamId)
    };
  });
}

export async function getRequest(ctx, requestId, userId) {
  const [[row]] = await ctx.pool.query(`${requestSelect} WHERE r.id = ?`, [requestId]);
  if (!row) {
    throw notFound("Request not found.");
  }
  const request = requestRow(row);
  const side = await sideOf(ctx.pool, request, userId);
  if (!side) {
    throw notFound("Request not found.");
  }
  const [messages] = await ctx.pool.query(
    "SELECT m.id, m.kind, m.body, m.created_at, m.team_id, u.name, u.tag FROM request_messages m JOIN users u ON u.id = m.user_id WHERE m.request_id = ? ORDER BY m.created_at, m.id",
    [requestId]
  );
  return {
    ...request,
    mySide: side === request.from.id ? "from" : "to",
    awaitingMe:
      ["pending", "countered"].includes(request.status) && side === request.awaitingTeamId,
    messages: messages.map(message => ({
      id: message.id,
      kind: message.kind,
      text: message.body,
      at: Number(message.created_at),
      teamId: message.team_id,
      author: { name: message.name, tag: message.tag }
    }))
  };
}

export async function addMessage(ctx, requestId, userId, body, now = Date.now()) {
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
    if (row.status === "cancelled") {
      throw conflict("This request was cancelled.", "request_closed");
    }
    const [[{ n }]] = await connection.query(
      "SELECT COUNT(*) AS n FROM request_messages WHERE request_id = ?",
      [requestId]
    );
    if (Number(n) >= 200) {
      throw conflict("This conversation is full.", "conversation_full");
    }
    const id = randomUUID();
    await connection.execute(
      "INSERT INTO request_messages (id, request_id, user_id, team_id, kind, body, created_at) VALUES (?, ?, ?, ?, 'text', ?, ?)",
      [id, requestId, userId, side, body, now]
    );
    await connection.execute("UPDATE scrim_requests SET updated_at = ? WHERE id = ?", [
      now,
      requestId
    ]);
    const other = side === row.from_team_id ? row.to_team_id : row.from_team_id;
    const [[team]] = await connection.query("SELECT name FROM teams WHERE id = ?", [side]);
    const notifications = await notify(connection, await staffOf(connection, other), "message", {
      requestId,
      team: team.name
    });
    return { id, notifications };
  });
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { createRequest, listRequests, getRequest, addMessage };
