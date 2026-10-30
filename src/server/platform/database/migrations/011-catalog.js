// The game catalogue, entered by an administrator (nothing is imported or guessed): - game_stats:
// the list of stats of the game (HP, physical defense, crit…) that items, arcana and heroes are
// written with. - tags + entity_tags: labels that apply to items, arcana and heroes, with the tags
// each one clashes with. - catalog_images: the pictures of items and arcana (processed server-side,
// small WebP). - catalog_items / catalog_arcana: name, picture, description, effects (several
// passives and/or actives), stats given. - hero_profiles: the real base stats of a hero (with
// growth per level) and the detailed numbers of each of its spells. - hero_build_sets: up to two
// recommended builds per hero, made of catalogue items and arcana.
export default {
  version: 11,
  name: "catalog",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS game_stats (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(60) NOT NULL,
      unit VARCHAR(8) NOT NULL DEFAULT 'flat',
      sort_order INT NOT NULL DEFAULT 0,
      UNIQUE KEY uq_game_stat_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await connection.query(`CREATE TABLE IF NOT EXISTS tags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(40) NOT NULL,
      color VARCHAR(12) NOT NULL DEFAULT 'gray',
      description VARCHAR(200) NOT NULL DEFAULT '',
      conflicts_json VARCHAR(600) NOT NULL DEFAULT '[]',
      UNIQUE KEY uq_tag_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await connection.query(`CREATE TABLE IF NOT EXISTS entity_tags (
      entity_type VARCHAR(8) NOT NULL,
      entity_id VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL,
      tag_id INT NOT NULL,
      PRIMARY KEY (entity_type, entity_id, tag_id),
      CONSTRAINT fk_entity_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS catalog_images (
      id CHAR(36) PRIMARY KEY,
      mime VARCHAR(30) NOT NULL,
      data MEDIUMBLOB NOT NULL,
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS catalog_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      category VARCHAR(10) NOT NULL,
      price INT NULL,
      image_id CHAR(36) NULL,
      description VARCHAR(600) NOT NULL DEFAULT '',
      effects_json TEXT NOT NULL,
      stats_json TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE KEY uq_catalog_item_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await connection.query(`CREATE TABLE IF NOT EXISTS catalog_arcana (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      color VARCHAR(8) NOT NULL,
      image_id CHAR(36) NULL,
      description VARCHAR(300) NOT NULL DEFAULT '',
      stats_json TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE KEY uq_catalog_arcana_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await connection.query(`CREATE TABLE IF NOT EXISTS hero_profiles (
      hero_id VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,
      base_stats_json TEXT NOT NULL,
      skills_json MEDIUMTEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      CONSTRAINT fk_hero_profile_hero FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS hero_build_sets (
      hero_id VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL,
      variant TINYINT NOT NULL,
      name VARCHAR(60) NOT NULL DEFAULT '',
      build_json TEXT NOT NULL,
      note VARCHAR(300) NOT NULL DEFAULT '',
      source_url VARCHAR(500) NOT NULL DEFAULT '',
      updated_by VARCHAR(36) NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (hero_id, variant),
      CONSTRAINT fk_hero_build_set_hero FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
