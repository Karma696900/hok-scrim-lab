// The texts the staff writes (names of stats and items, descriptions, notes, titles…) are kept as they
// were typed; each is also kept translated into every language of the site, so a visitor reads it in
// their own language. content_texts holds each text once (keyed by its hash, the same text being the
// same row wherever it is used), content_translations one row per text and language: what the
// translation is, whether it is done, failed or still waited for, and who wrote it (a provider, an
// administrator, or the text itself for the language it is written in). translation_usage counts
// what was sent to the provider each day, against the limit of the owner. Additive only.
export default {
  version: 27,
  name: "content-translations",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS content_texts (
      hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      text TEXT NOT NULL,
      kind VARCHAR(24) NOT NULL DEFAULT 'text',
      source_language VARCHAR(8) CHARACTER SET ascii NULL,
      seen_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await connection.query(`CREATE TABLE IF NOT EXISTS content_translations (
      hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      language VARCHAR(8) CHARACTER SET ascii NOT NULL,
      text TEXT NULL,
      status VARCHAR(8) CHARACTER SET ascii NOT NULL DEFAULT 'pending',
      origin VARCHAR(8) CHARACTER SET ascii NOT NULL DEFAULT 'machine',
      attempts INT NOT NULL DEFAULT 0,
      error VARCHAR(160) NULL,
      retry_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (hash, language),
      INDEX idx_content_translations_work (status, retry_at),
      INDEX idx_content_translations_language (language, status),
      CONSTRAINT fk_content_translations_text FOREIGN KEY (hash) REFERENCES content_texts(hash) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await connection.query(`CREATE TABLE IF NOT EXISTS translation_usage (
      day CHAR(10) CHARACTER SET ascii NOT NULL PRIMARY KEY,
      chars BIGINT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
