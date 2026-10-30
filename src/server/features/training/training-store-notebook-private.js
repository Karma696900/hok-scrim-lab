// training store, notebook private: listTrainingNotes, createTrainingNote, updateTrainingNote, deleteTrainingNote.
import { NOTES_MAX } from "./training-domain.js";
import { conflict } from "../../platform/errors.js";
import { randomUUID } from "node:crypto";
import { presentNote } from "./training-store-parts.js";

// ---- the notebook (private to its author) ---------------------------------------------------
export async function listTrainingNotes(ctx, userId, { kind = null, heroId = null } = {}) {
  const where = ["user_id = ?"];
  const params = [userId];
  if (kind) {
    where.push("kind = ?");
    params.push(kind);
  }
  if (heroId) {
    where.push("hero_id = ?");
    params.push(heroId);
  }
  const [rows] = await ctx.pool.query(
    `SELECT * FROM training_notes WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ${NOTES_MAX}`,
    params
  );
  return rows.map(presentNote);
}

export async function createTrainingNote(ctx, userId, note) {
  const id = randomUUID();
  const now = Date.now();
  await ctx.inTransaction(async connection => {
    const [[{ n }]] = await connection.query(
      "SELECT COUNT(*) AS n FROM training_notes WHERE user_id = ? FOR UPDATE",
      [userId]
    );
    if (Number(n) >= NOTES_MAX) {
      throw conflict("Your notebook is full ({max} notes). Delete some first.", "notebook_full", {
        max: NOTES_MAX
      });
    }
    await connection.execute(
      "INSERT INTO training_notes (id, user_id, kind, hero_id, title, body, status, steps_json, url, marks_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        userId,
        note.kind,
        note.heroId,
        note.title,
        note.body,
        note.status,
        note.steps.length ? JSON.stringify(note.steps) : null,
        note.url,
        note.marks.length ? JSON.stringify(note.marks) : null,
        now,
        now
      ]
    );
  });
  return presentNote(
    (await ctx.pool.query("SELECT * FROM training_notes WHERE id = ?", [id]))[0][0]
  );
}

/** Only the author's own note is touched; null when it is not theirs or does not exist. */
export async function updateTrainingNote(ctx, userId, id, note) {
  const [result] = await ctx.pool.execute(
    "UPDATE training_notes SET kind = ?, hero_id = ?, title = ?, body = ?, status = ?, steps_json = ?, url = ?, marks_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    [
      note.kind,
      note.heroId,
      note.title,
      note.body,
      note.status,
      note.steps.length ? JSON.stringify(note.steps) : null,
      note.url,
      note.marks.length ? JSON.stringify(note.marks) : null,
      Date.now(),
      id,
      userId
    ]
  );
  if (!result.affectedRows) {
    return null;
  }
  return presentNote(
    (await ctx.pool.query("SELECT * FROM training_notes WHERE id = ?", [id]))[0][0]
  );
}

export async function deleteTrainingNote(ctx, userId, id) {
  const [result] = await ctx.pool.execute(
    "DELETE FROM training_notes WHERE id = ? AND user_id = ?",
    [id, userId]
  );
  return result.affectedRows > 0;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  listTrainingNotes,
  createTrainingNote,
  updateTrainingNote,
  deleteTrainingNote
};
