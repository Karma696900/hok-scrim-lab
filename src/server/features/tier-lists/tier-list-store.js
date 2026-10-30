import { conflict, forbidden, notFound } from "../../platform/errors.js";
import { nextTimestamp } from "../../platform/database/store.js";

/**
 * Database access for tier lists (each one is a document; the lane is copied out so that lists can
 * be filtered in SQL).
 */
/**
 * The tier lists a person can see (two `?`: the viewer twice): the ones they own plus the ones shared
 * with them, as two index lookups joined by UNION. An `OR` across the members table reads every list of
 * the site (see the same note in series/series-store.js).
 */
const VISIBLE_IDS = `(SELECT id FROM tier_lists WHERE owner_user_id = ? UNION
  SELECT tier_list_id AS id FROM tier_list_members WHERE user_id = ?) v`;

export function createTierListStore({ pool, inTransaction }) {
  return {
    /** `lane`: undefined = any, null = All Roles, string = that lane. `search` matches the name. */
    async listTierLists(viewerId, { limit = 50, offset = 0, lane, search } = {}) {
      if (!viewerId) {
        return { items: [], total: 0 };
      }
      let visible = "TRUE";
      const filters = [];
      if (lane === null) {
        visible += " AND t.lane IS NULL";
      } else if (lane !== undefined) {
        visible += " AND t.lane = ?";
        filters.push(lane);
      }
      if (search) {
        visible +=
          " AND CONVERT(JSON_UNQUOTE(JSON_EXTRACT(t.data_json, '$.name')) USING utf8mb4) COLLATE utf8mb4_0900_ai_ci LIKE ?";
        filters.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
      }
      const [rows] = await pool.query(
        `SELECT t.data_json, t.version, t.owner_user_id, m.role AS member_role FROM ${VISIBLE_IDS}
        JOIN tier_lists t ON t.id = v.id
        LEFT JOIN tier_list_members m ON m.tier_list_id = t.id AND m.user_id = ? WHERE ${visible} ORDER BY t.updated_at DESC, t.id LIMIT ? OFFSET ?`,
        [viewerId, viewerId, viewerId, ...filters, limit, offset]
      );
      const [[count]] = await pool.query(
        `SELECT COUNT(*) AS total FROM ${VISIBLE_IDS} JOIN tier_lists t ON t.id = v.id WHERE ${visible}`,
        [viewerId, viewerId, ...filters]
      );
      return {
        items: rows.map(row => ({
          tierList: JSON.parse(row.data_json),
          version: row.version,
          role: row.owner_user_id === viewerId ? "owner" : row.member_role
        })),
        total: Number(count.total)
      };
    },
    async getTierList(id, viewerId) {
      if (!viewerId) {
        return null;
      }
      const [rows] = await pool.query(
        `SELECT t.data_json, t.version, t.owner_user_id, m.role AS member_role FROM tier_lists t
        LEFT JOIN tier_list_members m ON m.tier_list_id = t.id AND m.user_id = ? WHERE t.id = ? AND (t.owner_user_id = ? OR m.user_id IS NOT NULL)`,
        [viewerId, id, viewerId]
      );
      const row = rows[0];
      return row
        ? {
            tierList: JSON.parse(row.data_json),
            version: row.version,
            role: row.owner_user_id === viewerId ? "owner" : row.member_role
          }
        : null;
    },
    async createTierList(tierList, ownerId) {
      await pool.execute(
        "INSERT INTO tier_lists (id, data_json, updated_at, owner_user_id, version, lane) VALUES (?, ?, ?, ?, 0, ?)",
        [tierList.id, JSON.stringify(tierList), tierList.updatedAt, ownerId, tierList.lane ?? null]
      );
    },
    /**
     * Optimistic update: `expectedVersion` must match unless it is null (then the row lock alone
     * serialises writers).
     */
    async updateTierList(id, viewerId, expectedVersion, work) {
      if (!viewerId) {
        throw notFound("Tier list not found.");
      }
      return inTransaction(async connection => {
        const [rows] = await connection.query(
          `SELECT t.data_json, t.version, t.owner_user_id, m.role AS member_role FROM tier_lists t
          LEFT JOIN tier_list_members m ON m.tier_list_id = t.id AND m.user_id = ?
          WHERE t.id = ? AND (t.owner_user_id = ? OR m.user_id IS NOT NULL) FOR UPDATE OF t`,
          [viewerId, id, viewerId]
        );
        const row = rows[0];
        if (!row) {
          throw notFound("Tier list not found.");
        }
        const role = row.owner_user_id === viewerId ? "owner" : row.member_role;
        if (role === "viewer") {
          throw forbidden("You can only view this tier list.");
        }
        if (expectedVersion !== null && expectedVersion !== row.version) {
          throw conflict(
            "This tier list changed since you opened it. Reload and retry.",
            "version_conflict"
          );
        }
        const next = await work(JSON.parse(row.data_json), role);
        next.id = id;
        next.updatedAt = nextTimestamp(next.updatedAt || new Date(0).toISOString());
        await connection.execute(
          "UPDATE tier_lists SET data_json = ?, updated_at = ?, version = version + 1 WHERE id = ?",
          [JSON.stringify(next), next.updatedAt, id]
        );
        return { tierList: next, version: row.version + 1, role };
      });
    },
    async deleteTierList(id, ownerId) {
      const [result] = await pool.execute(
        "DELETE FROM tier_lists WHERE id = ? AND owner_user_id = ?",
        [id, ownerId]
      );
      return result.affectedRows > 0;
    }
  };
}
