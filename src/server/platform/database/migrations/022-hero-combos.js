// The combos of the heroes: guides written by the editors (administrators and Contributors), as many
// as they want for a hero, in the order they chose. A step is a skill of the hero (its picture is
// read from the hero sheet) with a short hint. combo_progress is what each player has acquired: a
// combo is validated in two forms, as it is and with the animation cancelled. Additive only.
export default {
  version: 22,
  name: "hero-combos",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS hero_combos (
      id CHAR(36) NOT NULL PRIMARY KEY,
      hero_id VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL,
      position INT NOT NULL,
      name VARCHAR(80) NOT NULL,
      note VARCHAR(500) NOT NULL DEFAULT '',
      steps_json TEXT NOT NULL,
      updated_by VARCHAR(36) NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_hero_combos_hero (hero_id, position),
      CONSTRAINT fk_hero_combos_hero FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS combo_progress (
      user_id VARCHAR(36) NOT NULL,
      combo_id CHAR(36) NOT NULL,
      normal_done TINYINT(1) NOT NULL DEFAULT 0,
      cancel_done TINYINT(1) NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, combo_id),
      CONSTRAINT fk_combo_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_combo_progress_combo FOREIGN KEY (combo_id) REFERENCES hero_combos(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
