// Every router of the features, mounted under /api (the public API of the keys mounts the very same router).
import express from "express";
import { createAuthRouter } from "./features/auth/auth-routes.js";
import { createHeroAdminRouter } from "./features/heroes/admin-routes.js";
import { createHeroRouter } from "./features/heroes/hero-routes.js";
import { createPopularRouter } from "./features/tournaments/popular-routes.js";
import { createTournamentRouter } from "./features/tournaments/tournament-routes.js";
import { createCatalogRouter } from "./features/catalog/catalog-routes.js";
import { createApiKeysRouter } from "./features/api-keys/api-key-routes.js";
import { createComboRouter } from "./features/combos/combo-routes.js";
import { createExportRouter } from "./features/export/export-routes.js";
import { registerInviteAcceptance } from "./features/sharing/sharing-routes.js";
import { createSeriesRouter } from "./features/series/series-routes.js";
import { createSpaceRouter } from "./features/space/space-routes.js";
import { createStatsRouter } from "./features/stats/stats-routes.js";
import { createOfficialRatingsRouter } from "./features/tier-lists/official-routes.js";
import { createTierListRouter } from "./features/tier-lists/tier-list-routes.js";
import { createTeamRouter } from "./features/teams/team-routes.js";
import { createCommunityRouter } from "./features/community/community-routes.js";
import { createReflexRouter } from "./features/reflex/reflex-routes.js";
import { createTrainingRouter } from "./features/training/training-routes.js";
import { createTranslationRouter } from "./features/translations/translation-routes.js";
import { createContactRouter } from "./features/contact/contact-routes.js";
import { createPreferencesRouter } from "./features/preferences/preference-routes.js";
import { createSimulationRouter } from "./features/simulation/simulation-routes.js";
import { createCasinoRouter } from "./features/casino/casino-routes.js";

export function createApiRouter({
  store,
  config,
  logger,
  translator,
  prerender,
  limiters,
  identity,
  auth,
  notifier,
  discord,
  teamDiscord,
  rosterSync,
  detailsSync,
  mediaProbe,
  exportService
}) {
  const api = express.Router();
  api.use(createAuthRouter({ auth, limiters, config: config }));
  api.use(
    createHeroRouter({
      store: store,
      rosterSync,
      detailsSync,
      limiters,
      config: config,
      mediaProbe
    })
  );
  api.use(createHeroAdminRouter({ store: store, limiters, detailsSync, prerender: prerender }));
  api.use(createTournamentRouter({ store: store, limiters }));
  api.use(createPopularRouter({ store: store }));
  api.use(createCatalogRouter({ store: store, limiters }));
  api.use(createTranslationRouter({ store: store, translations: translator, limiters }));
  api.use(createComboRouter({ store: store, limiters }));
  api.use(createStatsRouter({ store: store, config: config }));
  api.use(createExportRouter({ store: store, identity, exportService, limiters }));
  api.use(createSeriesRouter({ store: store, identity, limiters }));
  api.use(createTierListRouter({ store: store, identity, limiters }));
  api.use(createOfficialRatingsRouter({ store: store, limiters }));
  api.use(createTeamRouter({ store: store, limiters, notifier }));
  api.use(teamDiscord.api);
  api.use(createCommunityRouter({ store: store, limiters, notifier, discord, config: config }));
  api.use(createTrainingRouter({ store: store, limiters }));
  api.use(createReflexRouter({ store: store, limiters }));
  api.use(createSimulationRouter({ store: store, limiters }));
  api.use(createCasinoRouter({ store: store, limiters }));
  api.use(createSpaceRouter({ store: store, limiters }));
  api.use(createPreferencesRouter({ store: store, limiters }));
  api.use(createContactRouter({ store: store, limiters }));
  api.use(createApiKeysRouter({ store: store, limiters, logger: logger }));
  registerInviteAcceptance(api, { store: store, identity, limiters });
  return api;
}
