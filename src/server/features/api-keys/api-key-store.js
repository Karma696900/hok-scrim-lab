import { randomUUID } from "node:crypto";
import { EDITOR_LABEL } from "../../../shared/access-rules.js";
import { conflict } from "../../platform/errors.js";
import { USER_COLUMNS, userFromRow } from "../auth/session-store.js";
import { scopesOf } from "./api-key-domain.js";

/** `last_used_at` is written at most once a minute per key: reading the API must not write on every call. */
const TOUCH_EVERY_MS = 60_000;

/**
 * Database access for the API keys (api_keys): what a person keeps, what the API checks on every call.
 * Only the hash of a key is stored.
 */
export function createApiKeyStore({ pool, inTransaction }) {
  return {
    /** The keys of a person, the newest first, with the revoked and the expired ones (they say what happened). */
    async listApiKeys(userId) {
      const [rows] = await pool.execute(
        "SELECT id, name, hint, scopes, created_at, last_used_at, expires_at, revoked_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC, id LIMIT 200",
        [userId]
      );
      return rows;
    },

    /**
     * Stores a new key unless the person already holds `max` active ones (counted under a lock on their
     * account, so that two requests at once cannot both pass).
     */
    async createApiKey(userId, { name, hint, hash, scopes, expiresAt }, { max, now = Date.now() }) {
      return inTransaction(async connection => {
        await connection.execute("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
        const [[{ active }]] = await connection.execute(
          "SELECT COUNT(*) AS active FROM api_keys WHERE user_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)",
          [userId, now]
        );
        if (Number(active) >= max) {
          throw conflict("You can keep {max} active API keys: revoke one first.", "too_many_keys", {
            max
          });
        }
        const id = randomUUID();
        await connection.execute(
          "INSERT INTO api_keys (id, user_id, name, hint, key_hash, scopes, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [id, userId, name, hint, hash, scopes.join(","), now, expiresAt]
        );
        return id;
      });
    },

    /** Revokes a key of this person, at once and for good. False when there is no such live key. */
    async revokeApiKey(userId, id, now = Date.now()) {
      const [result] = await pool.execute(
        "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
        [now, id, userId]
      );
      return result.affectedRows === 1;
    },

    /** Removes a revoked or expired key from the list of this person. False when it is still live. */
    async deleteApiKey(userId, id, now = Date.now()) {
      const [result] = await pool.execute(
        "DELETE FROM api_keys WHERE id = ? AND user_id = ? AND (revoked_at IS NOT NULL OR (expires_at IS NOT NULL AND expires_at <= ?))",
        [id, userId, now]
      );
      return result.affectedRows === 1;
    },

    /** The key and the account behind a hash, or null: not found, revoked or expired. */
    async findApiKey(hash, now = Date.now()) {
      const [rows] = await pool.execute(
        `SELECT api_keys.id AS key_id, api_keys.name AS key_name, api_keys.scopes, api_keys.expires_at, ${USER_COLUMNS}
         FROM api_keys JOIN users ON users.id = api_keys.user_id
         WHERE api_keys.key_hash = ? AND api_keys.revoked_at IS NULL AND (api_keys.expires_at IS NULL OR api_keys.expires_at > ?)`,
        [EDITOR_LABEL, hash, now]
      );
      const row = rows[0];
      if (!row) {
        return null;
      }
      return {
        key: {
          id: row.key_id,
          name: row.key_name,
          scopes: scopesOf(row.scopes),
          expiresAt: row.expires_at === null ? null : Number(row.expires_at)
        },
        user: userFromRow(row)
      };
    },

    /** Notes that a key was just used (not more than once a minute). */
    async touchApiKey(id, now = Date.now()) {
      await pool.execute(
        "UPDATE api_keys SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)",
        [now, id, now - TOUCH_EVERY_MS]
      );
    },

    /** Forgets what is of no use any more: keys revoked or expired for more than `olderThanMs`. */
    async purgeApiKeys(olderThanMs, now = Date.now()) {
      const [result] = await pool.execute(
        "DELETE FROM api_keys WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR (expires_at IS NOT NULL AND expires_at < ?)",
        [now - olderThanMs, now - olderThanMs]
      );
      return result.affectedRows;
    }
  };
}
