// The personal space: the builds a person keeps on their account, and the links with which they share
// their space. A link says which parts it shares and, when it was given a lifetime, when it ends; only
// the hash of its token is kept, so that nobody who reads the database can open a space. Additive only.
export default {
  version: 24,
  name: "personal-space",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS space_builds (
      id CHAR(36) NOT NULL PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      hero_id VARCHAR(80) NOT NULL DEFAULT '',
      name VARCHAR(60) NOT NULL DEFAULT '',
      level TINYINT NOT NULL DEFAULT 15,
      build_json TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_space_builds_user (user_id, updated_at),
      CONSTRAINT fk_space_builds_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS space_links (
      id CHAR(36) NOT NULL PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      label VARCHAR(60) NOT NULL DEFAULT '',
      sections VARCHAR(60) NOT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NULL,
      opened_at BIGINT NULL,
      opened_count INT NOT NULL DEFAULT 0,
      UNIQUE INDEX uq_space_links_token (token_hash),
      INDEX idx_space_links_user (user_id, created_at),
      CONSTRAINT fk_space_links_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
