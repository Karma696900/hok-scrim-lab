import { addColumnIfMissing, addIndexIfMissing } from "./helpers.js";

// Ownership, sharing and optimistic-concurrency columns. Purely additive:
//  - rows that exist today keep their data and get owner_user_id = NULL ("orphan"), invisible to
//    everybody until scripts/accounts/claim-legacy.js attaches them to an account;
//  - online series are the exception: their creator is known (team A) and becomes owner.
export default {
  version: 2,
  name: "ownership-sharing",
  async up(connection) {
    // Guests are users without a Google subject (UNIQUE still allows many NULLs).
    await connection.query("ALTER TABLE users MODIFY google_subject VARCHAR(255) NULL");
    await addColumnIfMissing(connection, "users", "is_guest", "BOOLEAN NOT NULL DEFAULT FALSE");

    await addColumnIfMissing(connection, "sessions", "created_at", "BIGINT NOT NULL DEFAULT 0");
    await addColumnIfMissing(connection, "sessions", "last_seen_at", "BIGINT NOT NULL DEFAULT 0");
    await connection.query(
      "UPDATE sessions SET created_at = expires_at - 2592000000, last_seen_at = expires_at - 2592000000 WHERE created_at = 0"
    );

    for (const table of ["series", "tier_lists"]) {
      await addColumnIfMissing(connection, table, "owner_user_id", "VARCHAR(36) NULL");
      await addColumnIfMissing(connection, table, "version", "INT NOT NULL DEFAULT 0");
      await addIndexIfMissing(
        connection,
        table,
        `idx_${table}_owner`,
        `INDEX idx_${table}_owner (owner_user_id, updated_at)`
      );
      const [constraints] = await connection.query(
        "SELECT 1 FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?",
        [table, `fk_${table}_owner`]
      );
      if (!constraints.length) {
        await connection.query(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT fk_${table}_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL`
        );
      }
    }

    for (const [resource, parent] of [
      ["series", "series"],
      ["tier_list", "tier_lists"]
    ]) {
      await connection.query(`CREATE TABLE IF NOT EXISTS ${resource}_members (
        ${resource}_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        role ENUM('viewer','editor') NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (${resource}_id, user_id),
        INDEX idx_${resource}_members_user (user_id),
        CONSTRAINT fk_${resource}_members_parent FOREIGN KEY (${resource}_id) REFERENCES ${parent}(id) ON DELETE CASCADE,
        CONSTRAINT fk_${resource}_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await connection.query(`CREATE TABLE IF NOT EXISTS ${resource}_invites (
        token_hash CHAR(64) PRIMARY KEY,
        ${resource}_id VARCHAR(36) NOT NULL,
        role ENUM('viewer','editor') NOT NULL,
        created_by VARCHAR(36) NULL,
        created_at VARCHAR(40) NOT NULL,
        expires_at BIGINT NOT NULL,
        max_uses INT NOT NULL DEFAULT 1,
        uses INT NOT NULL DEFAULT 0,
        revoked BOOLEAN NOT NULL DEFAULT FALSE,
        INDEX idx_${resource}_invites_parent (${resource}_id),
        CONSTRAINT fk_${resource}_invites_parent FOREIGN KEY (${resource}_id) REFERENCES ${parent}(id) ON DELETE CASCADE,
        CONSTRAINT fk_${resource}_invites_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    }

    // Online series already know who created them and who joined.
    await connection.query(`UPDATE series JOIN online_series ON online_series.series_id = series.id
      SET series.owner_user_id = online_series.team_a_user_id WHERE series.owner_user_id IS NULL`);
    await connection.query(
      `INSERT IGNORE INTO series_members (series_id, user_id, role, created_at)
      SELECT series_id, team_b_user_id, 'editor', ? FROM online_series WHERE team_b_user_id IS NOT NULL`,
      [new Date().toISOString()]
    );
  }
};
