// Training: a player's own focus heroes and notebook (goals, mechanics, combos), the maps
// administrators upload, the situations they prepare on those maps (pins stored as one validated
// JSON document) and each player's answer to a situation. Additive only: nothing existing is
// touched.
export default {
  version: 18,
  name: "training",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS training_focus (
      user_id VARCHAR(36) NOT NULL,
      hero_id VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL,
      position INT NOT NULL DEFAULT 0,
      added_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, hero_id),
      CONSTRAINT fk_focus_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await connection.query(`CREATE TABLE IF NOT EXISTS training_notes (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      kind VARCHAR(10) NOT NULL,
      hero_id VARCHAR(80) COLLATE utf8mb4_unicode_ci NULL,
      title VARCHAR(100) NOT NULL,
      body VARCHAR(2000) NOT NULL DEFAULT '',
      status VARCHAR(12) NOT NULL DEFAULT 'todo',
      steps_json TEXT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_training_notes_user (user_id, kind, updated_at),
      CONSTRAINT fk_training_note_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await connection.query(`CREATE TABLE IF NOT EXISTS training_maps (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      mime VARCHAR(40) NOT NULL,
      data MEDIUMBLOB NOT NULL,
      width INT NOT NULL,
      height INT NOT NULL,
      created_by VARCHAR(36) NOT NULL,
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await connection.query(`CREATE TABLE IF NOT EXISTS training_scenarios (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      map_id VARCHAR(36) NOT NULL,
      title VARCHAR(80) NOT NULL,
      brief VARCHAR(1000) NOT NULL DEFAULT '',
      pins_json MEDIUMTEXT NOT NULL,
      published TINYINT(1) NOT NULL DEFAULT 0,
      created_by VARCHAR(36) NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_training_scenarios_list (published, updated_at),
      CONSTRAINT fk_scenario_map FOREIGN KEY (map_id) REFERENCES training_maps(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await connection.query(`CREATE TABLE IF NOT EXISTS training_attempts (
      user_id VARCHAR(36) NOT NULL,
      scenario_id VARCHAR(36) NOT NULL,
      answer VARCHAR(2000) NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, scenario_id),
      CONSTRAINT fk_attempt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_attempt_scenario FOREIGN KEY (scenario_id) REFERENCES training_scenarios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
