import { addColumnIfMissing, addIndexIfMissing } from "./helpers.js";

// Real accounts (email + password) with mandatory multi-factor authentication.
//  - users: password hash, normalised login email (unique, local accounts only), verified-email
//    flag, TOTP seed (encrypted by the application), anti-replay step, failed-login counter and
//    lock.
//  - mfa_recovery_codes: single-use codes, stored as hashes.
//  - auth_challenges: the short-lived state between "password OK" and "second factor OK" (and
//    first-time enrolment).
//  - auth_events: security journal (no secrets).
// Existing Google accounts keep their data; their sessions are revoked so that the next sign-in
// goes through MFA.
export default {
  version: 7,
  name: "accounts-mfa",
  async up(connection) {
    await addColumnIfMissing(connection, "users", "login_email", "VARCHAR(320) NULL");
    await addColumnIfMissing(connection, "users", "password_hash", "VARCHAR(400) NULL");
    await addColumnIfMissing(
      connection,
      "users",
      "email_verified",
      "BOOLEAN NOT NULL DEFAULT FALSE"
    );
    await addColumnIfMissing(connection, "users", "mfa_enabled", "BOOLEAN NOT NULL DEFAULT FALSE");
    await addColumnIfMissing(connection, "users", "mfa_secret_enc", "VARCHAR(400) NULL");
    await addColumnIfMissing(connection, "users", "mfa_last_step", "BIGINT NULL");
    await addColumnIfMissing(connection, "users", "failed_logins", "INT NOT NULL DEFAULT 0");
    await addColumnIfMissing(connection, "users", "locked_until", "BIGINT NOT NULL DEFAULT 0");
    await addColumnIfMissing(connection, "users", "password_changed_at", "VARCHAR(40) NULL");
    await addIndexIfMissing(
      connection,
      "users",
      "uq_users_login_email",
      "UNIQUE INDEX uq_users_login_email (login_email)"
    );

    await connection.query(
      "UPDATE users SET email_verified = TRUE WHERE google_subject IS NOT NULL AND is_guest = FALSE"
    );
    // Everybody who is not a guest signs in again, through the new flow.
    await connection.query(
      "DELETE sessions FROM sessions JOIN users ON users.id = sessions.user_id WHERE users.is_guest = FALSE"
    );

    await connection.query(`CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
      user_id VARCHAR(36) NOT NULL,
      code_hash CHAR(64) NOT NULL,
      used_at BIGINT NULL,
      PRIMARY KEY (user_id, code_hash),
      CONSTRAINT fk_recovery_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await connection.query(`CREATE TABLE IF NOT EXISTS auth_challenges (
      token_hash CHAR(64) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      kind VARCHAR(10) NOT NULL,
      method VARCHAR(10) NOT NULL,
      pending_secret_enc VARCHAR(400) NULL,
      attempts INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      INDEX idx_challenges_expiry (expires_at),
      INDEX idx_challenges_user (user_id),
      CONSTRAINT fk_challenge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await connection.query(`CREATE TABLE IF NOT EXISTS auth_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NULL,
      event VARCHAR(40) NOT NULL,
      detail VARCHAR(200) NOT NULL DEFAULT '',
      ip VARCHAR(45) NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL,
      INDEX idx_auth_events_user (user_id, created_at),
      INDEX idx_auth_events_time (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
