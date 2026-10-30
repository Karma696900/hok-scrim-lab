// The spells a player takes into a match (Flash, Heal...): a catalogue of its own, written by the staff
// like the items and the arcana (name, picture, description, how long they take to come back, from which
// level they can be taken). A build keeps up to two of them (in its JSON, no column): builds written
// before simply have none. Additive only.
export default {
  version: 32,
  name: "summoner-spells",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS catalog_spells (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      image_id CHAR(36) NULL,
      description VARCHAR(600) NOT NULL DEFAULT '',
      cooldown_seconds INT NULL,
      unlock_level TINYINT UNSIGNED NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE KEY uq_catalog_spell_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
};
