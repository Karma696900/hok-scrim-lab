import { addColumnIfMissing } from "./helpers.js";

// Onboarding and settings: which optional parts of the site a person wants in their menu, whether
// they went through the welcome pages, and their settings (defaults for a new series, start page,
// reduced motion). The community is not optional and is not stored. Additive only.
export default {
  version: 19,
  name: "preferences",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS user_preferences (
      user_id VARCHAR(36) NOT NULL PRIMARY KEY,
      modules_json VARCHAR(200) NOT NULL,
      onboarded_at BIGINT NULL,
      updated_at BIGINT NOT NULL,
      CONSTRAINT fk_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await addColumnIfMissing(
      connection,
      "user_preferences",
      "settings_json",
      "VARCHAR(400) NOT NULL DEFAULT '{}'"
    );
  }
};
