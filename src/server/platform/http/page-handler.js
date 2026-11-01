import { icon } from "../../../shared/icons.js";
import { languageInfo } from "../../../shared/i18n.js";
import { SITE_NAME, visitorAccountButtons } from "../../../shared/routes.js";
import { requestLanguage, tr } from "../server-i18n.js";
import { BOOT_SCRIPT, BOOT_SCRIPT_HASH, safeJson } from "./first-paint.js";
import { requestDisplay } from "./display-cookies.js";
import { contentSecurityPolicy } from "./security-headers.js";
import { botsSockets } from "../../features/simulation/bots-link.js";
import { WEB } from "./web-root.js";
import { OG_LOCALES, ROOM_FRAME_VIEW, SESSION_COOKIE } from "./page-handler-views.js";
import {
  assets,
  dataCalls,
  lazyFor,
  loadCriticalCss,
  loadManifest
} from "./page-handler-assets.js";
import { escapeHtml } from "./page-handler-shared.js";
import { structuredData } from "./page-handler-seo.js";
import { addressesOf, localizeLinks, sentToLanguageAddress } from "./page-handler-language.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as pageHandlerParts } from "./page-handler-parts.js";
import { decidePage } from "./page-handler-decide.js";

// the bots server, where the live games of /simulation are played (its socket is outside this origin)
const SOCKETS = botsSockets();

export { SSR_VIEWS } from "./page-handler-views.js";
export { FRAME_VIEWS } from "./page-handler-views.js";
export { TRAINING_PATHS } from "./page-handler-views.js";
export { ROOM_FRAME_PATH } from "./page-handler-views.js";
export { ROOM_FRAME_VIEW } from "./page-handler-views.js";
export { VISITOR_FRAME_VIEWS } from "./page-handler-views.js";
export { FRAME_PATHS } from "./page-handler-views.js";
export { loadManifest } from "./page-handler-assets.js";
export { readStylesheet } from "./page-handler-assets.js";
export { loadFirstPaintCss } from "./page-handler-assets.js";
export { loadCriticalCss } from "./page-handler-assets.js";
export { createSeoHandlers } from "./page-handler-seo.js";

/**
 * Serves the app shell for every real route with ITS OWN title, description, canonical URL and
 * robots directive, and answers 404 (with the shell, so the client can show its not-found page) for
 * unknown addresses.
 */
export function createPageHandler({
  web = WEB,
  store,
  config,
  critical = loadCriticalCss(web),
  prerender = null,
  bootstrap = null
}) {
  const ctx = { web, config, store };
  bindTo(ctx, pageHandlerParts);
  const files = assets(loadManifest(ctx.web));
  ctx.template = null;

  // the inline stylesheet of each view the server draws, read when the view is first drawn
  ctx.firstPaint = new Map();

  return async function page(request, response, next) {
    try {
      const language = request.language ?? requestLanguage(request);
      if (sentToLanguageAddress(request, response, language, prerender)) {
        return;
      }
      const { info, session, matched, inRoom, isFrame, drawn } = await decidePage(
        ctx,
        request,
        language,
        { prerender, bootstrap }
      );
      // The inline stylesheet: the critical one, or (a page drawn) the one of its first screen, which
      // the policy of the response then allows by its hash instead of the critical one alone.
      const inline = drawn ? ctx.inlineCss(inRoom ? ROOM_FRAME_VIEW : matched.view) : critical;
      if (drawn) {
        response.setHeader(
          "Content-Security-Policy",
          contentSecurityPolicy([inline.hash], [BOOT_SCRIPT_HASH], SOCKETS)
        );
      }
      const display = requestDisplay(request, language);
      const modules = [
        ...files.modules,
        ...lazyFor(files, matched.view),
        ...(language === "en" ? [] : [`/locales/${language}.js`])
      ];
      const calls = dataCalls(matched, Boolean(session?.me));
      const base = ctx.origin(request);
      const structured = structuredData({ matched, info, base, language });
      const { canonical, alternates } = addressesOf(base, request, info);
      // One pass: a value that happens to contain a placeholder is never expanded again.
      const values = {
        TITLE: escapeHtml(info.title),
        DESCRIPTION: escapeHtml(info.description),
        CANONICAL: escapeHtml(canonical),
        ALTERNATES: alternates,
        // a private page stays out of the search engines: they never carry a session, so it is the page of someone who is
        // not signed in that says so (a person with a session reads their own page, which is no business of a crawler).
        // A page that does not exist does not say it: its 404 is what keeps it out of the index, and a noindex on top
        // only makes the audits of the crawlers (Lighthouse "is crawlable") fail a page that is meant to answer 404.
        ROBOTS:
          info.index || request.user || info.status === 404 ? "index, follow" : "noindex, nofollow",
        OG_IMAGE: escapeHtml(info.image || `${base}/og-image.png`),
        SITE_NAME: escapeHtml(SITE_NAME),
        CRITICAL_CSS: inline.css,
        LANG: language,
        DIR: display.direction,
        THEME: display.theme,
        // a page that arrives already drawn has no entrance animation (components/motion.css)
        FIRST_DRAW: drawn ? ' class="ssr-first"' : "",
        THEME_COLOR: display.themeColor,
        LANGUAGE_NAME: escapeHtml(languageInfo(language).name),
        OG_LOCALE: OG_LOCALES[language] ?? "en_US",
        BOOT: `<script type="application/json" id="boot">${safeJson({ e: files.entry, m: modules, f: calls, s: drawn ? "" : files.styles, w: drawn ? files.styles : "", i: info.banner ?? "", ...(session ? { b: session } : {}) })}</script>${structured}
    <script>${BOOT_SCRIPT}</script>${drawn ? "" : `<noscript><link rel="stylesheet" href="${files.styles}"></noscript>`}`
      };
      let html = (await ctx.shell())
        .replace(/{{t:([^}]+)}}/g, (_match, key) => escapeHtml(tr(language, key)))
        .replace(/{{i:([a-z0-9]+)(?: ([a-z0-9 -]+))?}}/g, (_match, name, extra) =>
          icon(name, extra)
        )
        .replace(
          /__(TITLE|DESCRIPTION|CANONICAL|ALTERNATES|ROBOTS|OG_IMAGE|SITE_NAME|CRITICAL_CSS|LANG|DIR|THEME|FIRST_DRAW|THEME_COLOR|LANGUAGE_NAME|OG_LOCALE|BOOT)__/g,
          (_match, key) => values[key]
        );
      if (!drawn?.account && !request.user && !SESSION_COOKIE.test(request.headers.cookie ?? "")) {
        // no top bar was drawn with the page, but the buttons of a visitor are known: the bar does not change size when the script starts
        html = html.replace(
          '<div id="account-control" class="account-control"></div>',
          () =>
            `<div id="account-control" class="account-control">${visitorAccountButtons(request.originalUrl, escapeHtml(tr(language, "Sign in")), config?.registrationEnabled === false ? "" : escapeHtml(tr(language, "Create account")))}</div>`
        );
      }
      if (drawn) {
        html = html
          .replace(
            '<main id="view" class="host app-view" tabindex="-1"></main>',
            () =>
              `<main id="view" class="host app-view" tabindex="-1" data-ssr="${isFrame ? "frame" : "1"}">${drawn.view}</main>`
          )
          .replace(
            '<div id="account-control" class="account-control"></div>',
            () => `<div id="account-control" class="account-control">${drawn.account}</div>`
          );
      }
      response
        .status(info.status)
        .type("html")
        .set(
          "Cache-Control",
          // a page that carries a person's session is theirs alone
          session
            ? "private, no-store"
            : info.status === 200 && info.index && !isFrame
              ? "public, max-age=300"
              : "no-store"
        )
        .send(localizeLinks(html, language));
    } catch (error) {
      next(error);
    }
  };
}
