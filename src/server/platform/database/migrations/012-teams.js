// Community, first slice: teams, their roster (with staff roles) and the invitations that put
// somebody in a roster. - teams: a name and a short tag (both unique, compared without case),
// profile fields the owner fills in by hand. - team_members: one row per person and team, with the
// role (owner, manager, coach, captain, analyst, player, sub) and, for players, a lane. -
// team_invitations: nobody is added to a roster without answering: an invitation is pending until
// the invited account accepts or declines. Additive only.
export default {
  version: 12,
  name: "teams",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS teams (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      name VARCHAR(40) NOT NULL,
      name_key VARCHAR(160) NOT NULL,
      tag VARCHAR(6) NOT NULL,
      description VARCHAR(600) NOT NULL DEFAULT '',
      region VARCHAR(8) NOT NULL DEFAULT '',
      timezone VARCHAR(10) NOT NULL DEFAULT '',
      languages_json TEXT NOT NULL,
      level VARCHAR(12) NOT NULL DEFAULT 'casual',
      created_by VARCHAR(36) NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE INDEX uq_teams_name (name_key),
      UNIQUE INDEX uq_teams_tag (tag),
      CONSTRAINT fk_team_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS team_members (
      team_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      role VARCHAR(10) NOT NULL,
      lane VARCHAR(20) NOT NULL DEFAULT '',
      joined_at BIGINT NOT NULL,
      PRIMARY KEY (team_id, user_id),
      INDEX idx_team_members_user (user_id),
      CONSTRAINT fk_member_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      CONSTRAINT fk_member_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS team_invitations (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      team_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      invited_by VARCHAR(36) NOT NULL,
      role VARCHAR(10) NOT NULL,
      lane VARCHAR(20) NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL,
      UNIQUE INDEX uq_team_invitation (team_id, user_id),
      INDEX idx_team_invitation_user (user_id),
      CONSTRAINT fk_invite_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      CONSTRAINT fk_invite_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_invite_by FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
