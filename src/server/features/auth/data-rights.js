// The rights of a person over their data (GDPR): a copy of everything the site holds about them, and the erasure of
// their account. The two lists below say, table by table, what belongs to a person; src/server/features/auth/data-rights.test.js
// compares them with the tables of the database, so a table that gets a user column must be put in one of them.

/** [table, the column that holds the person]: what the export gives back (secrets and pictures are left out, see `leftOut`). */
export const EXPORTED = [
  ["users", "id"],
  ["user_profiles", "user_id"],
  ["user_preferences", "user_id"],
  ["user_labels", "user_id"],
  ["user_discord", "user_id"],
  ["user_avatars", "user_id"],
  ["sessions", "user_id"],
  ["api_keys", "user_id"],
  ["auth_events", "user_id"],
  ["notifications", "user_id"],
  ["team_members", "user_id"],
  ["team_invitations", "user_id"],
  ["teams", "created_by"],
  ["team_events", "created_by"],
  ["event_rsvps", "user_id"],
  ["scrim_posts", "created_by"],
  ["scrim_requests", "created_by"],
  ["request_messages", "user_id"],
  ["reports", "reporter_id"],
  ["series", "owner_user_id"],
  ["series_members", "user_id"],
  ["tier_lists", "owner_user_id"],
  ["tier_list_members", "user_id"],
  ["space_builds", "user_id"],
  ["space_links", "user_id"],
  ["combo_progress", "user_id"],
  ["combo_reviews", "user_id"],
  ["training_notes", "user_id"],
  ["training_attempts", "user_id"],
  ["training_focus", "user_id"],
  ["training_maps", "created_by"],
  ["training_scenarios", "created_by"],
  ["reflex_runs", "user_id"],
  ["simulation_games", "user_id"],
  ["contact_messages", "user_id"]
];

/**
 * [table, column, why]: tables that name a person and are not exported, with the reason. Secrets (hashes of codes) are
 * not given back to anyone; the rest is the content of a team or of the staff, which is not the person's own data.
 */
export const NOT_EXPORTED = [
  ["mfa_recovery_codes", "user_id", "hashes of the recovery codes: a secret"],
  ["auth_challenges", "user_id", "short-lived sign-in steps: a secret"],
  ["series_invites", "created_by", "an invitation link of a series: a secret"],
  ["tier_list_invites", "created_by", "an invitation link of a tier list: a secret"],
  ["team_series", "shared_by", "the link between a team and a series, listed with the series"],
  ["online_series", "team_a_user_id", "the opponent's side of a series, listed with the series"],
  ["online_series", "team_b_user_id", "the opponent's side of a series, listed with the series"],
  ["competitive_series", "created_by", "tournament data entered by the staff"],
  ["hero_lane_additions", "created_by", "game data entered by the staff"],
  ["hero_aliases", "created_by", "game data entered by the staff"],
  ["team_hero_goals", "created_by", "a goal of a team, listed with the team"],
  ["team_training_goals", "created_by", "a goal of a team, listed with the team"]
];

/** A column that is never given back: a hash, a secret or an encrypted secret, and the bytes of a picture. */
const leftOut = name => /(^|_)(hash|secret)(_|$)|_enc$|^bytes$|^image_bytes$/i.test(name);

/** What a database value looks like in a file: pictures (bytes) are left out, a number that does not fit stays text. */
const plain = value =>
  Buffer.isBuffer(value) ? undefined : typeof value === "bigint" ? String(value) : value;

/** Database access for the rights of a person. */
export function createDataRightsStore({ pool, inTransaction }) {
  return {
    /** Everything the site holds about a person, as one document: a list of rows for each table. */
    async exportUserData(userId, now = new Date()) {
      const tables = {};
      for (const [table, column] of EXPORTED) {
        const [rows] = await pool.query(`SELECT * FROM \`${table}\` WHERE \`${column}\` = ?`, [
          userId
        ]);
        if (rows.length) {
          tables[table] = rows.map(row =>
            Object.fromEntries(
              Object.entries(row)
                .filter(([name]) => !leftOut(name))
                .map(([name, value]) => [name, plain(value)])
                .filter(([, value]) => value !== undefined)
            )
          );
        }
      }
      return {
        exportedAt: now.toISOString(),
        note: "Everything HOK Global Scrim Lab holds about your account. Passwords, authenticator secrets, recovery codes and pictures are not included.",
        tables
      };
    },

    /**
     * Erases an account and what depends on it. The teams the person created go to another member (the highest role,
     * then the longest member) so that the others do not lose theirs; a team with nobody else is deleted. The series
     * and tier lists they own, their notes, their results, their messages: everything that is theirs is deleted.
     */
    async deleteUserAccount(userId) {
      return inTransaction(async connection => {
        const [[user]] = await connection.query(
          "SELECT login_email, email FROM users WHERE id = ? FOR UPDATE",
          [userId]
        );
        if (!user) {
          return { deleted: false };
        }
        const [teams] = await connection.query("SELECT id FROM teams WHERE created_by = ?", [
          userId
        ]);
        let handedOver = 0;
        let removed = 0;
        for (const { id } of teams) {
          const [[successor]] = await connection.query(
            `SELECT user_id FROM team_members WHERE team_id = ? AND user_id <> ?
             ORDER BY FIELD(role, 'owner', 'manager', 'coach', 'captain', 'analyst', 'player', 'sub'), joined_at LIMIT 1`,
            [id, userId]
          );
          if (successor) {
            await connection.query("UPDATE teams SET created_by = ? WHERE id = ?", [
              successor.user_id,
              id
            ]);
            await connection.query(
              "UPDATE team_members SET role = 'owner' WHERE team_id = ? AND user_id = ?",
              [id, successor.user_id]
            );
            handedOver += 1;
          } else {
            await connection.query("DELETE FROM teams WHERE id = ?", [id]);
            removed += 1;
          }
        }
        // the series the person opened as a side of an online series go with it; the other side of one is just emptied
        await connection.query(
          "DELETE FROM series WHERE id IN (SELECT series_id FROM online_series WHERE team_a_user_id = ?)",
          [userId]
        );
        await connection.query(
          "UPDATE online_series SET team_b_user_id = NULL WHERE team_b_user_id = ?",
          [userId]
        );
        await connection.query("DELETE FROM series WHERE owner_user_id = ?", [userId]);
        await connection.query("DELETE FROM tier_lists WHERE owner_user_id = ?", [userId]);
        await connection.query("DELETE FROM auth_events WHERE user_id = ?", [userId]);
        await connection.query(
          "DELETE FROM contact_messages WHERE user_id = ? OR email IN (?, ?)",
          [
            userId,
            String(user.login_email ?? "").toLowerCase() || "-",
            String(user.email ?? "").toLowerCase() || "-"
          ]
        );
        await connection.query("DELETE FROM users WHERE id = ?", [userId]);
        return { deleted: true, teamsHandedOver: handedOver, teamsDeleted: removed };
      });
    }
  };
}
