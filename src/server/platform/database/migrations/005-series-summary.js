import { addColumnIfMissing, addIndexIfMissing } from "./helpers.js";

// Series list filters (status, mode, team names) and paging run in SQL, so the facts they need are
// mirrored in columns. The JSON blob stays the source of truth: the backfill only READS it, and the
// application keeps the columns in sync on every save.
export default {
  version: 5,
  name: "series-summary",
  async up(connection) {
    await addColumnIfMissing(
      connection,
      "series",
      "status",
      "VARCHAR(12) NOT NULL DEFAULT 'active'"
    );
    await addColumnIfMissing(
      connection,
      "series",
      "team_a_name",
      "VARCHAR(120) NOT NULL DEFAULT ''"
    );
    await addColumnIfMissing(
      connection,
      "series",
      "team_b_name",
      "VARCHAR(120) NOT NULL DEFAULT ''"
    );
    await addColumnIfMissing(connection, "series", "best_of", "INT NOT NULL DEFAULT 1");
    await addColumnIfMissing(
      connection,
      "series",
      "game_mode",
      "VARCHAR(20) NOT NULL DEFAULT 'free-for-all'"
    );
    await addColumnIfMissing(
      connection,
      "series",
      "draft_mode",
      "VARCHAR(12) NOT NULL DEFAULT 'solo'"
    );
    await addColumnIfMissing(connection, "series", "games_count", "INT NOT NULL DEFAULT 0");
    await addIndexIfMissing(
      connection,
      "series",
      "idx_series_owner_status",
      "INDEX idx_series_owner_status (owner_user_id, status, updated_at)"
    );
    await addIndexIfMissing(
      connection,
      "series",
      "idx_series_created",
      "INDEX idx_series_created (created_at)"
    );

    const [rows] = await connection.query("SELECT id, data_json FROM series");
    for (const row of rows) {
      let data;
      try {
        data = JSON.parse(row.data_json);
      } catch {
        continue;
      } // an unreadable blob keeps the defaults
      await connection.execute(
        "UPDATE series SET status = ?, team_a_name = ?, team_b_name = ?, best_of = ?, game_mode = ?, draft_mode = ?, games_count = ? WHERE id = ?",
        [
          String(data.status ?? "active").slice(0, 12),
          String(data.teamA?.name ?? "").slice(0, 120),
          String(data.teamB?.name ?? "").slice(0, 120),
          Number.isInteger(data.bestOf) ? data.bestOf : 1,
          String(data.gameMode ?? "free-for-all").slice(0, 20),
          String(data.draftMode ?? "solo").slice(0, 12),
          Array.isArray(data.games) ? data.games.length : 0,
          row.id
        ]
      );
    }
  }
};
