import { randomUUID } from "node:crypto";

/** How long a message is kept at the most: the privacy policy says twelve months. */
const CONTACT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

const present = row => ({
  id: row.id,
  name: row.name,
  email: row.email,
  subject: row.subject,
  message: row.message,
  language: row.language,
  signedIn: row.user_id !== null,
  createdAt: Number(row.created_at),
  handledAt: row.handled_at === null ? null : Number(row.handled_at)
});

/** Database access for the messages of the contact page. */
export function createContactStore({ pool }) {
  return {
    /** Keeps a message (and deletes the ones that went past the retention: nothing else needs to run for that). */
    async addContactMessage({ name, email, subject, message, language, userId }, now = Date.now()) {
      const id = randomUUID();
      await pool.query("DELETE FROM contact_messages WHERE created_at < ?", [
        now - CONTACT_RETENTION_MS
      ]);
      await pool.query(
        "INSERT INTO contact_messages (id, name, email, subject, message, language, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [id, name, email, subject, message, language, userId ?? null, now]
      );
      return id;
    },
    /** The ones not handled yet first, the newest first. */
    async listContactMessages({ limit = 50, offset = 0 } = {}) {
      const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM contact_messages");
      const [rows] = await pool.query(
        "SELECT * FROM contact_messages ORDER BY (handled_at IS NOT NULL), created_at DESC LIMIT ? OFFSET ?",
        [limit, offset]
      );
      const [[{ open }]] = await pool.query(
        "SELECT COUNT(*) AS open FROM contact_messages WHERE handled_at IS NULL"
      );
      return { items: rows.map(present), total: Number(total), open: Number(open) };
    },
    /** Marks a message handled (or not, with `handled: false`); false when there is no such message. */
    async setContactHandled(id, handled, now = Date.now()) {
      const [result] = await pool.query("UPDATE contact_messages SET handled_at = ? WHERE id = ?", [
        handled ? now : null,
        id
      ]);
      return result.affectedRows > 0;
    },
    async deleteContactMessage(id) {
      const [result] = await pool.query("DELETE FROM contact_messages WHERE id = ?", [id]);
      return result.affectedRows > 0;
    }
  };
}
