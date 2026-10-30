import { conflict } from "../../platform/errors.js";
import { DEFAULT_DISCORD_PREFS } from "./community-domain.js";
import { parse } from "./store-helpers.js";

/** The link between an account and a Discord account, and what the person asked to receive there. */
export function createDiscordLinkStore({ pool, inTransaction }) {
  return {
    async userOfDiscord(discordId) {
      const [[row]] = await pool.query("SELECT user_id FROM user_discord WHERE discord_id = ?", [
        discordId
      ]);
      return row?.user_id ?? null;
    },

    // ---- Discord --------------------------------------------------------------------------------
    async getDiscord(userId) {
      const [[row]] = await pool.query(
        "SELECT discord_id, username, avatar_hash, linked_at, prefs_json FROM user_discord WHERE user_id = ?",
        [userId]
      );
      return row
        ? {
            discordId: row.discord_id,
            username: row.username,
            avatarHash: row.avatar_hash,
            linkedAt: Number(row.linked_at),
            prefs: { ...DEFAULT_DISCORD_PREFS, ...parse(row.prefs_json, {}) }
          }
        : null;
    },

    async linkDiscord(userId, { discordId, username, avatarHash }) {
      await inTransaction(async connection => {
        const [[owner]] = await connection.query(
          "SELECT user_id FROM user_discord WHERE discord_id = ? FOR UPDATE",
          [discordId]
        );
        if (owner && owner.user_id !== userId) {
          throw conflict(
            "This Discord account is already linked to another account.",
            "discord_taken"
          );
        }
        const [[mine]] = await connection.query(
          "SELECT user_id FROM user_discord WHERE user_id = ? FOR UPDATE",
          [userId]
        );
        if (mine) {
          await connection.execute(
            "UPDATE user_discord SET discord_id = ?, username = ?, avatar_hash = ? WHERE user_id = ?",
            [discordId, username, avatarHash || "", userId]
          );
        } else {
          await connection.execute(
            "INSERT INTO user_discord (user_id, discord_id, username, avatar_hash, linked_at, prefs_json) VALUES (?, ?, ?, ?, ?, ?)",
            [
              userId,
              discordId,
              username,
              avatarHash || "",
              Date.now(),
              JSON.stringify(DEFAULT_DISCORD_PREFS)
            ]
          );
        }
      });
    },

    async unlinkDiscord(userId) {
      await pool.execute("DELETE FROM user_discord WHERE user_id = ?", [userId]);
    },

    async saveDiscordPrefs(userId, prefs) {
      const [result] = await pool.execute(
        "UPDATE user_discord SET prefs_json = ? WHERE user_id = ?",
        [JSON.stringify(prefs), userId]
      );
      return result.affectedRows > 0;
    },

    async discordTargets(userIds) {
      if (!userIds.length) {
        return new Map();
      }
      const [rows] = await pool.query(
        "SELECT user_id, discord_id, prefs_json FROM user_discord WHERE user_id IN (?)",
        [userIds]
      );
      return new Map(
        rows.map(row => [
          row.user_id,
          {
            discordId: row.discord_id,
            prefs: { ...DEFAULT_DISCORD_PREFS, ...parse(row.prefs_json, {}) }
          }
        ])
      );
    }
  };
}
