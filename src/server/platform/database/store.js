import mysql from "mysql2/promise";
import { createApiKeyStore } from "../../features/api-keys/api-key-store.js";
import { createAccountStore } from "../../features/auth/account-store.js";
import { createSessionStore } from "../../features/auth/session-store.js";
import { createCatalogStore } from "../../features/catalog/catalog-store.js";
import { createCommunityStore } from "../../features/community/community-store.js";
import { createComboStore } from "../../features/combos/combo-store.js";
import { createHeroStore } from "../../features/heroes/hero-store.js";
import { createSeriesStore } from "../../features/series/series-store.js";
import { createSharingStore } from "../../features/sharing/sharing-store.js";
import { createSpaceStore } from "../../features/space/space-store.js";
import { createTeamStore } from "../../features/teams/team-store.js";
import { createReflexStore } from "../../features/reflex/reflex-store.js";
import { createOfficialRatingsStore } from "../../features/tier-lists/official-store.js";
import { createDataRightsStore } from "../../features/auth/data-rights.js";
import { createContactStore } from "../../features/contact/contact-store.js";
import { createTierListStore } from "../../features/tier-lists/tier-list-store.js";
import { createCompetitiveStore } from "../../features/tournaments/tournament-store.js";
import { createTrainingStore } from "../../features/training/training-store.js";
import { createTranslationStore } from "../../features/translations/translation-store.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as storeParts } from "./store-parts.js";

/**
 * The one object the rest of the server talks to. Each feature owns its queries (features/<name>/store.js);
 * this function opens the MySQL pool, hands it to them and puts their methods side by side.
 */
export function createStore(dbConfig, { log = () => {}, quotas = {} } = {}) {
  const ctx = { dbConfig, log };
  bindTo(ctx, storeParts);
  // sizes come from the configuration (DB_POOL_SIZE, DB_QUEUE_LIMIT, DB_CONNECT_TIMEOUT_MS); TCP
  // keep-alive is mysql2's default
  ctx.pool = mysql.createPool({
    connectionLimit: 10,
    queueLimit: 0,
    ...ctx.dbConfig,
    waitForConnections: true,
    charset: "utf8mb4"
  });

  const context = {
    pool: ctx.pool,
    inTransaction: ctx.inTransaction,
    acquireLock: ctx.acquireLock,
    database: ctx.dbConfig.database
  };
  const accounts = createAccountStore(context);

  return {
    pool: ctx.pool,
    runExclusive: ctx.runExclusive,
    ...accounts,
    ...createCompetitiveStore(context),
    ...createCatalogStore(context),
    ...createTeamStore(context),
    ...createCommunityStore(context),
    ...createTrainingStore(context),
    ...createHeroStore(context),
    ...createSessionStore({ ...context, accounts }),
    ...createSeriesStore(context),
    ...createTierListStore(context),
    ...createOfficialRatingsStore(context),
    ...createComboStore(context),
    ...createTranslationStore(context),
    ...createReflexStore(context),
    ...createSpaceStore(context),
    ...createSharingStore({ ...context, quotas }),
    ...createApiKeyStore(context),
    ...createContactStore(context),
    ...createDataRightsStore(context),

    initializeDatabase: ctx.initializeDatabase,
    ping: ctx.ping,
    closeDatabase: ctx.closeDatabase
  };
}

/** Monotonic ISO timestamp: never earlier than (previous + 1 ms). */
export function nextTimestamp(previousIso) {
  const previous = Date.parse(previousIso);
  return new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString();
}
