import { Router } from "express";
import { HttpError, forbidden, notFound, unauthorized } from "../../platform/errors.js";
import { wrap } from "../../platform/http/async.js";
import { API_ENDPOINTS, endpointOf } from "./endpoints.js";
import { hashKey, keyFromRequest } from "./api-key-domain.js";

/**
 * The public API, `/api/v1`: the data of the application, read with an API key instead of a session.
 *
 * It is a gateway more than a second set of routes. A request is checked here (a live key, its scope, the
 * rate of the key, GET only) and then handed to the SAME router that serves the application, as the
 * person who owns the key, with no administrator or editor right whatever the person is. So a key sees
 * exactly what its owner sees in the application, never more: the series they own or were given, the
 * series their teams shared, their tier lists, their own statistics.
 *
 * Cookies are not read on these addresses (see identity.js) and a key is not read anywhere else.
 * Its refusals stay in English: they are read by a developer's program, not by a visitor.
 */
export function createApiGateway({ store, application, limiters, logger }) {
  const router = Router();

  // Programs and pages of other sites may read (never write): the key travels in a header, not in a
  // cookie, so there is no ambient authority for another site to abuse.
  router.use((request, response, next) => {
    response.set({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, X-API-Key",
      "Access-Control-Expose-Headers": "RateLimit, RateLimit-Policy, Retry-After, X-Request-Id",
      "Access-Control-Max-Age": "600",
      "Cross-Origin-Resource-Policy": "cross-origin"
    });
    if (request.method === "OPTIONS") {
      return response.status(204).end();
    }
    next();
  });

  router.use((request, response, next) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD, OPTIONS");
      return next(new HttpError(405, "method_not_allowed", "The API only reads: use GET."));
    }
    next();
  });

  // Who is calling. The same answer for a key that does not exist, was revoked or has expired: nothing
  // tells which, so a guess learns nothing. Every refusal is counted against the address of the caller
  // (a few tries, then 429). A call that works is never counted, so a neighbour behind the same address
  // cannot take somebody's access away.
  const refuse = (request, response, next, challenge, message) => {
    response.set("WWW-Authenticate", challenge);
    limiters.apiFailures(request, response, error => next(error ?? unauthorized(message)));
  };

  router.use(
    wrap(async (request, response, next) => {
      const token = keyFromRequest(request);
      const found = token ? await store.findApiKey(hashKey(token)) : null;
      if (!token) {
        return refuse(
          request,
          response,
          next,
          'Bearer realm="HOK Global Scrim Lab API"',
          "Send your API key as: Authorization: Bearer <your key>."
        );
      }
      if (!found || found.user.isGuest) {
        return refuse(
          request,
          response,
          next,
          'Bearer error="invalid_token"',
          "This API key is not valid, has expired or was revoked."
        );
      }
      request.apiKey = found.key;
      // an ordinary person, whatever they are on the site: a key never carries staff rights
      request.user = { ...found.user, isAdmin: false, isEditor: false };
      next();
    })
  );
  router.use(limiters.apiKey);

  // Said once, at the door, so that a person who made a key can see what it did last.
  router.use((request, _response, next) => {
    store.touchApiKey(request.apiKey.id).catch(error =>
      logger.warn("api key use not recorded", {
        keyId: request.apiKey.id,
        message: error?.message
      })
    );
    next();
  });

  router.get("/", (request, response) => {
    response.json({
      version: 1,
      account: { tag: request.user.tag, name: request.user.name },
      key: { name: request.apiKey.name, scopes: request.apiKey.scopes },
      endpoints: API_ENDPOINTS.filter(endpoint =>
        request.apiKey.scopes.includes(endpoint.scope)
      ).map(({ scope, path, summary }) => ({ scope, path: `/api/v1${path}`, summary }))
    });
  });

  router.get("/me", (request, response, next) => {
    if (!request.apiKey.scopes.includes("account")) {
      return next(missingScope("account"));
    }
    response.json({
      account: { tag: request.user.tag, name: request.user.name },
      key: {
        id: request.apiKey.id,
        name: request.apiKey.name,
        scopes: request.apiKey.scopes,
        expiresAt: request.apiKey.expiresAt
      }
    });
  });

  router.use((request, _response, next) => {
    const endpoint = endpointOf(request.path);
    if (!endpoint) {
      return next(notFound("Unknown API endpoint."));
    }
    if (!request.apiKey.scopes.includes(endpoint.scope)) {
      return next(missingScope(endpoint.scope));
    }
    next();
  });

  // The application's own router, which sees the address without /api/v1, as it does without /api.
  router.use(application);
  router.use((_request, _response, next) => next(notFound("Unknown API endpoint.")));
  return router;
}

const missingScope = scope =>
  forbidden("This key cannot read this: it needs the scope {scope}.", "insufficient_scope", {
    scope
  });
