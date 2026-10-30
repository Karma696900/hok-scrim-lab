// Site rank labels that an administrator gives to a person (verified, moderator, organiser,
// contributor), shown on their player page and in team rosters. They are chosen by hand; nothing is
// computed or inferred. Additive only.
export default {
  version: 16,
  name: "user-labels",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS user_labels (
      user_id VARCHAR(36) NOT NULL,
      label VARCHAR(12) NOT NULL,
      given_by VARCHAR(36) NULL,
      given_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, label),
      CONSTRAINT fk_label_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
