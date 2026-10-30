// The other names of a hero (what a broadcast, a Liquipedia page or a stream title calls it), typed by an administrator on the
// hero sheet and read by the automatic import. One key (see shared/vod-model.js) names one hero only. Additive only.
export default {
  version: 37,
  name: "hero-aliases",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS hero_aliases (
      hero_id VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL,
      alias VARCHAR(80) NOT NULL,
      alias_key VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL,
      created_by VARCHAR(36) NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (hero_id, alias_key),
      UNIQUE KEY uq_hero_aliases_key (alias_key),
      CONSTRAINT fk_hero_aliases_hero FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
