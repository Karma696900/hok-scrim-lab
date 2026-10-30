// Reflex training: the runs a player has finished (the exercises are played in the browser, nothing
// is sent while one runs; the result is kept afterwards) and what a team asks of its players, per day
// or per week. Additive only.
export default {
  version: 23,
  name: "reflex-training",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS reflex_runs (
      id CHAR(36) NOT NULL PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      exercise VARCHAR(20) NOT NULL,
      score INT NOT NULL,
      duration_ms INT NOT NULL,
      created_at BIGINT NOT NULL,
      INDEX idx_reflex_runs_user (user_id, created_at),
      INDEX idx_reflex_runs_exercise (user_id, exercise, created_at),
      CONSTRAINT fk_reflex_runs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS team_training_goals (
      id CHAR(36) NOT NULL PRIMARY KEY,
      team_id VARCHAR(36) NOT NULL,
      period VARCHAR(8) NOT NULL,
      metric VARCHAR(8) NOT NULL,
      amount INT NOT NULL,
      exercise VARCHAR(20) NOT NULL DEFAULT '',
      created_by VARCHAR(36) NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_team_training_goals_team (team_id, created_at),
      CONSTRAINT fk_team_training_goals_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
