// Real competitive games entered by an administrator (tournaments page), and the builds curated for
// each hero. - competitive_series: one series that was really played (event, stage, date, teams,
// best-of, optional patch, source and note). - competitive_games: its games (sides, winner, bans
// and picks as JSON). Deleting a series deletes its games. - hero_builds: up to two recommended
// builds per hero (items, arcana), entered by an administrator with their source. Hero statistics
// (competitive statistics, pairings) are computed from these rows: nothing is imported, estimated
// or invented.
export default {
  version: 10,
  name: "tournaments",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS competitive_series (
      id CHAR(36) PRIMARY KEY,
      event VARCHAR(160) NOT NULL,
      stage VARCHAR(80) NOT NULL DEFAULT '',
      team_a VARCHAR(80) NOT NULL,
      team_b VARCHAR(80) NOT NULL,
      best_of TINYINT NOT NULL,
      rule VARCHAR(80) NOT NULL DEFAULT 'free-for-all',
      played_on DATE NOT NULL,
      patch VARCHAR(40) NOT NULL DEFAULT '',
      source_url VARCHAR(500) NOT NULL DEFAULT '',
      note VARCHAR(500) NOT NULL DEFAULT '',
      created_by VARCHAR(36) NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_competitive_series_date (played_on),
      INDEX idx_competitive_series_event (event)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS competitive_games (
      id CHAR(36) PRIMARY KEY,
      series_id CHAR(36) NOT NULL,
      game_number TINYINT NOT NULL,
      blue_team VARCHAR(80) NOT NULL,
      red_team VARCHAR(80) NOT NULL,
      winner VARCHAR(80) NOT NULL,
      duration_seconds INT NULL,
      draft_json MEDIUMTEXT NOT NULL,
      UNIQUE KEY uq_competitive_game (series_id, game_number),
      CONSTRAINT fk_competitive_game_series FOREIGN KEY (series_id) REFERENCES competitive_series(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS hero_builds (
      hero_id VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL,
      variant TINYINT NOT NULL,
      name VARCHAR(60) NOT NULL DEFAULT '',
      items_json VARCHAR(1200) NOT NULL,
      arcana_json VARCHAR(600) NOT NULL,
      source_url VARCHAR(500) NOT NULL DEFAULT '',
      note VARCHAR(300) NOT NULL DEFAULT '',
      updated_by VARCHAR(36) NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (hero_id, variant),
      CONSTRAINT fk_hero_builds_hero FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
