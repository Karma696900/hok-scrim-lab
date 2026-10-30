// The first table of recommended builds (010), replaced by hero_build_sets: no code reads or writes it any more.
// It goes only when it is empty, so that this migration can never take data away; a table that still holds rows
// stays, and says so in the log of the start-up.
export default {
  version: 39,
  name: "drop-hero-builds",
  async up(connection) {
    const [tables] = await connection.query(
      "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hero_builds'"
    );
    if (Number(tables[0].n) === 0) {
      return;
    }
    const [rows] = await connection.query("SELECT COUNT(*) AS n FROM hero_builds");
    if (Number(rows[0].n) === 0) {
      await connection.query("DROP TABLE hero_builds");
    }
  }
};
