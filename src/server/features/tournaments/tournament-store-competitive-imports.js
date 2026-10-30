// tournament store, competitive imports: createCompetitiveImport, listCompetitiveImports, deleteCompetitiveImport, getHeroCompetitive.
import { randomUUID } from "node:crypto";

// ---- competitive imports (aggregate numbers published by others, Global only) ---------------
export async function createCompetitiveImport(ctx, data, adminId) {
  const id = randomUUID();
  await ctx.inTransaction(async connection => {
    await connection.execute(
      `INSERT INTO competitive_imports (id, source, source_url, region, patch, source_updated_at, license, attribution, total_games, row_count, imported_by, imported_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.source,
        data.sourceUrl,
        data.region,
        data.patch,
        data.updatedAt,
        data.license,
        data.attribution,
        data.totalGames,
        data.rows.length,
        adminId,
        new Date().toISOString()
      ]
    );
    await connection.query(
      "INSERT INTO competitive_hero_stats (import_id, hero_id, picks, bans, wins) VALUES ?",
      [data.rows.map(row => [id, row.heroId, row.picks, row.bans, row.wins])]
    );
  });
  return { id, rows: data.rows.length };
}

export async function listCompetitiveImports(ctx) {
  const [rows] = await ctx.pool.query(
    "SELECT * FROM competitive_imports ORDER BY imported_at DESC LIMIT 200"
  );
  return rows.map(competitiveImportFromRow);
}

export async function deleteCompetitiveImport(ctx, id) {
  const [result] = await ctx.pool.execute("DELETE FROM competitive_imports WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

export async function getHeroCompetitive(ctx, heroId) {
  const [rows] = await ctx.pool.query(
    `SELECT i.*, s.picks, s.bans, s.wins FROM competitive_hero_stats s
          JOIN competitive_imports i ON i.id = s.import_id WHERE s.hero_id = ? ORDER BY i.imported_at DESC LIMIT 10`,
    [heroId]
  );
  return rows.map(row => ({
    ...competitiveImportFromRow(row),
    picks: row.picks,
    bans: row.bans,
    wins: row.wins
  }));
}

/**
 * Database access for the tournaments page (real games entered by an administrator) and for the
 * hero builds.
 */
function competitiveImportFromRow(row) {
  return {
    id: row.id,
    source: row.source,
    sourceUrl: row.source_url,
    region: row.region,
    patch: row.patch,
    updatedAt: row.source_updated_at,
    license: row.license,
    attribution: row.attribution,
    totalGames: row.total_games,
    rowCount: row.row_count,
    importedAt: row.imported_at
  };
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  createCompetitiveImport,
  listCompetitiveImports,
  deleteCompetitiveImport,
  getHeroCompetitive
};
