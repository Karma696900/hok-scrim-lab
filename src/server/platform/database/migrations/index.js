import baseline from "./001-baseline.js";
import ownershipAndSharing from "./002-ownership-sharing.js";
import tierListLane from "./003-tier-list-lane.js";
import heroData from "./004-hero-data.js";
import seriesSummary from "./005-series-summary.js";
import heroDetails from "./006-hero-details.js";
import accountsMfa from "./007-accounts-mfa.js";
import heroI18n from "./008-hero-i18n.js";
import profiles from "./009-profiles.js";
import tournaments from "./010-tournaments.js";
import catalog from "./011-catalog.js";
import teams from "./012-teams.js";
import teamLogoLimit from "./013-team-logo-limit.js";
import teamEvents from "./014-team-events.js";
import community from "./015-community.js";
import userLabels from "./016-user-labels.js";
import discordBot from "./017-discord-bot.js";
import training from "./018-training.js";
import preferences from "./019-preferences.js";
import heroLaneRemovals from "./020-hero-lane-removals.js";
import officialRatings from "./021-official-ratings.js";
import heroCombos from "./022-hero-combos.js";
import reflexTraining from "./023-reflex-training.js";
import personalSpace from "./024-personal-space.js";
import trainingExtras from "./025-training-extras.js";
import statKinds from "./026-stat-kinds.js";
import contentTranslations from "./027-content-translations.js";
import itemShopCategory from "./028-item-shop-category.js";
import translationLanguages from "./029-translation-languages.js";
import performanceIndexes from "./030-performance-indexes.js";
import auditIndexes from "./031-audit-indexes.js";
import summonerSpells from "./032-summoner-spells.js";
import apiKeys from "./033-api-keys.js";
import teamSeries from "./034-team-series.js";
import seriesVerification from "./035-series-verification.js";
import contactMessages from "./036-contact-messages.js";
import heroAliases from "./037-hero-aliases.js";
import seriesPickOrder from "./038-series-pick-order.js";
import dropHeroBuilds from "./039-drop-hero-builds.js";

// Append only. A migration is never edited once released and must be non-destructive (add
// columns/tables, backfill; never drop or rewrite user data).
export const MIGRATIONS = [
  baseline,
  ownershipAndSharing,
  tierListLane,
  heroData,
  seriesSummary,
  heroDetails,
  accountsMfa,
  heroI18n,
  profiles,
  tournaments,
  catalog,
  teams,
  teamLogoLimit,
  teamEvents,
  community,
  userLabels,
  discordBot,
  training,
  preferences,
  heroLaneRemovals,
  officialRatings,
  heroCombos,
  reflexTraining,
  personalSpace,
  trainingExtras,
  statKinds,
  contentTranslations,
  itemShopCategory,
  translationLanguages,
  performanceIndexes,
  auditIndexes,
  summonerSpells,
  apiKeys,
  teamSeries,
  seriesVerification,
  contactMessages,
  heroAliases,
  seriesPickOrder,
  dropHeroBuilds
];

const LOCK_NAME = "hok_scrim_migrations";

/**
 * Applies pending migrations in order. A MySQL advisory lock keeps concurrent
 * starters from migrating at the same time. Returns the versions applied.
 */
export async function runMigrations(pool, migrations = MIGRATIONS, log = () => {}) {
  const connection = await pool.getConnection();
  const applied = [];
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK(?, 60) AS acquired", [LOCK_NAME]);
    if (lock.acquired !== 1) {
      throw new Error("Could not acquire the migration lock.");
    }
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      applied_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const [rows] = await connection.query("SELECT version FROM schema_migrations");
    const done = new Set(rows.map(row => row.version));
    for (const migration of [...migrations].sort((left, right) => left.version - right.version)) {
      if (done.has(migration.version)) {
        continue;
      }
      log(`applying migration ${migration.version} ${migration.name}`);
      await migration.up(connection);
      await connection.query(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        [migration.version, migration.name, new Date().toISOString()]
      );
      applied.push(migration.version);
    }
    return applied;
  } finally {
    await connection.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]).catch(() => {});
    connection.release();
  }
}
