// What the training area gained after the reflex exercises. Additive only:
//   - team_training_settings: what the staff of a team decided about the training (the ranking is
//     shown to the players or only to the staff);
//   - team_hero_goals: "acquire the combos of this hero", asked of every player of a team;
//   - combo_reviews: when a combo a player has acquired comes back to be checked (spaced repetition);
//   - training_notes.url / marks_json: a review of a video (a link and the moments worth a look).
import { addColumnIfMissing } from "./helpers.js";

export default {
  version: 25,
  name: "training-extras",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS team_training_settings (
      team_id VARCHAR(36) NOT NULL PRIMARY KEY,
      leaderboard TINYINT(1) NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL,
      CONSTRAINT fk_team_training_settings_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await connection.query(`CREATE TABLE IF NOT EXISTS team_hero_goals (
      id CHAR(36) NOT NULL PRIMARY KEY,
      team_id VARCHAR(36) NOT NULL,
      hero_id VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL,
      form VARCHAR(16) NOT NULL,
      created_by VARCHAR(36) NULL,
      created_at BIGINT NOT NULL,
      UNIQUE INDEX uq_team_hero_goals (team_id, hero_id, form),
      CONSTRAINT fk_team_hero_goals_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      CONSTRAINT fk_team_hero_goals_hero FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await connection.query(`CREATE TABLE IF NOT EXISTS combo_reviews (
      user_id VARCHAR(36) NOT NULL,
      combo_id CHAR(36) NOT NULL,
      box TINYINT NOT NULL,
      reviewed_at BIGINT NOT NULL,
      due_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, combo_id),
      INDEX idx_combo_reviews_due (user_id, due_at),
      CONSTRAINT fk_combo_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_combo_reviews_combo FOREIGN KEY (combo_id) REFERENCES hero_combos(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // what a player had already acquired joins the schedule: first check a day after it was ticked
    await connection.query(`INSERT IGNORE INTO combo_reviews (user_id, combo_id, box, reviewed_at, due_at)
      SELECT user_id, combo_id, 1, updated_at, updated_at + 86400000 FROM combo_progress
      WHERE normal_done = 1 OR cancel_done = 1`);

    await addColumnIfMissing(connection, "training_notes", "url", "VARCHAR(500) NULL");
    await addColumnIfMissing(connection, "training_notes", "marks_json", "TEXT NULL");
  }
};
