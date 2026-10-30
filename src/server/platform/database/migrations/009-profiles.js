import { randomInt } from "node:crypto";
import { addColumnIfMissing, addIndexIfMissing } from "./helpers.js";

// Profiles: a public tag (unique, immutable) on every account, the pseudo chosen by the player
// (never Google's name), the avatar choice (Google photo, uploaded photo, or none) and whether the
// profile has been completed.
//  - users.tag: 6 characters from an unambiguous alphabet, unique. Backfilled for every existing
//    account.
//  - users.google_picture: what Google sent. users.picture stays "the avatar to show" (so every
//    query that already reads it keeps working).
//  - users.avatar_kind: 'none' | 'google' | 'custom'.
//  - users.profile_complete: false for Google accounts that have not chosen a pseudo and a password
//    yet.
//  - user_avatars: the uploaded photo (processed server-side: square, WebP, small).
const TAG_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const newTag = () =>
  Array.from({ length: 6 }, () => TAG_ALPHABET[randomInt(TAG_ALPHABET.length)]).join("");

export default {
  version: 9,
  name: "profiles",
  async up(connection) {
    await addColumnIfMissing(connection, "users", "tag", "VARCHAR(8) NULL");
    await addColumnIfMissing(connection, "users", "google_picture", "TEXT NULL");
    await addColumnIfMissing(
      connection,
      "users",
      "avatar_kind",
      "VARCHAR(10) NOT NULL DEFAULT 'none'"
    );
    await addColumnIfMissing(
      connection,
      "users",
      "profile_complete",
      "BOOLEAN NOT NULL DEFAULT TRUE"
    );
    await addIndexIfMissing(connection, "users", "uq_users_tag", "UNIQUE INDEX uq_users_tag (tag)");

    // Existing Google accounts: their Google photo stays, but their name came from Google, so they
    // choose a pseudo (and a password) at the next sign-in.
    await connection.query(
      "UPDATE users SET google_picture = picture, avatar_kind = IF(picture <> '', 'google', 'none') WHERE google_subject IS NOT NULL AND is_guest = FALSE AND google_picture IS NULL"
    );
    await connection.query(
      "UPDATE users SET profile_complete = FALSE WHERE google_subject IS NOT NULL AND is_guest = FALSE AND password_hash IS NULL"
    );

    const [rows] = await connection.query(
      "SELECT id FROM users WHERE tag IS NULL AND is_guest = FALSE"
    );
    for (const { id } of rows) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          await connection.query("UPDATE users SET tag = ? WHERE id = ?", [newTag(), id]);
          break;
        } catch (error) {
          if (error.code !== "ER_DUP_ENTRY") {
            throw error;
          }
        }
      }
    }

    await connection.query(`CREATE TABLE IF NOT EXISTS user_avatars (
      user_id VARCHAR(36) NOT NULL PRIMARY KEY,
      mime VARCHAR(30) NOT NULL,
      data MEDIUMBLOB NOT NULL,
      updated_at BIGINT NOT NULL,
      CONSTRAINT fk_avatar_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
