// The messages people send from the contact page: kept until they are answered and deleted at the latest after twelve
// months (features/contact/store.js), which is what the privacy policy says. Additive only.
export default {
  version: 36,
  name: "contact-messages",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS contact_messages (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(254) NOT NULL,
      subject VARCHAR(120) NOT NULL,
      message TEXT NOT NULL,
      language VARCHAR(8) NOT NULL DEFAULT 'en',
      user_id VARCHAR(36) NULL,
      created_at BIGINT NOT NULL,
      handled_at BIGINT NULL,
      INDEX idx_contact_messages_created (created_at),
      CONSTRAINT fk_contact_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
