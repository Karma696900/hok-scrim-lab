// Discord bot, second step.
//  - event_reminders: which reminder (6, 4 or 2 hours before) has been sent for an event, so each is
//    sent once.
//  - team_discord: the Discord server (guild) where a team added the bot, the channel chosen for the
//    team's notifications and the week of the last digest.
// Additive only.
export default {
  version: 17,
  name: "discord-bot",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS event_reminders (
      event_id VARCHAR(36) NOT NULL,
      hours TINYINT UNSIGNED NOT NULL,
      sent_at BIGINT NOT NULL,
      PRIMARY KEY (event_id, hours),
      CONSTRAINT fk_reminder_event FOREIGN KEY (event_id) REFERENCES team_events(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS team_discord (
      team_id VARCHAR(36) NOT NULL PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      guild_name VARCHAR(100) NOT NULL DEFAULT '',
      channel_id VARCHAR(32) NULL,
      channel_name VARCHAR(100) NOT NULL DEFAULT '',
      added_by VARCHAR(36) NULL,
      last_digest VARCHAR(10) NULL,
      created_at BIGINT NOT NULL,
      CONSTRAINT fk_team_discord_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
