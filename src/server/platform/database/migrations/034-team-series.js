// The series a team shares with its members: the owner of a series who leads a team (owner, manager or
// coach) puts the series on the team, and every member of the team can then read it (in the application and
// through their API keys). Taking it off the team ends the access. Additive only.
export default {
  version: 34,
  name: "team-series",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS team_series (
      team_id VARCHAR(36) NOT NULL,
      series_id VARCHAR(36) NOT NULL,
      shared_by VARCHAR(36) NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (team_id, series_id),
      INDEX idx_team_series_series (series_id),
      CONSTRAINT fk_team_series_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      CONSTRAINT fk_team_series_series FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
      CONSTRAINT fk_team_series_user FOREIGN KEY (shared_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
