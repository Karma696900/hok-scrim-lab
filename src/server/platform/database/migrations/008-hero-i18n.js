// Hero data in the other languages Camp Global serves: the localized sheet (skills, lore, gallery,
// patch history) and the localized name and classes of each hero. English stays in `heroes` /
// `hero_details`; these tables only add rows.
export default {
  version: 8,
  name: "hero-i18n",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS hero_details_i18n (
      hero_id VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL,
      lang VARCHAR(8) NOT NULL,
      data_json LONGTEXT NOT NULL,
      fetched_at VARCHAR(40) NOT NULL,
      PRIMARY KEY (hero_id, lang),
      CONSTRAINT fk_hero_details_i18n_hero FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS hero_names (
      hero_id VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL,
      lang VARCHAR(8) NOT NULL,
      name VARCHAR(160) NOT NULL,
      roles_json VARCHAR(400) NOT NULL,
      fetched_at VARCHAR(40) NOT NULL,
      PRIMARY KEY (hero_id, lang),
      CONSTRAINT fk_hero_names_hero FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
