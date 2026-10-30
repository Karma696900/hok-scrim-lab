// The entry point of the browser application: installs what listens (navigation, menus, actions of
// every feature), then loads the data of the visitor and draws the page the address asks for.
import "./app/language-start.js"; // the language catalog must be loaded before anything is drawn

import { AUTH_VIEWS, matchRoute } from "../shared/routes.js";
import { needsOf } from "../shared/view-registry.js";
import { installActions } from "./app/event-actions.js";
import { installLazyActions, loadHeroes } from "./app/lazy-pages.js";
import { api, fetchSeries, fetchTierLists } from "./app/api-client.js";
import { startData } from "./app/roster-data.js";
import { app, escapeHtml, tell } from "./lib/dom.js";
import { finishHydration, installHydration } from "./app/hydration.js";
import { t } from "./app/browser-i18n.js";
import { boot, installPageLoad, stylesReady } from "./app/stylesheet-loading.js";
import { applyRoute, go, installNavigation, pageShown } from "./app/router.js";
import { state } from "./app/app-state.js";
import { installAuthActions } from "./features/auth/auth-actions.js";
import { installSharingActions } from "./features/sharing/sharing-actions.js";
import { installAccount, renderAccountControl } from "./shell/account.js";
import { installMenu } from "./shell/menu.js";
import { installTopbar } from "./shell/topbar.js";

installHydration();
installPageLoad();
installNavigation();
installTopbar();
installMenu();
installAccount();
installActions();
installAuthActions();
installLazyActions(); // the buttons of the pages that are downloaded on demand
installSharingActions();

async function initialize() {
  // Anonymous visitors receive the first screen already drawn by the server (data-ssr): it stays
  // until the first real render replaces it.
  if (!app.dataset.ssr) {
    app.innerHTML = `<div class="loading-line"></div>`;
  }
  const route = matchRoute(location.pathname);
  try {
    const params = new URLSearchParams(location.search);
    const bare =
      AUTH_VIEWS.includes(route.view) &&
      route.view !== "account" &&
      !params.has("join") &&
      !params.has("invite");
    if (route.view === "hero") {
      loadHeroes().then(page => page.prefetch(route.heroId));
    }
    // A person who is signed in comes with the answer of /api/auth/me already in the page (boot.b): nothing to wait for
    const authRequest = boot.b?.me ? Promise.resolve(boot.b.me) : api("/api/auth/me");
    if (!bare) {
      startData(needsOf(route.view)); // beside the session: the page waits for what it reads, in applyRoute
    }
    state.auth = await authRequest;
    if (bare) {
      await stylesReady;
      renderAccountControl();
      await applyRoute(matchRoute(location.pathname)); // the roster loads behind the sign-in page, for its cover
      return;
    }
    await stylesReady;
    renderAccountControl();
    let joinedSeriesId = null;
    const invitationCode = params.get("join");
    if (invitationCode && !state.auth.user) {
      await go(`/login?next=${encodeURIComponent(`/?join=${invitationCode}`)}`, { replace: true });
      return;
    }
    if (invitationCode && state.auth.user) {
      try {
        const joined = await api(`/api/online/${encodeURIComponent(invitationCode)}/join`, {
          method: "POST"
        });
        state.series = await fetchSeries();
        joinedSeriesId = joined.id;
      } catch (error) {
        tell(error.message);
      }
      history.replaceState(null, "", "/");
    }
    const inviteToken = params.get("invite");
    let sharedView = null;
    if (inviteToken) {
      try {
        const accepted = await api("/api/invites/accept", {
          method: "POST",
          body: { token: inviteToken }
        });
        [state.series, state.tierLists] = await Promise.all([fetchSeries(), fetchTierLists()]);
        sharedView = accepted;
        tell(
          accepted.role === "owner"
            ? t("This is already yours")
            : accepted.role === "editor"
              ? t("Shared with you as editor")
              : t("Shared with you as viewer")
        );
      } catch (error) {
        tell(error.message);
      }
      history.replaceState(null, "", "/");
    }
    if (joinedSeriesId || sharedView?.kind === "series") {
      await go(`/scrims/${joinedSeriesId || sharedView.id}`, { replace: true });
      return;
    }
    if (sharedView?.kind === "tierList") {
      state.activeTierId = sharedView.id;
      await go("/tier-lists", { replace: true });
      return;
    }
    await applyRoute(matchRoute(location.pathname)); // where the visitor is now: they may have clicked a link while the page was starting
  } catch (error) {
    delete app.dataset.ssr;
    app.innerHTML = `<div class="note note--danger error-block">${t("The server could not load its data. {message}", { message: escapeHtml(error.message) })}</div>`;
  } finally {
    // A page the server drew came in without entrance animations (components/motion.css): they are back
    // once it has settled (later than the longest of them, so none starts again).
    setTimeout(() => document.documentElement.classList.remove("ssr-first"), 2500);
    setTimeout(finishHydration, 2500);
    await markReady();
  }
}

/** A page whose code or data does not arrive does not hold the flag for ever: it is set after this long anyway. */
const READY_LIMIT_MS = 5000;

/**
 * Sets html[data-ready] (read by the server-side renderer, platform/http/prerender.js, and by the tests) once the page
 * of the address has been drawn: a page that is downloaded on demand comes a little after the routing is done.
 */
async function markReady() {
  let limit;
  await Promise.race([
    pageShown().catch(() => {}),
    new Promise(resolve => {
      limit = setTimeout(resolve, READY_LIMIT_MS);
    })
  ]);
  clearTimeout(limit);
  document.documentElement.dataset.ready = "1";
}

initialize();
