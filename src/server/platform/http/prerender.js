import { randomBytes } from "node:crypto";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as prerenderParts } from "./prerender-parts.js";
export { PRERENDER_HEADER } from "./prerender-parts.js";

/**
 * Server-side rendering of the first screen, by running the site's own client code once in headless
 * Chromium: the markup that the page would draw for a visitor with no session is captured (for each
 * path and language) and written into the HTML that anonymous visitors receive. There is a single
 * set of views, so nothing can drift between what the server sends and what the browser draws; the
 * browser's script then takes over and redraws the same markup.
 *
 * - Only paths and languages that exist are rendered (the caller checks), results are cached for
 *   `ttlMs` and bounded.
 * - One render at a time, one shared browser that closes itself when idle.
 * - The renderer's requests carry a secret header so the page handler never nests a render in a
 *   render.
 * - If Chromium is not available, `get` resolves to null and the plain shell is served: SSR is an
 *   optimisation, never a dependency.
 * - A "frame" is the page of a person who is signed in (or, for the "visitor" frame, of a visitor whose page waits for
 *   what a link in its address says: the address then carries a made-up one), drawn before its data arrives: the same views run as a
 *   made-up signed-in person (an administrator for the "staff" frame) whose own requests are answered with empty
 *   lists and whose page requests are held, so the capture is what every such person sees first (the title, the
 *   introduction, the skeleton of the page), the same for all of them. The browser's script then takes over and
 *   fills it with the person's data (see platform/http/pages.js).
 */
export function createPrerenderer({
  launch,
  baseUrl,
  logger,
  ttlMs = 10 * 60 * 1000,
  maxEntries = 400,
  idleMs = 3 * 60 * 1000,
  timeoutMs = 20000,
  now = Date.now,
  registration = true
}) {
  const ctx = { launch, idleMs, baseUrl, timeoutMs, now, ttlMs, maxEntries, logger, registration };
  bindTo(ctx, prerenderParts);
  ctx.token = randomBytes(16).toString("hex");
  ctx.cache = new Map(); // key -> { value, expires } (insertion order = LRU order)
  ctx.pending = new Map(); // key -> Promise
  ctx.failures = new Map(); // key -> retry time
  ctx.browser = null;
  ctx.idleTimer = null;
  ctx.chain = Promise.resolve();
  ctx.closed = false;

  return {
    token: ctx.token,
    get: ctx.get,
    warm: ctx.warm,
    invalidate: ctx.invalidate,
    size: ctx.size,
    close: ctx.close
  };
}
