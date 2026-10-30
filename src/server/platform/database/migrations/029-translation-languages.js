// A language is translated once somebody asks for it: the first visitor who reads the site in Thai
// makes Thai a language to translate, an administrator can ask for all of them. Until then nothing is
// sent for it, which is most of what a metered service would be paid for. translation_languages lists
// the languages that are asked for (rows of the other languages stay as they are and are not worked).
// content_texts.kept remembers that an administrator wants a text left as typed in every language, so
// a language that is asked for later is not translated for that text either. Additive only.
import { addColumnIfMissing } from "./helpers.js";

export default {
  version: 29,
  name: "translation-languages",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS translation_languages (
      language VARCHAR(8) CHARACTER SET ascii NOT NULL PRIMARY KEY,
      first_wanted_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await addColumnIfMissing(connection, "content_texts", "kept", "TINYINT(1) NOT NULL DEFAULT 0");
    // a text that an administrator already put as typed (a manual row equal to the text) is kept
    await connection.query(
      `UPDATE content_texts t SET kept = 1 WHERE EXISTS (
         SELECT 1 FROM content_translations c
         WHERE c.hash = t.hash AND c.status = 'ok' AND c.origin = 'manual' AND c.text = t.text)`
    );
  }
};
