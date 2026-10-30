// The small pieces of createApp: how it is assembled from its middleware and its two lazily-built services.
import compression from "compression";
import { describeError } from "./platform/errors.js";
import { createBootstrap } from "./platform/http/client-bootstrap.js";
import { createProvider } from "./features/translations/providers/translation-providers.js";
import { createTranslationService } from "./features/translations/translation-service.js";
import { sessionView } from "./features/auth/session-view.js";

export const translatorOf = ctx =>
  ctx.translations ??
  createTranslationService({
    store: ctx.store,
    provider: createProvider(ctx.config.translation),
    config: ctx.config.translation,
    logger: ctx.logger,
    onChange: () => ctx.prerender?.invalidate()
  });

// a signed-in person's page carries their session, preferences and menu counters (platform/http/bootstrap.js)
export const bootstrapOf = ctx =>
  createBootstrap({
    store: ctx.store,
    view: request => sessionView(request, ctx.config),
    summary: request => ctx.store.communitySummary(request.user.id)
  });

export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// What the staff writes, and so what is translated: when one of these is saved, a round of
// translation follows. (A situation's answers are the players': they do not count.)
const CONTENT_WRITES =
  /^\/api\/(admin\/catalog\/|admin\/heroes\/[^/]+\/profile$|builds\/|combos\/|training\/(scenarios(\/[^/]+)?|maps)$)/;

// gzip/brotli for text. Never for sign-in endpoints (secrets in responses + compression =
// BREACH-style leaks).
export const compressText = compression({
  threshold: 1024,
  filter: (request, response) =>
    !request.path.startsWith("/api/auth") &&
    !request.path.startsWith("/auth") &&
    compression.filter(request, response)
});

/** A write of what the staff wrote starts a round of translation once the answer is sent. */
export const kickTranslationAfterWrite = ctx => (request, response, next) => {
  if (!SAFE_METHODS.has(request.method) && CONTENT_WRITES.test(request.originalUrl.split("?")[0])) {
    response.on("finish", () => {
      if (response.statusCode < 400) {
        ctx.translator.kick();
      }
    });
  }
  next();
};

export const errorHandler = logger => (error, request, response, next) => {
  if (response.headersSent) {
    return next(error);
  }
  const { status, body } = describeError(error, request.language);
  // an error is never kept by a browser or a CDN, whatever header the route had already set (the
  // picture routes announce "immutable" before they build the picture)
  response.removeHeader("ETag");
  response.setHeader("Cache-Control", "no-store");
  if (status >= 500) {
    logger.error("unhandled error", {
      id: request.id,
      method: request.method,
      path: request.path,
      message: error?.message,
      stack: error?.stack
    });
  }
  response.status(status).json({ ...body, requestId: request.id });
};
