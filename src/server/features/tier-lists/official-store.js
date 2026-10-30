import { conflict } from "../../platform/errors.js";

/**
 * Database access for the official ratings (one document per lane, see
 * migrations/021-official-ratings.js).
 */
export function createOfficialRatingsStore({ pool, inTransaction }) {
  const parse = value => (typeof value === "string" ? JSON.parse(value) : value);
  return {
    /** Every list that was saved: Map lane → { tiers, unranked, version, updatedAt, updatedBy }. */
    async listOfficialTierLists() {
      const [rows] = await pool.query(
        "SELECT lane, data_json, version, updated_by, updated_at FROM official_tier_lists"
      );
      return new Map(
        rows.map(row => [
          row.lane,
          {
            ...parse(row.data_json),
            version: row.version,
            updatedBy: row.updated_by,
            updatedAt: Number(row.updated_at)
          }
        ])
      );
    },
    /**
     * Saves the list of a lane. `expectedVersion` is the version the editor opened (null for a lane
     * that was never saved): when somebody saved in between, the answer is a conflict.
     */
    async saveOfficialTierList(lane, document, expectedVersion, editorId) {
      return inTransaction(async connection => {
        const [rows] = await connection.query(
          "SELECT version FROM official_tier_lists WHERE lane = ? FOR UPDATE",
          [lane]
        );
        const current = rows[0]?.version ?? null;
        if (current !== expectedVersion) {
          throw conflict(
            "These ratings changed since you opened them. Reload and retry.",
            "version_conflict"
          );
        }
        const version = current === null ? 0 : current + 1;
        const updatedAt = Date.now();
        await connection.execute(
          "INSERT INTO official_tier_lists (lane, data_json, version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE data_json = VALUES(data_json), version = VALUES(version), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)",
          [lane, JSON.stringify(document), version, editorId, updatedAt]
        );
        return { version, updatedAt };
      });
    }
  };
}
