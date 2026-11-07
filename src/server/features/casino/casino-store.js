// The roulettes in the database (spec 2026-11-07 casino): one row each, the state as JSON, changed only from the
// version that was read, and purged 7 days after the last change.
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

const rowToRoll = row => ({
  id: row.id,
  keyHash: row.key_hash,
  version: Number(row.version),
  state: JSON.parse(row.state_json),
  updatedAt: Number(row.updated_at)
});

export function createCasinoStore({ pool }) {
  return {
    /** Saves a new roulette at version 0. */
    async createCasino({ id, keyHash, state }, now = Date.now()) {
      await pool.execute(
        "INSERT INTO casino_rolls (id, key_hash, version, state_json, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)",
        [id, keyHash, JSON.stringify(state), now, now]
      );
    },

    /** The roulette `id`, or null. */
    async readCasino(id) {
      const [rows] = await pool.execute(
        "SELECT id, key_hash, version, state_json, updated_at FROM casino_rolls WHERE id = ?",
        [id]
      );
      return rows.length ? rowToRoll(rows[0]) : null;
    },

    /** Writes `state` as the next version when the roulette is still at `version`; false when it moved since. */
    async updateCasino(id, version, state, now = Date.now()) {
      const [result] = await pool.execute(
        "UPDATE casino_rolls SET state_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
        [JSON.stringify(state), now, id, version]
      );
      return result.affectedRows === 1;
    },

    /** Deletes the roulettes untouched for 7 days; returns how many. */
    async purgeCasinos(now = Date.now()) {
      const [result] = await pool.execute("DELETE FROM casino_rolls WHERE updated_at < ?", [
        now - KEEP_MS
      ]);
      return result.affectedRows;
    }
  };
}
