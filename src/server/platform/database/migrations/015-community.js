import { addColumnIfMissing } from "./helpers.js";

// Community, fourth step: finding a scrim, asking for one, talking about it, being told, and the
// people behind the teams.
//  - team_events.reminded_at: set once the "starts within the hour" reminder has been sent.
//  - event_rsvps: going / maybe / no, one per person and event.
//  - scrim_posts: an open "looking for a scrim" announcement of a team (a time window, a format, a
//    hero rule, a control mode).
//  - scrim_requests: a team asks another team for a scrim at a given time; awaiting_team_id says
//    whose turn it is to answer (a counter-proposal passes the turn). request_messages is the
//    conversation (and the log of accept / decline / counter / cancel).
//  - notifications: what the site tells a person (a request, an answer, a message, an invitation, a
//    reminder).
//  - team_blocks: a team that does not want requests from another team. reports: what a person
//    reports to the administrators.
//  - user_profiles: the optional public profile of a player (bio, lane, time zone, languages, up to
//    three main heroes, chosen by the player).
//  - user_discord: the linked Discord account (its id, name and avatar) and which notifications the
//    person wants as a Discord message.
// Additive only.
export default {
  version: 15,
  name: "community",
  async up(connection) {
    await addColumnIfMissing(connection, "team_events", "reminded_at", "BIGINT NULL");
    await connection.query(`CREATE TABLE IF NOT EXISTS event_rsvps (
      event_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      answer VARCHAR(5) NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (event_id, user_id),
      CONSTRAINT fk_rsvp_event FOREIGN KEY (event_id) REFERENCES team_events(id) ON DELETE CASCADE,
      CONSTRAINT fk_rsvp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS scrim_posts (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      team_id VARCHAR(36) NOT NULL,
      created_by VARCHAR(36) NOT NULL,
      starts_at BIGINT NOT NULL,
      ends_at BIGINT NOT NULL,
      format TINYINT UNSIGNED NOT NULL,
      hero_rule VARCHAR(20) NOT NULL,
      control VARCHAR(10) NOT NULL,
      note VARCHAR(200) NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL,
      closed TINYINT(1) NOT NULL DEFAULT 0,
      INDEX idx_scrim_posts_open (closed, ends_at),
      INDEX idx_scrim_posts_team (team_id),
      CONSTRAINT fk_post_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      CONSTRAINT fk_post_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS scrim_requests (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      from_team_id VARCHAR(36) NOT NULL,
      to_team_id VARCHAR(36) NOT NULL,
      post_id VARCHAR(36) NULL,
      created_by VARCHAR(36) NOT NULL,
      starts_at BIGINT NOT NULL,
      ends_at BIGINT NOT NULL,
      format TINYINT UNSIGNED NOT NULL,
      hero_rule VARCHAR(20) NOT NULL,
      control VARCHAR(10) NOT NULL,
      note VARCHAR(400) NOT NULL DEFAULT '',
      status VARCHAR(10) NOT NULL,
      awaiting_team_id VARCHAR(36) NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_requests_from (from_team_id, updated_at),
      INDEX idx_requests_to (to_team_id, updated_at),
      CONSTRAINT fk_request_from FOREIGN KEY (from_team_id) REFERENCES teams(id) ON DELETE CASCADE,
      CONSTRAINT fk_request_to FOREIGN KEY (to_team_id) REFERENCES teams(id) ON DELETE CASCADE,
      CONSTRAINT fk_request_post FOREIGN KEY (post_id) REFERENCES scrim_posts(id) ON DELETE SET NULL,
      CONSTRAINT fk_request_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS request_messages (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      request_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      team_id VARCHAR(36) NOT NULL,
      kind VARCHAR(10) NOT NULL DEFAULT 'text',
      body VARCHAR(600) NOT NULL,
      created_at BIGINT NOT NULL,
      INDEX idx_request_messages (request_id, created_at),
      CONSTRAINT fk_message_request FOREIGN KEY (request_id) REFERENCES scrim_requests(id) ON DELETE CASCADE,
      CONSTRAINT fk_message_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      kind VARCHAR(20) NOT NULL,
      payload_json TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      read_at BIGINT NULL,
      INDEX idx_notifications_user (user_id, read_at, created_at),
      CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS team_blocks (
      team_id VARCHAR(36) NOT NULL,
      blocked_team_id VARCHAR(36) NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (team_id, blocked_team_id),
      CONSTRAINT fk_block_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      CONSTRAINT fk_block_blocked FOREIGN KEY (blocked_team_id) REFERENCES teams(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS reports (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      reporter_id VARCHAR(36) NOT NULL,
      request_id VARCHAR(36) NULL,
      reason VARCHAR(400) NOT NULL,
      created_at BIGINT NOT NULL,
      CONSTRAINT fk_report_user FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS user_profiles (
      user_id VARCHAR(36) NOT NULL PRIMARY KEY,
      bio VARCHAR(300) NOT NULL DEFAULT '',
      lane VARCHAR(20) NOT NULL DEFAULT '',
      timezone VARCHAR(10) NOT NULL DEFAULT '',
      languages_json TEXT NOT NULL,
      main_heroes_json TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query(`CREATE TABLE IF NOT EXISTS user_discord (
      user_id VARCHAR(36) NOT NULL PRIMARY KEY,
      discord_id VARCHAR(32) NOT NULL,
      username VARCHAR(64) NOT NULL,
      avatar_hash VARCHAR(64) NOT NULL DEFAULT '',
      linked_at BIGINT NOT NULL,
      prefs_json TEXT NOT NULL,
      UNIQUE INDEX uq_user_discord_id (discord_id),
      CONSTRAINT fk_discord_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
