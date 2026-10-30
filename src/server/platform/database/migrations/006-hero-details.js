// Hero sheets fetched from HOK Camp (Global): skills, lore, gallery, patch history. One row per
// hero, replaced as a whole on each successful fetch (a failed fetch never touches the previous
// row).
export default {
  version: 6,
  name: "hero-details",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS hero_details (
      hero_id VARCHAR(80) COLLATE utf8mb4_unicode_ci PRIMARY KEY,
      data_json LONGTEXT NOT NULL,
      source VARCHAR(20) NOT NULL DEFAULT 'camp',
      fetched_at VARCHAR(40) NOT NULL,
      CONSTRAINT fk_hero_details_hero FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
