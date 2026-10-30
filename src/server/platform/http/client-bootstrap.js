/**
 * What a person who is signed in needs to start: their session (the answer of GET /api/auth/me), their preferences
 * (GET /api/me/preferences) and the counters of their menu (GET /api/community/summary). The page handler writes them
 * into the page it sends (the boot block, `b`), so the browser starts with them instead of making three requests that
 * the whole page then waits for. A visitor has nothing personal: their pages stay the same for everybody (and cacheable).
 *
 * `view` and `summary` are given by the features (the platform does not know their shape); a store that fails leaves
 * the answer out and the browser asks for it as before.
 */
export function createBootstrap({ store, view, summary }) {
  const attempt = work => work().catch(() => null);
  return async function bootstrap(request) {
    const me = view(request);
    if (!me.user) {
      return { me }; // an anonymous guest: nothing personal to add
    }
    const [prefs, counters] = await Promise.all([
      attempt(() => store.getPreferences(request.user.id)),
      attempt(() => summary(request))
    ]);
    return { me, prefs, summary: counters };
  };
}
