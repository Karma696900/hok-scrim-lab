// Community, third step: the agenda of a team.
//  - team_events: one row per event. Times are stored as UTC milliseconds; every person sees them in
//    their own time zone.
//  - kind 'availability' is a window in which the team is free for a scrim and is the only kind a
//    stranger can see (public); scrims, tournament matches, practice, VOD reviews and meetings stay
//    inside the team.
// Additive only.
export default {
  version: 14,
  name: "team-events",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS team_events (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      team_id VARCHAR(36) NOT NULL,
      kind VARCHAR(14) NOT NULL,
      title VARCHAR(80) NOT NULL,
      starts_at BIGINT NOT NULL,
      ends_at BIGINT NOT NULL,
      note VARCHAR(400) NOT NULL DEFAULT '',
      created_by VARCHAR(36) NOT NULL,
      created_at BIGINT NOT NULL,
      INDEX idx_team_events_time (team_id, starts_at),
      CONSTRAINT fk_event_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      CONSTRAINT fk_event_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
