async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
    [table, column]
  );
  return rows.length > 0;
}

async function indexExists(connection, table, index) {
  const [rows] = await connection.query(
    "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?",
    [table, index]
  );
  return rows.length > 0;
}

export async function addColumnIfMissing(connection, table, column, definition) {
  if (!(await columnExists(connection, table, column))) {
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

export async function addIndexIfMissing(connection, table, index, definition) {
  if (!(await indexExists(connection, table, index))) {
    await connection.query(`ALTER TABLE \`${table}\` ADD ${definition}`);
  }
}
