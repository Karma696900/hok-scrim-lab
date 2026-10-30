import { Router } from "express";
import {
  API_KEYS_MAX,
  API_KEY_DEFAULT_LIFETIME,
  API_KEY_LIFETIMES,
  API_SCOPES
} from "../../../shared/access-rules.js";
import { notFound, unauthorized } from "../../platform/errors.js";
import { wrap } from "../../platform/http/async.js";
import { parseUuid } from "../../platform/validation.js";
import { generateKey, parseKeyRequest, presentKey } from "./api-key-domain.js";

/**
 * Where a signed-in person makes and revokes their API keys (the Settings page). These addresses answer
 * to the browser session only: a key can read (see gateway.js) but can never make another key, list the
 * keys or revoke one, so a leaked key cannot spread.
 */
export function createApiKeysRouter({ store, limiters, logger }) {
  const router = Router();

  /** A real account (a guest identity cannot hold keys). */
  const account = request => {
    if (!request.user || request.user.isGuest) {
      throw unauthorized("Sign in to continue.");
    }
    return request.user;
  };

  router.get(
    "/me/api-keys",
    wrap(async request => {
      const user = account(request);
      const now = Date.now();
      return {
        items: (await store.listApiKeys(user.id)).map(row => presentKey(row, now)),
        max: API_KEYS_MAX,
        scopes: API_SCOPES,
        lifetimes: API_KEY_LIFETIMES,
        defaultLifetime: API_KEY_DEFAULT_LIFETIME
      };
    })
  );

  // The secret is in the answer of this one request and nowhere else: it is not stored, so it cannot
  // be shown again.
  router.post(
    "/me/api-keys",
    limiters.auth,
    wrap(async request => {
      const user = account(request);
      const wanted = parseKeyRequest(request.body);
      const key = generateKey();
      const id = await store.createApiKey(
        user.id,
        { ...wanted, hint: key.hint, hash: key.hash },
        { max: API_KEYS_MAX }
      );
      logger.info("api key created", { userId: user.id, keyId: id, scopes: wanted.scopes });
      const [row] = (await store.listApiKeys(user.id)).filter(entry => entry.id === id);
      return { key: presentKey(row), secret: key.token };
    })
  );

  // A live key is revoked (it stops working at once); a key that is already revoked or expired is
  // removed from the list.
  router.delete(
    "/me/api-keys/:id",
    limiters.write,
    wrap(async request => {
      const user = account(request);
      const id = parseUuid(request.params.id);
      if (await store.revokeApiKey(user.id, id)) {
        logger.info("api key revoked", { userId: user.id, keyId: id });
        return { revoked: true };
      }
      if (await store.deleteApiKey(user.id, id)) {
        return { removed: true };
      }
      throw notFound("API key not found.");
    })
  );

  return router;
}
