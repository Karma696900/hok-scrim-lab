import { notFound } from "../../platform/errors.js";
import { parse } from "./store-helpers.js";

/** Public player pages: the optional profile and the labels given by administrators. */
export function createPlayersStore({ pool, inTransaction }) {
  return {
    // ---- player profiles ------------------------------------------------------------------------
    async getPlayer(tag) {
      const [[user]] = await pool.query(
        "SELECT id, name, tag, email FROM users WHERE tag = ? AND is_guest = FALSE",
        [tag]
      );
      if (!user) {
        return null;
      }
      const [[profile]] = await pool.query(
        "SELECT bio, lane, timezone, languages_json, main_heroes_json FROM user_profiles WHERE user_id = ?",
        [user.id]
      );
      const [teams] = await pool.query(
        "SELECT t.id, t.name, t.tag, t.logo_version, m.role, m.lane FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.user_id = ? ORDER BY m.joined_at",
        [user.id]
      );
      const [[discord]] = await pool.query(
        "SELECT 1 AS linked FROM user_discord WHERE user_id = ?",
        [user.id]
      );
      const [labels] = await pool.query(
        "SELECT label FROM user_labels WHERE user_id = ? ORDER BY label",
        [user.id]
      );
      const [[avatar]] = await pool.query("SELECT avatar_kind, picture FROM users WHERE id = ?", [
        user.id
      ]);
      return {
        id: user.id,
        name: user.name,
        tag: user.tag,
        email: user.email,
        picture: avatar?.picture || null,
        profile: {
          bio: profile?.bio ?? "",
          lane: profile?.lane ?? "",
          timezone: profile?.timezone ?? "",
          languages: parse(profile?.languages_json, []),
          mainHeroes: parse(profile?.main_heroes_json, [])
        },
        teams: teams.map(team => ({
          id: team.id,
          name: team.name,
          tag: team.tag,
          logoVersion: Number(team.logo_version),
          role: team.role,
          lane: team.lane
        })),
        discordLinked: Boolean(discord),
        labels: labels.map(row => row.label)
      };
    },

    async saveProfile(userId, input) {
      await pool.execute(
        "INSERT INTO user_profiles (user_id, bio, lane, timezone, languages_json, main_heroes_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE bio = VALUES(bio), lane = VALUES(lane), timezone = VALUES(timezone), languages_json = VALUES(languages_json), main_heroes_json = VALUES(main_heroes_json), updated_at = VALUES(updated_at)",
        [
          userId,
          input.bio,
          input.lane,
          input.timezone,
          JSON.stringify(input.languages),
          JSON.stringify(input.mainHeroes),
          Date.now()
        ]
      );
    },

    async setLabels(adminId, tag, labels) {
      const [[user]] = await pool.query("SELECT id FROM users WHERE tag = ? AND is_guest = FALSE", [
        tag
      ]);
      if (!user) {
        throw notFound("Player not found.");
      }
      await inTransaction(async connection => {
        await connection.execute("DELETE FROM user_labels WHERE user_id = ?", [user.id]);
        if (labels.length) {
          await connection.query(
            "INSERT INTO user_labels (user_id, label, given_by, given_at) VALUES ?",
            [labels.map(label => [user.id, label, adminId, Date.now()])]
          );
        }
      });
    }
  };
}
