import { digestWindow } from "./community-domain.js";

/** The Discord server and channel of a team, and the weekly digests that are due. */
export function createTeamDiscordStore({ pool, inTransaction }) {
  return {
    // ---- Discord server of a team ---------------------------------------------------------------
    async getTeamDiscord(teamId) {
      const [[row]] = await pool.query(
        "SELECT guild_id, guild_name, channel_id, channel_name, created_at FROM team_discord WHERE team_id = ?",
        [teamId]
      );
      return row
        ? {
            guildId: row.guild_id,
            guildName: row.guild_name,
            channelId: row.channel_id,
            channelName: row.channel_name,
            createdAt: Number(row.created_at)
          }
        : null;
    },

    /** The bot was added to a server for this team. A different server forgets the previous channel. */
    async saveTeamGuild(teamId, userId, { guildId, guildName }) {
      await pool.execute(
        "INSERT INTO team_discord (team_id, guild_id, guild_name, added_by, created_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE channel_id = IF(guild_id = VALUES(guild_id), channel_id, NULL), channel_name = IF(guild_id = VALUES(guild_id), channel_name, ''), guild_id = VALUES(guild_id), guild_name = VALUES(guild_name), added_by = VALUES(added_by)",
        [teamId, guildId, guildName, userId, Date.now()]
      );
    },

    async setTeamChannel(teamId, channelId, channelName) {
      const [result] = await pool.execute(
        "UPDATE team_discord SET channel_id = ?, channel_name = ? WHERE team_id = ?",
        [channelId, channelName, teamId]
      );
      return result.affectedRows > 0;
    },

    async removeTeamDiscord(teamId) {
      const [result] = await pool.execute("DELETE FROM team_discord WHERE team_id = ?", [teamId]);
      return result.affectedRows > 0;
    },

    /**
     * Teams whose Monday-morning digest is due (08:00 or later in the team's zone, once per
     * Monday), with the events of the coming week.
     */
    async dueDigests(now = Date.now()) {
      return inTransaction(async connection => {
        const [rows] = await connection.query(
          "SELECT d.team_id, d.channel_id, d.last_digest, t.name, t.timezone FROM team_discord d JOIN teams t ON t.id = d.team_id WHERE d.channel_id IS NOT NULL FOR UPDATE"
        );
        const digests = [];
        for (const row of rows) {
          const window = digestWindow(now, row.timezone);
          if (!window.due || row.last_digest === window.key) {
            continue;
          }
          await connection.execute("UPDATE team_discord SET last_digest = ? WHERE team_id = ?", [
            window.key,
            row.team_id
          ]);
          const [events] = await connection.query(
            "SELECT title, starts_at FROM team_events WHERE team_id = ? AND kind NOT IN ('availability', 'unavailable') AND starts_at >= ? AND starts_at < ? ORDER BY starts_at",
            [row.team_id, now, now + 7 * 24 * 3600_000]
          );
          if (events.length) {
            digests.push({
              teamId: row.team_id,
              channelId: row.channel_id,
              team: row.name,
              events: events.map(event => ({
                title: event.title,
                startsAt: Number(event.starts_at)
              }))
            });
          }
        }
        return digests;
      });
    }
  };
}
