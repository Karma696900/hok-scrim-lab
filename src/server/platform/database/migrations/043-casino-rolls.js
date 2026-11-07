// The composition roulettes (/casino, spec 2026-11-07): no account; the id is in the shared link, only the hash of
// the control key is kept; the whole state (pools, banned heroes, result, history) is one JSON text; `version`
// counts the changes so two control devices never overwrite each other. Deleted 7 days after the last change.
// Additive only.
export default {
  version: 43,
  name: "casino-rolls",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS casino_rolls (
      id CHAR(10) NOT NULL PRIMARY KEY,
      key_hash CHAR(64) NOT NULL,
      version INT UNSIGNED NOT NULL DEFAULT 0,
      state_json MEDIUMTEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_casino_updated (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
