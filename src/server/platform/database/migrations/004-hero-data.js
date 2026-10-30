// Hero data beyond the Camp roster. Both tables are fed by admins only and carry their provenance.
//  - hero_lane_additions: extra lanes for heroes that play several (Camp lists exactly one per
//    hero). Rows are always marked source='manual'; the Camp lane in `heroes` is never touched.
//  - competitive_imports / competitive_hero_stats: manual JSON/CSV imports of competitive counts
//    (pick/ban/win) with source, URL, region, patch, date and licence. Heroes are matched by their
//    Camp Global hero id, never by name. Nothing is ever ingested automatically.
export default {
  version: 4,
  name: "hero-data",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS hero_lane_additions (
      hero_id VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL,
      lane VARCHAR(20) NOT NULL,
      source VARCHAR(20) NOT NULL DEFAULT 'manual',
      note VARCHAR(200) NOT NULL DEFAULT '',
      created_by VARCHAR(36) NULL,
      created_at VARCHAR(40) NOT NULL,
      PRIMARY KEY (hero_id, lane),
      CONSTRAINT fk_lane_additions_hero FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await connection.query(`CREATE TABLE IF NOT EXISTS competitive_imports (
      id VARCHAR(36) PRIMARY KEY,
      source VARCHAR(120) NOT NULL,
      source_url VARCHAR(500) NOT NULL,
      region VARCHAR(60) NOT NULL,
      patch VARCHAR(40) NOT NULL,
      source_updated_at VARCHAR(40) NOT NULL,
      license VARCHAR(40) NOT NULL,
      attribution TEXT NOT NULL,
      total_games INT NOT NULL,
      row_count INT NOT NULL,
      imported_by VARCHAR(36) NULL,
      imported_at VARCHAR(40) NOT NULL,
      INDEX idx_competitive_imports_date (imported_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await connection.query(`CREATE TABLE IF NOT EXISTS competitive_hero_stats (
      import_id VARCHAR(36) NOT NULL,
      hero_id VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL,
      picks INT NOT NULL,
      bans INT NOT NULL,
      wins INT NOT NULL,
      PRIMARY KEY (import_id, hero_id),
      INDEX idx_competitive_stats_hero (hero_id),
      CONSTRAINT fk_competitive_stats_import FOREIGN KEY (import_id) REFERENCES competitive_imports(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
