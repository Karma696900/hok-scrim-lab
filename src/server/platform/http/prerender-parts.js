// prerender, small helpers: keyOf, withBrowser, render, start, and 6 more.

export const keyOf = (path, language, variant = "") =>
  `${variant ? `${variant} ` : ""}${language} ${path}`;

export async function withBrowser(ctx, work) {
  clearTimeout(ctx.idleTimer);
  ctx.browser ??= await ctx.launch();
  try {
    return await work(ctx.browser);
  } finally {
    ctx.idleTimer = setTimeout(() => {
      const old = ctx.browser;
      ctx.browser = null;
      old?.close().catch(() => {});
    }, ctx.idleMs);
    ctx.idleTimer.unref?.();
  }
}

export async function render(ctx, path, language, variant = "") {
  const base = typeof ctx.baseUrl === "function" ? ctx.baseUrl() : ctx.baseUrl;
  if (!base) {
    return null;
  }
  return ctx.withBrowser(async instance => {
    const context = await instance.newContext({
      viewport: { width: 412, height: 823 },
      locale: language,
      reducedMotion: "reduce",
      extraHTTPHeaders: { [PRERENDER_HEADER]: ctx.token }
    });
    try {
      await context.addCookies([{ name: "hok_lang", value: language, url: base }]);
      if (variant) {
        await context.route("**/api/**", route => frameAnswer(route, variant, ctx.registration));
      }
      const page = await context.newPage();
      // Pictures are not needed to know the markup, and the proxy would be asked for each one.
      await page.route(/\/media\/img|\/locales\/|\.(woff2?|mp4)(\?|$)/, route =>
        route.request().url().includes("/locales/") ? route.continue() : route.abort()
      );
      const response = await page.goto(`${base}${path}${variant === "visitor" ? "#frame" : ""}`, {
        waitUntil: "domcontentloaded",
        timeout: ctx.timeoutMs
      });
      if (!response || response.status() >= 500) {
        return null;
      }
      // A visitor's page is captured once it has its data (no loading bar left); a frame is the page BEFORE its data
      // (a skeleton under the title is what it holds): it is ready as soon as the page has drawn its heading. It does
      // not wait for html[data-ready]: that flag means "the page of the address is drawn", and a frame holds back
      // every request for data (frameAnswer), so the flag would only come with the client's own limit, 5 s later.
      await page.waitForFunction(
        variant
          ? () => (document.querySelector("#view h1")?.textContent.trim().length ?? 0) > 0
          : () =>
              document.documentElement.dataset.ready === "1" &&
              !document.querySelector("#view .loading-line") &&
              document.querySelector("#view").textContent.trim().length > 0,
        null,
        { timeout: variant ? FRAME_TIMEOUT_MS : ctx.timeoutMs }
      );
      if (variant) {
        await page.waitForTimeout(400); // what the page draws before its data is there, once it has settled
      } else {
        // a slot still [data-filling] (the banner art of the overview) is the largest picture of the page: in the
        // captured markup, the browser fetches it with the HTML; past the limit the page is captured without it
        await page
          .waitForFunction(() => !document.querySelector("#view [data-filling]"), null, {
            timeout: FILL_TIMEOUT_MS
          })
          .catch(() => {});
      }
      // Inline style attributes are not allowed by the CSP (they would only be tones and
      // animation delays: the client redraws them).
      const result = await page.evaluate(() => {
        const clean = element => {
          if (!element) {
            return "";
          }
          const copy = element.cloneNode(true);
          for (const node of copy.querySelectorAll("[style]")) {
            node.removeAttribute("style");
          }
          for (const node of copy.querySelectorAll('video[src], img[src^="blob:"]')) {
            node.removeAttribute("src");
          }
          return copy.innerHTML;
        };
        return {
          view: clean(document.querySelector("#view")),
          account: clean(document.querySelector("#account-control"))
        };
      });
      // a frame is the same for every person: the chip of the person is theirs, the browser draws it
      return result.view && !result.view.includes("error-block")
        ? { view: result.view, account: variant ? "" : result.account }
        : null;
    } finally {
      await context.close().catch(() => {});
    }
  });
}

export function start(ctx, path, language, variant = "") {
  const key = keyOf(path, language, variant);
  let promise = ctx.pending.get(key);
  if (promise) {
    return promise;
  }
  promise = (ctx.chain = ctx.chain.then(async () => {
    if (ctx.closed) {
      return null;
    }
    try {
      const value = await ctx.render(path, language, variant);
      if (value) {
        ctx.cache.delete(key);
        ctx.cache.set(key, { value, expires: ctx.now() + ctx.ttlMs });
        ctx.failures.delete(key);
        while (ctx.cache.size > ctx.maxEntries) {
          ctx.cache.delete(ctx.cache.keys().next().value);
        }
      } else {
        ctx.failures.set(key, ctx.now() + (variant ? FRAME_RETRY_MS : 60_000));
      }
      return value;
    } catch (error) {
      ctx.failures.set(key, ctx.now() + (variant ? FRAME_RETRY_MS : 60_000));
      ctx.logger?.warn("prerender failed", { path, language, variant, reason: error.message });
      return null;
    }
  })).finally(() => ctx.pending.delete(key));
  ctx.pending.set(key, promise);
  return promise;
}

/**
 * The captured markup of a path in a language, or null. A cached copy is returned at once (and
 * refreshed in the background when it is old); otherwise the render is awaited for at most
 * `waitMs`, then the visitor gets the plain shell.
 */
export async function get(ctx, path, language, { waitMs = 3500, variant = "" } = {}) {
  if (ctx.closed) {
    return null;
  }
  const key = keyOf(path, language, variant);
  const hit = ctx.cache.get(key);
  if (hit) {
    if (hit.expires <= ctx.now()) {
      void ctx.start(path, language, variant);
    }
    return hit.value;
  }
  if ((ctx.failures.get(key) ?? 0) > ctx.now()) {
    return null;
  }
  const work = ctx.start(path, language, variant);
  return Promise.race([
    work,
    new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), waitMs);
      timer.unref?.();
    })
  ]);
}

/** Renders the given paths in the background (start-up warm-up). */
export function warm(ctx, paths, languages = ["en"], { variant = "" } = {}) {
  for (const language of languages) {
    for (const path of paths) {
      void ctx.start(path, language, variant);
    }
  }
}

/** Drops what was captured (the roster or a hero sheet changed). */
export function invalidate(ctx) {
  ctx.cache.clear();
}

export const size = ctx => ctx.cache.size;

export async function close(ctx) {
  ctx.closed = true;
  clearTimeout(ctx.idleTimer);
  await ctx.chain.catch(() => {});
  await ctx.browser?.close().catch(() => {});
  ctx.browser = null;
}

export const PRERENDER_HEADER = "x-hok-prerender";

/** How long a frame may take to draw, and how long a view that drew nothing is left alone before it is tried again. */
const FRAME_TIMEOUT_MS = 6000;
const FILL_TIMEOUT_MS = 3000;

const FRAME_RETRY_MS = 5 * 60 * 1000;

/** The made-up person of a frame: nothing personal, an administrator and editor for the "staff" frame. */
const frameUser = staff => ({
  id: "frame",
  name: "",
  tag: "",
  email: "",
  picture: "",
  avatarKind: "none",
  hasGooglePhoto: false,
  isAdmin: staff,
  isEditor: staff,
  viaGoogle: false,
  emailVerified: true,
  mfa: false
});

const reply = (route, body) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

/**
 * How the renderer answers the requests of a frame: the session and the preferences of the made-up person, empty
 * lists for what is theirs, the roster and the translations as they are (they are the same for everybody), and
 * nothing at all for the rest, which stays pending until the capture is taken: a page that draws before its data
 * arrives is what the frame holds.
 */
function frameAnswer(route, variant, registration) {
  const { pathname } = new URL(route.request().url());
  if (pathname === "/api/auth/me") {
    return reply(route, {
      enabled: true,
      user: variant === "visitor" ? null : frameUser(variant === "staff"),
      guest: false,
      registration,
      minSampleGames: 30
    });
  }
  if (pathname === "/api/me/preferences") {
    return reply(route, { modules: null, onboarded: true, settings: {} });
  }
  if (pathname === "/api/community/summary") {
    return reply(route, { unreadNotifications: 0, awaitingRequests: 0, openPosts: 0 });
  }
  if (pathname === "/api/series" || pathname === "/api/tier-lists") {
    return reply(route, { total: 0, page: 1, pageSize: 100, items: [] });
  }
  if (pathname === "/api/heroes" || pathname === "/api/content-translations") {
    return route.continue();
  }
  return new Promise(() => {}); // held: the page waits for its data
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { withBrowser, render, start, get, warm, invalidate, size, close };
