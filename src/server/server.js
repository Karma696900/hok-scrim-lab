import { createApp } from "./app.js";
import { assertRuntimeConfig, loadConfig } from "./config.js";
import { createStore } from "./platform/database/store.js";
import { createShutdown, installProcessHandlers } from "./platform/lifecycle.js";
import { logger } from "./platform/logger.js";
import { loadSecretBox } from "./platform/security/secret-box.js";
import {
  fetchHeroDetails,
  fetchHeroNames,
  fetchOfficialRoster,
  launchChromium
} from "./features/heroes/sync/hero-sync.js";
import { createDetailsSync, startDetailsSchedule } from "./features/heroes/sync/details-sync.js";
import { createExportQueue } from "./features/export/queue.js";
import { createExportService } from "./features/export/export-service.js";
import { createImageProxy } from "./features/media/image-proxy.js";
import { FRAME_PATHS, ROOM_FRAME_PATH, TRAINING_PATHS } from "./platform/http/page-handler.js";
import { createPrerenderer } from "./platform/http/prerender.js";
import { createProvider } from "./features/translations/providers/translation-providers.js";
import { createTranslationService } from "./features/translations/translation-service.js";
import { createPdfExporter } from "./features/export/pdf-exporter.js";
import { createPortraitCache } from "./features/media/portrait-cache.js";
import { createRosterSync, startRosterSchedule } from "./features/heroes/sync/roster-sync.js";
import { LANGUAGES } from "../shared/i18n.js";
import os from "node:os";
import path from "node:path";
import { startReminders } from "./features/discord/reminders.js";
import { createDiscordService, createNotifier } from "./features/discord/discord-service.js";

const config = loadConfig();
try {
  assertRuntimeConfig(config);
} catch (error) {
  logger.error("invalid configuration", { message: error.message });
  process.exit(1);
}

const secretBox = loadSecretBox(config, logger);
const store = createStore(config.db, { log: message => logger.info(message) });
await store.initializeDatabase();

const rosterSync = createRosterSync({
  store,
  fetchRoster: fetchOfficialRoster,
  fetchNames: fetchHeroNames,
  cooldownMs: config.rosterManualCooldownMs,
  logger
});
const detailsSync = createDetailsSync({
  store,
  fetchDetails: fetchHeroDetails,
  cooldownMs: config.rosterManualCooldownMs,
  logger
});
const imageProxy = createImageProxy({
  directory: path.join(
    config.portraitCacheDir || path.join(os.tmpdir(), "hok-portrait-cache"),
    "webp"
  ),
  logger
});
const exportService = createExportService({
  store,
  logger,
  portraits: createPortraitCache({
    directory: config.portraitCacheDir || path.join(os.tmpdir(), "hok-portrait-cache"),
    logger
  }),
  exporter: createPdfExporter({ logger }),
  queue: createExportQueue({
    concurrency: config.exportConcurrency,
    maxQueued: config.exportMaxQueued
  })
});
const prerender = config.prerender
  ? createPrerenderer({
      launch: launchChromium,
      baseUrl: () => `http://127.0.0.1:${config.port}`,
      logger,
      registration: config.registrationEnabled
    })
  : null;
const translations = createTranslationService({
  store,
  provider: createProvider(config.translation),
  config: config.translation,
  logger,
  onChange: () => prerender?.invalidate()
});
const app = createApp({
  store,
  config,
  secretBox,
  rosterSync,
  detailsSync,
  exportService,
  imageProxy,
  prerender,
  translations,
  logger
});
const server = app.listen(config.port, () => {
  logger.info("listening", { url: `http://localhost:${config.port}`, env: config.nodeEnv });
});
prerender?.warm(
  [
    "/",
    "/heroes",
    "/tier-lists",
    "/scrims",
    "/history",
    "/build-lab",
    "/teams",
    "/find",
    "/login",
    "/register"
  ],
  config.prerenderWarmAllLanguages ? LANGUAGES.map(language => language.code) : ["en"]
); // English first, then the others (production), one after the other
// the frames of the pages of a signed-in person, in English (the other languages are drawn when somebody asks)
for (const variant of ["user", "staff"]) {
  prerender?.warm([...Object.values(FRAME_PATHS), ...TRAINING_PATHS.slice(1)], ["en"], { variant });
}
prerender?.warm([ROOM_FRAME_PATH], ["en"], { variant: "user" });
translations.start();
logger.info("translation", {
  provider: config.translation.provider,
  note:
    config.translation.provider === "off"
      ? "the staff's texts are shown as typed (see TRANSLATION_PROVIDER)"
      : "the staff's texts are translated in the background"
});
const discord = createDiscordService(config);
discord
  .registerCommands()
  .catch(error => logger.warn("discord commands not registered", { message: error.message })); // /agenda and /requests (global, idempotent)
const stopReminders = startReminders({
  store,
  notifier: createNotifier({ store, discord, config, logger }),
  logger
});
const stopRosterSchedule = startRosterSchedule({
  store,
  rosterSync,
  intervalMs: config.rosterSyncIntervalMs,
  logger
});
const stopDetailsSchedule = startDetailsSchedule({
  detailsSync,
  store,
  logger,
  startupDelayMs: config.detailsSyncStartupDelayMs
});
const purgeTimer = setInterval(
  () => {
    store
      .purgeExpired()
      .then(result => {
        if (result.sessions || result.guests) {
          logger.info("purged", result);
        }
      })
      .catch(error => logger.warn("purge failed", { message: error.message }));
  },
  60 * 60 * 1000
);
purgeTimer.unref();

const shutdown = createShutdown({
  server,
  logger,
  drainMs: config.shutdownDrainMs,
  // the readiness check (GET /api/health) answers 503 from now on
  onDrain: () => {
    app.locals.draining = true;
  },
  closeResources: async () => {
    stopRosterSchedule();
    stopReminders();
    stopDetailsSchedule();
    await translations.stop();
    clearInterval(purgeTimer);
    await prerender?.close();
    await store.closeDatabase();
  }
});
installProcessHandlers({ shutdown, logger });
