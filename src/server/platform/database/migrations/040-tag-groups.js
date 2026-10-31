// The name of the group that each colour of tag stands for ("Damage" for the red tags, "Crowd control"
// for the orange ones…): the tags are sorted by colour, and an administrator names the colours. A colour
// without a row has no name yet.
export default {
  version: 40,
  name: "tag-groups",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS tag_groups (
      color VARCHAR(12) NOT NULL PRIMARY KEY,
      name VARCHAR(40) NOT NULL DEFAULT ''
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
};
