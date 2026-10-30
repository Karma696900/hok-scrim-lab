import { presentUser } from "../series/presenters.js";

/**
 * What the browser is told about the session: the answer of GET /api/auth/me, and the same object that a page of a
 * signed-in person carries in its boot block (platform/http/bootstrap.js), so the two cannot differ.
 */
export function sessionView(request, config) {
  return {
    enabled: config.google.enabled,
    user: presentUser(request.user),
    guest: Boolean(request.user?.isGuest),
    registration: config.registrationEnabled,
    minSampleGames: config.minSampleGames
  };
}
