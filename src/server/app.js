import express from "express";
import { notFound } from "./platform/errors.js";
import { languageOfRequest } from "./platform/http/page-handler-language.js";
import { BOOT_SCRIPT_HASH } from "./platform/http/first-paint.js";
import { createIdentity } from "./platform/http/identity.js";
import { createLimiters } from "./platform/http/rate-limits.js";
import {
  noStoreForApi,
  requestContext,
  sameOriginOnly,
  enforceHttps,
  securityHeaders
} from "./platform/http/security-headers.js";
import { logger as defaultLogger } from "./platform/logger.js";
import { serveAssets } from "./platform/http/assets.js";
import {
  createPageHandler,
  createSeoHandlers,
  loadCriticalCss
} from "./platform/http/page-handler.js";
import { createApiGateway } from "./features/api-keys/gateway.js";
import { createDiscordService, createNotifier } from "./features/discord/discord-service.js";
import { createInteractionsRouter } from "./features/discord/discord-routes.js";
import { createApiRouter } from "./app-api.js";
import { mountSignIn } from "./app-sign-in.js";
import { botsSockets } from "./features/simulation/bots-link.js";
import { registerPictureRoutes } from "./app-media.js";
import {
  SAFE_METHODS,
  bootstrapOf,
  compressText,
  errorHandler,
  kickTranslationAfterWrite,
  translatorOf
} from "./app-parts.js";

/**
 * Builds the Express app. Nothing here touches the network or the process: the caller
 * supplies the store (MySQL), config and roster synchroniser, which keeps the API testable.
 */
export function createApp({
  store,
  config,
  secretBox,
  rosterSync,
  detailsSync = null,
  exportService = null,
  imageProxy = null,
  mediaProbe = undefined,
  prerender = null,
  discordService = null,
  translations = null,
  logger = defaultLogger,
  limiters = createLimiters({ enabled: config.rateLimitEnabled })
}) {
  const ctx = { translations, store, config, logger, prerender };
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", ctx.config.trustProxy);
  const identity = createIdentity({ store: ctx.store, config: ctx.config });
  const discord = discordService ?? createDiscordService(ctx.config);
  ctx.translator = translatorOf(ctx);

  const notifier = createNotifier({
    store: ctx.store,
    discord,
    config: ctx.config,
    logger: ctx.logger
  });

  app.use(requestContext(ctx.logger));
  app.use(languageOfRequest);
  const critical = loadCriticalCss();
  app.use(enforceHttps(ctx.config.cookieSecure, ctx.prerender));
  app.use(
    securityHeaders({
      hsts: ctx.config.cookieSecure,
      styleHashes: [critical.hash], // a page the server draws carries its own (see pages.js)
      scriptHashes: [BOOT_SCRIPT_HASH],
      connectSources: botsSockets()
    })
  );
  app.use(noStoreForApi);
  app.use(compressText);
  app.get("/index.html", (_request, response) => response.redirect(301, "/")); // the shell has placeholders: never served as a file
  serveAssets(app);
  registerPictureRoutes(app, { store: ctx.store, limiters, imageProxy });

  app.use(createInteractionsRouter({ store: ctx.store, discord, notifier, logger: ctx.logger })); // signed by Discord, read as raw bytes: before the JSON parser
  app.use(express.json({ limit: "1mb" }));
  app.use(sameOriginOnly({ appOrigin: ctx.config.appOrigin }));
  app.use(identity.middleware);
  app.use("/api", (request, response, next) =>
    SAFE_METHODS.has(request.method) ? next() : limiters.write(request, response, next)
  );
  app.use("/api", kickTranslationAfterWrite(ctx));

  const { auth, teamDiscord } = mountSignIn(app, {
    store: ctx.store,
    config: ctx.config,
    logger: ctx.logger,
    secretBox,
    identity,
    limiters,
    discord,
    notifier
  });
  const api = createApiRouter({
    store: ctx.store,
    config: ctx.config,
    logger: ctx.logger,
    translator: ctx.translator,
    prerender: ctx.prerender,
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
  });
  // the public API: a key instead of a session, then the same router (see features/api-keys/gateway.js)
  app.use(
    "/api/v1",
    createApiGateway({ store: ctx.store, application: api, limiters, logger: ctx.logger })
  );
  app.use("/api", api);
  app.use("/api", (_request, _response, next) => next(notFound("Unknown API endpoint.")));

  const seo = createSeoHandlers({ store: ctx.store, config: ctx.config });
  app.get("/robots.txt", seo.robots);
  app.get("/sitemap.xml", seo.sitemap);
  app.get("/llms.txt", seo.llms);
  ctx.bootstrap = bootstrapOf(ctx);

  app.get(
    "*path",
    createPageHandler({
      store: ctx.store,
      config: ctx.config,
      critical,
      prerender: ctx.prerender,
      bootstrap: ctx.bootstrap
    })
  );

  app.use(errorHandler(ctx.logger));

  app.locals.translations = ctx.translator;
  return app;
}
