// The official ratings of the heroes: one tier list per lane, written by the editors (administrators
// and Contributors) and never shown as a list to anybody else. The hero page shows, next to each
// lane of a hero, the tier it holds in the list of that lane (SS to D). The tiers and the heroes are
// the document; the version lets two editors notice that they overwrite each other. Additive only.
export default {
  version: 21,
  name: "official-ratings",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS official_tier_lists (
      lane VARCHAR(20) NOT NULL PRIMARY KEY,
      data_json MEDIUMTEXT NOT NULL,
      version INT NOT NULL DEFAULT 0,
      updated_by VARCHAR(36) NULL,
      updated_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
