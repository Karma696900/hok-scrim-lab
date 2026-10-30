// Schema as it existed before migrations were introduced. Every statement is IF NOT EXISTS, so
// running it on a database created by the old code is a no-op.
export default {
  version: 1,
  name: "baseline",
  async up(connection) {
    const statements = [
      `CREATE TABLE IF NOT EXISTS heroes (
        id VARCHAR(80) PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        image TEXT NOT NULL,
        roles_json JSON NOT NULL,
        lanes_json JSON NOT NULL,
        source_ids_json JSON NOT NULL,
        available_global BOOLEAN NOT NULL DEFAULT TRUE,
        source_updated VARCHAR(32) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        INDEX idx_heroes_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS metadata (
        meta_key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS series (
        id VARCHAR(36) PRIMARY KEY,
        data_json LONGTEXT NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        INDEX idx_series_updated (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS tier_lists (
        id VARCHAR(36) PRIMARY KEY,
        data_json LONGTEXT NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        INDEX idx_tier_lists_updated (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        google_subject VARCHAR(255) NOT NULL UNIQUE,
        email VARCHAR(320) NOT NULL,
        name VARCHAR(255) NOT NULL,
        picture TEXT NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS sessions (
        token_hash CHAR(64) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        expires_at BIGINT NOT NULL,
        INDEX idx_sessions_expiry (expires_at),
        CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS online_series (
        series_id VARCHAR(36) PRIMARY KEY,
        invitation_code VARCHAR(64) NOT NULL UNIQUE,
        team_a_user_id VARCHAR(36) NOT NULL,
        team_b_user_id VARCHAR(36) NULL,
        CONSTRAINT fk_online_series_series FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        CONSTRAINT fk_online_series_team_a FOREIGN KEY (team_a_user_id) REFERENCES users(id),
        CONSTRAINT fk_online_series_team_b FOREIGN KEY (team_b_user_id) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    ];
    for (const statement of statements) {
      await connection.query(statement);
    }
  }
};
