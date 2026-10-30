import { Router } from "express";
import { unauthorized } from "../../platform/errors.js";
import { wrap } from "../../platform/http/async.js";
import { parsePreferences } from "./preference-domain.js";

/**
 * What a signed-in person wants to see in the menu, their settings, and whether they went through
 * the welcome pages.
 */
export function createPreferencesRouter({ store, limiters }) {
  const router = Router();
  const account = request => {
    if (!request.user || request.user.isGuest) {
      throw unauthorized("Sign in to keep your choices.");
    }
    return request.user;
  };
  router.get(
    "/me/preferences",
    wrap(async request => store.getPreferences(account(request).id))
  );
  router.put(
    "/me/preferences",
    limiters.write,
    wrap(async request => {
      const user = account(request);
      const current = await store.getPreferences(user.id);
      return store.savePreferences(user.id, parsePreferences(request.body, current.settings));
    })
  );
  return router;
}
