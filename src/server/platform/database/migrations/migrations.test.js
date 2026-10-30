// Migrations are versioned, idempotent and non-destructive for legacy data.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import mysql from "mysql2/promise";
import baseline from "./001-baseline.js";
import dropHeroBuilds from "./039-drop-hero-builds.js";
import { MIGRATIONS, runMigrations } from "./index.js";
import { createTestDatabase } from "../../../../testing/test-app.js";

const database = await createTestDatabase();
const pool = database ? mysql.createPool({ ...database.config, connectionLimit: 4 }) : null;
after(async () => {
  await pool?.end();
  await database?.drop();
});

describe(
  "schema migrations",
  { skip: database ? false : "MySQL is not reachable (docker compose up -d mysql)" },
  () => {
    test("legacy data survives and orphans stay orphans (except online series, whose creator is known)", async () => {
      // A database exactly as the old code left it: baseline schema + data, no owner columns.
      await runMigrations(pool, [baseline]);
      const now = "2026-09-30T10:00:00.000Z";
      const blob = JSON.stringify({ id: "local-1", teamA: { name: "Legacy A" }, games: [] });
      await pool.query(
        "INSERT INTO users (id, google_subject, email, name, picture, created_at, updated_at) VALUES ('ua', 'sa', 'a@x.io', 'A', '', ?, ?), ('ub', 'sb', 'b@x.io', 'B', '', ?, ?)",
        [now, now, now, now]
      );
      await pool.query(
        "INSERT INTO series (id, data_json, created_at, updated_at) VALUES ('local-1', ?, ?, ?), ('online-1', ?, ?, ?)",
        [blob, now, now, blob, now, now]
      );
      await pool.query(
        "INSERT INTO online_series (series_id, invitation_code, team_a_user_id, team_b_user_id) VALUES ('online-1', 'abcdef0123456789', 'ua', 'ub')"
      );
      await pool.query(
        "INSERT INTO tier_lists (id, data_json, updated_at) VALUES ('tier-1', ?, ?)",
        [JSON.stringify({ id: "tier-1", tiers: [], unranked: ["flowborn"] }), now]
      );
      await pool.query(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (REPEAT('a', 64), 'ua', ?)",
        [Date.now() + 1000]
      );

      const applied = await runMigrations(pool);
      assert.deepEqual(
        applied,
        MIGRATIONS.filter(migration => migration.version > 1).map(migration => migration.version)
      );

      const [[local]] = await pool.query(
        "SELECT data_json, owner_user_id, version FROM series WHERE id = 'local-1'"
      );
      assert.equal(local.data_json, blob, "series blob untouched");
      assert.equal(local.owner_user_id, null, "legacy local series is an orphan");
      const [[summary]] = await pool.query(
        "SELECT status, team_a_name, games_count, best_of, game_mode, draft_mode FROM series WHERE id = 'local-1'"
      );
      assert.deepEqual(
        summary,
        {
          status: "active",
          team_a_name: "Legacy A",
          games_count: 0,
          best_of: 1,
          game_mode: "free-for-all",
          draft_mode: "solo"
        },
        "summary columns are backfilled from the blob (read only)"
      );
      const [[tier]] = await pool.query(
        "SELECT data_json, owner_user_id FROM tier_lists WHERE id = 'tier-1'"
      );
      assert.match(tier.data_json, /flowborn/, "tier list blob untouched");
      assert.equal(tier.owner_user_id, null);
      const [[online]] = await pool.query("SELECT owner_user_id FROM series WHERE id = 'online-1'");
      assert.equal(online.owner_user_id, "ua", "online series: team A is the creator");
      const [members] = await pool.query(
        "SELECT user_id, role FROM series_members WHERE series_id = 'online-1'"
      );
      assert.deepEqual(members, [{ user_id: "ub", role: "editor" }], "team B becomes a member");
      const [sessions] = await pool.query("SELECT token_hash FROM sessions");
      assert.equal(
        sessions.length,
        0,
        "migration 007 closes every non-guest session: everyone signs in again through MFA"
      );
      const [[account]] = await pool.query(
        "SELECT email_verified, mfa_enabled, login_email, password_hash FROM users WHERE id = 'ua'"
      );
      assert.deepEqual(
        [
          Boolean(account.email_verified),
          Boolean(account.mfa_enabled),
          account.login_email,
          account.password_hash
        ],
        [true, false, null, null],
        "Google accounts are verified, must enrol MFA, and have no password"
      );
    });

    test("running again is a no-op and every version is recorded once", async () => {
      assert.deepEqual(await runMigrations(pool), []);
      const [rows] = await pool.query(
        "SELECT version, name FROM schema_migrations ORDER BY version"
      );
      assert.deepEqual(
        rows.map(row => row.version),
        MIGRATIONS.map(migration => migration.version)
      );
    });

    test("the old table of builds goes when it is empty, and stays when it still holds rows", async () => {
      const exists = async () =>
        Number(
          (
            await pool.query(
              "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hero_builds'"
            )
          )[0][0].n
        );
      assert.equal(await exists(), 0, "dropped by the migrations, which left it empty");
      await pool.query("CREATE TABLE hero_builds (hero_id VARCHAR(64) PRIMARY KEY)");
      await pool.query("INSERT INTO hero_builds VALUES ('kept')");
      await dropHeroBuilds.up(pool);
      assert.equal(await exists(), 1, "a table with rows is never dropped");
      await pool.query("DELETE FROM hero_builds");
      await dropHeroBuilds.up(pool);
      assert.equal(await exists(), 0);
      await dropHeroBuilds.up(pool); // and again, once it is gone
    });

    test("concurrent starters migrate a fresh database exactly once", async () => {
      const fresh = await createTestDatabase();
      const freshPool = mysql.createPool({ ...fresh.config, connectionLimit: 6 });
      try {
        const results = await Promise.all([1, 2, 3].map(() => runMigrations(freshPool)));
        assert.equal(
          results.flat().length,
          MIGRATIONS.length,
          "each migration applied by exactly one starter"
        );
        const [rows] = await freshPool.query("SELECT COUNT(*) AS n FROM schema_migrations");
        assert.equal(Number(rows[0].n), MIGRATIONS.length);
      } finally {
        await freshPool.end();
        await fresh.drop();
      }
    });

    test("migration versions are unique and strictly increasing", () => {
      const versions = MIGRATIONS.map(migration => migration.version);
      assert.deepEqual(
        versions,
        [...new Set(versions)].sort((left, right) => left - right)
      );
    });
  }
);
