// The built files a page needs: the manifest, the stylesheets, the first-paint packs, the scripts to preload.
import { AUTH_VIEWS } from "../../../shared/routes.js";
import { DATA_CALLS, needsOf } from "../../../shared/view-registry.js";
import { WEB } from "./web-root.js";
import { createHash } from "node:crypto";
import { firstPaintParts } from "./first-paint.js";
import path from "node:path";
import { readFileSync } from "node:fs";

/**
 * dist/manifest.json (written by `npm run build`), or null: then the pages load the sources of
 * client/ directly.
 */
export function loadManifest(web = WEB) {
  if (process.env.HOK_SOURCE_ASSETS === "true") {
    return null;
  } // tests and debugging: the sources, whatever has been built
  try {
    return JSON.parse(readFileSync(path.join(web.dist, "manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

/** The stylesheet as the page inlines it: without its comments (a built one has none already). */
const withoutComments = css => css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n{2,}/g, "\n");

/**
 * A stylesheet with its relative `@import`s replaced by the files they name: what the browser would
 * end up with.
 */
export function readStylesheet(file) {
  const text = readFileSync(file, "utf8").replaceAll("\r\n", "\n");
  return text.replace(/@import\s+(?:url\()?["']([^"']+)["']\)?\s*;?/g, (_match, target) =>
    readStylesheet(path.resolve(path.dirname(file), target))
  );
}

/**
 * Critical + the partials the first screen of `view` is drawn with (see first-paint.js), as one
 * inline block: for pages that arrive with their content already drawn (no unstyled flash). The rest
 * of the stylesheet follows right after the first paint.
 */
export function loadFirstPaintCss(view, web = WEB) {
  const built = loadManifest(web);
  const critical = loadCriticalCss(web).css;
  const styles = path.join(web.client, "styles");
  const file = built?.firstPaint?.[view];
  const rest = (
    file
      ? readFileSync(path.join(web.dist, file), "utf8").replaceAll("\r\n", "\n")
      : withoutComments(
          firstPaintParts(view, styles)
            .map(part => readStylesheet(path.join(styles, part)))
            .join("\n")
        )
  ).trim();
  // No web-font file is requested from the first paint (that would delay it): the fonts come in a
  // stylesheet of their own right after.
  const css = `${critical}\n${rest}`;
  return { css, hash: `sha256-${createHash("sha256").update(css).digest("base64")}` };
}

/**
 * The critical CSS is inlined in every page; its hash is what the CSP allows (and nothing else
 * inline).
 */
export function loadCriticalCss(web = WEB) {
  const built = loadManifest(web);
  // Built: one minified file. Sources: the partials the stylesheet imports, joined.
  const css = (
    built
      ? readFileSync(path.join(web.dist, built.critical), "utf8").replaceAll("\r\n", "\n")
      : withoutComments(readStylesheet(path.join(web.client, "styles", "critical.css")))
  ).trim();
  return { css, hash: `sha256-${createHash("sha256").update(css).digest("base64")}` };
}

/**
 * The API calls the page is about to make. They are preloaded (right after the first paint for a page the
 * server drew, see first-paint.js; with the HTML for the others) so the data is on its way while the script downloads.
 * The addresses are exactly those the client requests (shared/view-registry.js). A person who is signed in has
 * their session in the page already (bootstrap.js): no request for it.
 */
export function dataCalls(matched, bootstrapped) {
  const calls = bootstrapped ? [] : ["/api/auth/me"];
  if (matched.view === "login" || matched.view === "register") {
    calls.push("/api/auth/config");
  }
  if (!["login", "register", "mfa", "setup", "not-found"].includes(matched.view)) {
    calls.push(...needsOf(matched.view).map(name => DATA_CALLS[name]));
    if (matched.view === "home") {
      calls.push("/api/overview");
    }
    if (matched.view === "hero") {
      calls.push(`/api/heroes/${matched.heroId}`, `/api/heroes/${matched.heroId}/scrims`);
    }
  }
  return calls;
}

/** What the boot script loads: the built files when there are some, the sources otherwise. */
export function assets(manifest) {
  if (manifest) {
    return {
      entry: manifest.entry,
      modules: [manifest.entry, ...manifest.preload],
      lazy: manifest.lazy ?? {},
      pages: manifest.pages ?? {},
      styles: manifest.styles
    };
  }
  return {
    entry: "/main.js",
    modules: [
      "/main.js",
      "/shared/i18n.js",
      "/app/browser-i18n.js",
      "/shared/routes.js",
      "/domain/lanes.js",
      "/shared/media.js",
      "/shared/draft-model.js",
      "/domain/lanes.js"
    ],
    lazy: {
      auth: ["/features/auth/auth-pages.js"],
      draft: ["/features/draft/draft-view.js", "/features/draft/draft-editor.js"]
    },
    styles: "/styles/main.css"
  };
}

/** The lazy parts a route needs at once: the account pages, the draft board, the page of the view. */
export const lazyFor = (files, view) =>
  (AUTH_VIEWS.includes(view)
    ? files.lazy.auth
    : view === "scrims"
      ? [...(files.pages?.scrims ?? []), ...files.lazy.draft]
      : (files.pages?.[view] ?? [])) ?? [];
