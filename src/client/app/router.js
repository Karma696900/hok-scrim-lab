import { AUTH_VIEWS, SITE_NAME, matchRoute, pathFor } from "../../shared/routes.js";
import { t } from "./browser-i18n.js";
import { api } from "./api-client.js";
import { contentReady } from "../domain/staff-content.js";
import { dataFor, dataLoaded } from "./roster-data.js";
import { app, tell } from "../lib/dom.js";
import { authPagesPromise, loadAuthPages, loadHeroes, loadScrims } from "./lazy-pages.js";
import { LAZY_VIEWS } from "./lazy-views.js";
import { renderNotFound } from "./status-pages.js";
import { drawnView, wholeStylesheet } from "./stylesheet-loading.js";
import { loadPreferences } from "./menu-preferences.js";
import { state } from "./app-state.js";
import { highlightNavigation, setMenu } from "../shell/menu.js";
import { onClick } from "./event-actions.js";

function setTitle() {
  const route = matchRoute(location.pathname);
  let title = route.route.title ? t(route.route.title, { site: SITE_NAME }) : SITE_NAME;
  if (state.view === "hero" && state.heroSheet?.hero) {
    title = t("{name} — Honor of Kings Global hero guide | {site}", {
      name: state.heroSheet.hero.displayName || state.heroSheet.hero.name,
      site: SITE_NAME
    });
  }
  document.title = title;
}

/** Keeps the address bar in step with the view (real, shareable URLs). */
function syncUrl() {
  const target = pathFor({
    view: state.view,
    heroId: state.selectedHeroId,
    guideHeroId: state.guideHeroId,
    seriesId: state.activeSeriesId,
    teamId: state.activeTeamId,
    tag: state.activePlayerTag,
    section: state.view === "popular" ? state.popularSection : state.trainingSection
  });
  if (location.pathname !== target) {
    history.pushState(null, "", target);
  }
}

/**
 * A page the server drew carries the CSS of its first screen only (app/stylesheet-loading.js): any other view
 * waits for the whole stylesheet, so that nothing is drawn unstyled.
 */
const styledFor = view => (view === drawnView ? undefined : wholeStylesheet());

/** Starts a view's page (once); the page, when it is already there. */
const startPage = lazy => lazy.loader()();
const pageIfThere = lazy => lazy.loader().ready();

/**
 * What a view needs besides its data, started at once: its page (already on its way, preloaded with the HTML) and
 * the translation of what the staff wrote. They no longer wait for the data and the preferences to arrive first:
 * everything is on its way together, and the page is drawn when the last of them is there.
 */
function startView(view) {
  const lazy = LAZY_VIEWS[view];
  if (lazy) {
    startPage(lazy);
  }
  if (lazy?.content) {
    contentReady();
  }
}

/** Puts the state in the shape a URL describes. Data that is not loaded yet is fetched. */
export async function applyRoute(route) {
  state.view = route.view;
  if (!AUTH_VIEWS.includes(route.view)) {
    const asked = route.view;
    startView(asked);
    const [failure] = await Promise.all([dataFor(asked), loadPreferences()]);
    if (failure) {
      throw failure;
    }
    if (state.auth.user && !state.onboarded && !welcomeOffered && route.view !== "welcome") {
      // First visit with this account: the welcome pages come first, once.
      welcomeOffered = true;
      history.replaceState(null, "", "/welcome");
      route = matchRoute("/welcome");
      state.view = route.view;
    }
    if (firstRoute) {
      // The first page of a visit: someone who chose another start page lands there instead of the
      // overview.
      firstRoute = false;
      if (route.view === "home" && state.settings.startPage !== "/") {
        history.replaceState(null, "", state.settings.startPage);
        route = matchRoute(state.settings.startPage);
        state.view = route.view;
      }
    }
    if (route.view !== asked) {
      // sent elsewhere (the welcome pages, the start page of the person): that page needs its own
      startView(route.view);
      const moved = await dataFor(route.view);
      if (moved) {
        throw moved;
      }
    }
  }
  if (route.view === "live") {
    // The draft in progress (the first active series), or the series list with a hint when there is
    // none.
    const live = state.series.find(item => item.status === "active");
    if (!live) {
      tell(t("No draft in progress. Create a series to start one."));
    }
    history.replaceState(null, "", live ? `/scrims/${encodeURIComponent(live.id)}` : "/scrims");
    return applyRoute(matchRoute(location.pathname));
  }
  await styledFor(route.view);
  if (route.view === "hero") {
    await (await loadHeroes()).openHero(route.heroId);
    return;
  }
  state.activeTeamId = route.view === "team" ? route.teamId : null;
  state.activePlayerTag = route.view === "player" ? route.tag : null;
  state.trainingSection = route.view === "training" ? (route.section ?? "") : "";
  state.popularSection = route.view === "popular" ? (route.section ?? "") : "";
  state.guideHeroId = route.view === "guides" ? (route.guideHeroId ?? null) : null;
  if (route.view === "scrims" && route.seriesId) {
    state.activeSeriesId = route.seriesId;
    if (!state.series.some(item => item.id === route.seriesId)) {
      await (await loadScrims()).paintSeriesFrame(); // the room, empty, while the series is on its way
      try {
        const opened = await api(`/api/series/${encodeURIComponent(route.seriesId)}`);
        state.series = [opened, ...state.series];
      } catch (error) {
        tell(error.message);
        state.activeSeriesId = null;
        history.replaceState(null, "", "/scrims");
      }
    }
  } else if (route.view === "scrims") {
    state.activeSeriesId = null;
  }
  if (!AUTH_VIEWS.includes(route.view) && route.view !== "not-found") {
    authPagesPromise?.then(pages => pages.reset());
  }
  render();
}

export function go(path, { replace = false, force = false } = {}) {
  const current = location.pathname + location.search;
  if (current !== path || force) {
    history[replace ? "replaceState" : "pushState"](null, "", path);
  }
  setMenu(false);
  return applyRoute(matchRoute(location.pathname)).catch(error => tell(error.message));
}

/** The account pages and the not-found page: the promise of their drawing, or null for any other view. */
function renderSpecial() {
  if (AUTH_VIEWS.includes(state.view)) {
    syncUrl();
    setTitle();
    return loadAuthPages().then(pages => pages.render(app, state.view));
  }
  if (state.view === "not-found") {
    document.title = t("Page not found | {site}", { site: SITE_NAME });
    renderNotFound(app);
    return Promise.resolve();
  }
  return null;
}

// Entrance motion: only when the visitor moves to another page (not on the first paint, not on
// every re-render of the same page).
let lastViewKey = null;

const calmMotion = () =>
  document.documentElement.classList.contains("reduce-motion") ||
  matchMedia("(prefers-reduced-motion: reduce)").matches;

function animateEntrance() {
  const key = `${state.view}:${state.selectedHeroId ?? ""}:${state.activeSeriesId ?? ""}`;
  const first = lastViewKey === null;
  const changed = key !== lastViewKey;
  lastViewKey = key;
  if (first || !changed || calmMotion()) {
    app.classList.remove("is-entering");
    return;
  }
  app
    .querySelectorAll(".hero-card, .hcard, .stat, .tier-row")
    .forEach((element, index) =>
      element.style.setProperty(
        "--n",
        String(Math.min(index, element.matches(".hero-card, .hcard") ? 30 : 8))
      )
    );
  app.classList.remove("is-entering");
  void app.offsetWidth; // restart the animations
  app.classList.add("is-entering");
}

let welcomeOffered = false;

/** The scrims pages are there, with the code of the draft room, and a game whose clock ran out has been resolved. */
let scrimsPrepared = false;

let firstRoute = true;

/** What the last render() has to do before the page is on the screen (see pageShown). */
let shown = Promise.resolve();

/**
 * Settles once the page the last render() started has been drawn: at once when it was drawn on the spot, later
 * when its code, its data or its translation had to arrive first. main.js sets html[data-ready] after it.
 */
export const pageShown = () => shown;

/** Draws the page of the current view. Returns the promise of its drawing, for whoever wants to wait for it. */
export function render() {
  shown = Promise.resolve(draw());
  return shown;
}

function draw() {
  if (!AUTH_VIEWS.includes(state.view) && !dataLoaded(state.view)) {
    // an action opened a page from another one (New series from the overview): what that page reads is fetched first
    const view = state.view;
    return dataFor(view).then(failure => {
      if (failure) {
        tell(failure.message);
        return undefined;
      }
      return state.view === view ? render() : undefined;
    });
  }
  // A series whose draft is in progress belongs to "Live draft" in the menu, the others to Scrims.
  const open = state.series.find(item => item.id === state.activeSeriesId);
  highlightNavigation(state.view === "scrims" && open?.status === "active" ? "live" : state.view);
  if (!AUTH_VIEWS.includes(state.view)) {
    delete app.dataset.ssr;
  } // the account pages remove it themselves once they have drawn
  if (state.view === "scrims" && !scrimsPrepared) {
    if (!app.querySelector(".series-board")) {
      app.innerHTML = `<div class="loading-line"></div>`;
    }
    return loadScrims()
      .then(page => page.prepare())
      .then(() => {
        scrimsPrepared = true;
        return render();
      });
  }
  const special = renderSpecial();
  if (special) {
    animateEntrance();
    return special;
  }
  syncUrl();
  setTitle();
  if (state.view !== "home") {
    state.overview = null;
  } // fresh server numbers each time Overview is opened
  if (state.view !== "history") {
    state.history = null;
  }
  const lazy = LAZY_VIEWS[state.view] ?? LAZY_VIEWS.home; // every view of the table of routes has its page
  const page = lazy.content ? null : pageIfThere(lazy);
  if (page) {
    // the page is there already: it is drawn now, so that what an action does right after render() finds it
    const drawn = lazy.show(page);
    animateEntrance();
    return drawn;
  }
  return Promise.all([startPage(lazy), lazy.content ? contentReady() : null]).then(([loaded]) => {
    // (a page that draws first and reads afterwards returns what it waits for, so that the page is "shown" with its data)
    const drawn = lazy.show(loaded);
    animateEntrance();
    return drawn;
  });
}

export function installNavigation() {
  // A button that opens a view (the navigation links are handled below).
  onClick(
    "[data-view]",
    viewButton => {
      state.view = viewButton.dataset.view;
      state.activeSeriesId = null;
      render();
    },
    viewButton => viewButton.tagName !== "A"
  );

  // Internal links navigate without a reload (real URLs); modified clicks keep their normal browser
  // behaviour.
  document.addEventListener("click", event => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const link = event.target.closest("a[href^='/']");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) {
      return;
    }
    const url = new URL(link.href);
    if (
      url.origin !== location.origin ||
      url.pathname.startsWith("/auth/") ||
      url.pathname.startsWith("/api/")
    ) {
      return;
    }
    if (matchRoute(url.pathname).view === "not-found") {
      return;
    }
    event.preventDefault();
    if (link.matches(".nav-link, .tab")) {
      state.activeSeriesId = null;
      if (link.dataset.view !== "hero") {
        state.selectedHeroId = null;
      }
    }
    go(url.pathname + url.search);
  });

  window.addEventListener("popstate", () => {
    applyRoute(matchRoute(location.pathname)).catch(error => tell(error.message));
  });
}
