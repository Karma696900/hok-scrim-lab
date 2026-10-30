// API keys: a signed-in person creates keys to read their data (and the data of the game) from their own
// programs. Only the SHA-256 of a key is kept (a key has 256 bits of entropy, so no salt or slow hash is
// needed), with its first characters to recognise it in a list. A key is read-only, holds scopes, can
// expire and be revoked at once. Additive only.
export default {
  version: 33,
  name: "api-keys",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS api_keys (
      id CHAR(36) NOT NULL PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      name VARCHAR(60) NOT NULL,
      hint VARCHAR(12) NOT NULL,
      key_hash CHAR(64) NOT NULL,
      scopes VARCHAR(200) NOT NULL,
      created_at BIGINT NOT NULL,
      last_used_at BIGINT NULL,
      expires_at BIGINT NULL,
      revoked_at BIGINT NULL,
      UNIQUE KEY uq_api_keys_hash (key_hash),
      INDEX idx_api_keys_user (user_id, created_at),
      CONSTRAINT fk_api_keys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
