import { parse, staffList, notify } from "./store-helpers.js";

/** Notifications of a person and the counters shown in the top bar. */
export function createNotificationsStore({ pool }) {
  return {
    // ---- notifications --------------------------------------------------------------------------
    async notify(userIds, kind, payload) {
      return notify(pool, userIds, kind, payload);
    },

    async listNotifications(userId, limit = 50) {
      const [rows] = await pool.query(
        "SELECT id, kind, payload_json, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id LIMIT ?",
        [userId, limit]
      );
      return rows.map(row => ({
        id: row.id,
        kind: row.kind,
        payload: parse(row.payload_json, {}),
        at: Number(row.created_at),
        read: row.read_at !== null
      }));
    },

    async markNotificationsRead(userId, ids = null) {
      if (ids && !ids.length) {
        return;
      }
      if (ids) {
        await pool.query(
          "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (?)",
          [Date.now(), userId, ids]
        );
      } else {
        await pool.execute(
          "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL",
          [Date.now(), userId]
        );
      }
    },

    /** The numbers behind the badges of the menu. */
    async communitySummary(userId, now = Date.now()) {
      const [[{ unread }]] = await pool.query(
        "SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL",
        [userId]
      );
      const [[{ waiting }]] = await pool.query(
        `SELECT COUNT(*) AS waiting FROM scrim_requests r WHERE r.status IN ('pending', 'countered') AND r.awaiting_team_id IN (SELECT team_id FROM team_members WHERE user_id = ? AND role IN (${staffList}))`,
        [userId]
      );
      const [[{ posts }]] = await pool.query(
        "SELECT COUNT(*) AS posts FROM scrim_posts WHERE closed = 0 AND ends_at > ?",
        [now]
      );
      return {
        unreadNotifications: Number(unread),
        awaitingRequests: Number(waiting),
        openPosts: Number(posts)
      };
    }
  };
}
