// What a browser, or a CDN in front of the site, may keep of a response. The default for everything under
// /api and /auth is `no-store` (see noStoreForApi in security.js): private data must never be stored. The
// helpers below are for the few responses that are not private, and are called ONLY once the answer is
// known to be good, so that an error is never kept.

/**
 * The response is the same for every visitor (a picture, a script, public data): it does not depend on
 * the cookie or on the language, so it must not be marked as varying on them. app.js adds
 * `Vary: Accept-Language, Cookie` to every response because the pages and the API do; left on a
 * picture, it makes a browser throw its cached copy away each time the visitor logs in or changes
 * language, and a CDN keep one copy per visitor.
 */
export function sameForEveryone(response) {
  response.removeHeader("Vary");
  // Nothing of one visitor may travel in an answer that every visitor can be handed: the identity
  // middleware renews the session cookie of a session that is more than an hour old on ANY request,
  // public ones included, and a shared cache that keeps `Set-Cookie` would give that token to the next.
  response.removeHeader("Set-Cookie");
}

/**
 * Public data that may be a little old: kept for `maxAge` seconds without asking, then served
 * immediately for `staleWhileRevalidate` more seconds while the browser (or CDN) refreshes it.
 */
export function publicFor(response, { maxAge = 60, staleWhileRevalidate = 300 } = {}) {
  sameForEveryone(response);
  response.setHeader(
    "Cache-Control",
    `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`
  );
}

/**
 * Data that can be stored but is checked on every use: the browser sends the ETag back and gets a
 * 304 with no body when nothing changed, a fresh copy as soon as something did. `shared` says that
 * it is the same for everybody (a CDN may keep it too), otherwise only the browser's own cache may.
 */
export function revalidate(response, { shared = false } = {}) {
  if (shared) {
    sameForEveryone(response);
  }
  response.setHeader("Cache-Control", shared ? "public, no-cache" : "private, no-cache");
}
