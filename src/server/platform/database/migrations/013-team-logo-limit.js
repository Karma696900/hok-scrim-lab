import { addColumnIfMissing } from "./helpers.js";

// Teams, second step: a member limit chosen by the team (7 to 20, 20 for the teams that already
// exist) and a logo. - teams.max_members: how many members and pending invitations the team
// accepts. - teams.logo_version: 0 without a logo, otherwise the time the logo was last changed (it
// is part of the picture URL, so it is cached for ever). - team_logos: the processed picture
// (square WebP, small), one per team. Additive only.
export default {
  version: 13,
  name: "team-logo-limit",
  async up(connection) {
    await addColumnIfMissing(
      connection,
      "teams",
      "max_members",
      "TINYINT UNSIGNED NOT NULL DEFAULT 20"
    );
    await addColumnIfMissing(connection, "teams", "logo_version", "BIGINT NOT NULL DEFAULT 0");
    await connection.query(`CREATE TABLE IF NOT EXISTS team_logos (
      team_id VARCHAR(36) NOT NULL PRIMARY KEY,
      mime VARCHAR(30) NOT NULL,
      data MEDIUMBLOB NOT NULL,
      updated_at BIGINT NOT NULL,
      CONSTRAINT fk_logo_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
