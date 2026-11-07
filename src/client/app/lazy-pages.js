import { api } from "./api-client.js";
import { escapeHtml, tell } from "../lib/dom.js";
import { hydration } from "./hydration.js";
import { applyModules, applySettings, saveLocal } from "./menu-preferences.js";
import { onLazyActions } from "./event-actions.js";
import { LAZY_ACTIONS } from "./lazy-actions.js";
import { go, render } from "./router.js";
import { state } from "./app-state.js";

// The heavy pages are only downloaded when somebody opens one. Each loader imports the page module (a literal
// dynamic import, which is what the build and view-modules.test.js read), builds the page once with what
// it needs of the application, and gives the same page to every later call. A module takes from this set what it uses.
const app = () => ({
  hydration,
  api: (...args) => api(...args),
  escapeHtml,
  tell: message => tell(message),
  go: path => go(path),
  state
});
// `loader.ready()` is the page once it is there (a page that is already loaded is drawn at once, without waiting a turn).
const lazy = (load, build) => {
  let promise = null;
  let built = null;
  const loader = () =>
    (promise ??= load().then(module => {
      built = build(module, app());
      return built;
    }));
  loader.ready = () => built;
  return loader;
};

// The account pages: their promise is also read by the click handler and the router.
export let authPagesPromise = null;
export const loadAuthPages = () =>
  (authPagesPromise ??= import("../features/auth/auth-pages.js").then(module =>
    module.createAuthPages(app())
  ));

export const loadHome = lazy(
  () => import("../features/home/home-page.js"),
  (module, parts) => module.createHomePage(parts)
);
export const loadHistoryPages = lazy(
  () => import("../features/history/history-page.js"),
  (module, parts) => module.createHistoryPages(parts)
);
export const loadTierLists = lazy(
  () => import("../features/tier-lists/tier-list-page.js"),
  (module, parts) => module.createTierListsPage(parts)
);
export const loadScrims = lazy(
  () => import("../features/scrims/scrims-page.js"),
  (module, parts) => module.createScrimsPages(parts)
);
export const loadHeroes = lazy(
  () => import("../features/heroes/hero-pages.js"),
  (module, parts) => module.createHeroesPages(parts)
);
export const loadTeams = lazy(
  () => import("../features/teams/team-page.js"),
  (module, parts) => module.createTeamsPage(parts)
);
export const loadCommunity = lazy(
  () => import("../features/community/community-pages.js"),
  (module, parts) => module.createCommunityPages(parts)
);
export const loadTournaments = lazy(
  () => import("../features/tournaments/tournament-page.js"),
  (module, parts) => module.createTournamentsPage(parts)
);
export const loadBuildLab = lazy(
  () => import("../features/build-lab/build-lab-page.js"),
  (module, parts) => module.createBuildLab(parts)
);
export const loadGameData = lazy(
  () => import("../features/gamedata/gamedata-page.js"),
  (module, parts) => module.createGameDataPages(parts)
);
export const loadPublicTierList = lazy(
  () => import("../features/tier-list/tier-list-public-page.js"),
  (module, parts) => module.createPublicTierList(parts)
);
export const loadPopular = lazy(
  () => import("../features/popular/popular-page.js"),
  (module, parts) => module.createPopularPages(parts)
);
export const loadSpace = lazy(
  () => import("../features/space/space-page.js"),
  (module, parts) => module.createSpacePages(parts)
);
export const loadRatings = lazy(
  () => import("../features/ratings/rating-editor.js"),
  (module, parts) => module.createRatingsEditor(parts)
);
export const loadGuideEditor = lazy(
  () => import("../features/guides/guide-editor.js"),
  (module, parts) => module.createGuideEditor(parts)
);
export const loadCatalogPage = lazy(
  () => import("../features/catalog/catalog-page.js"),
  (module, parts) => module.createCatalogPage(parts)
);
export const loadSettings = lazy(
  () => import("../features/settings/settings-page.js"),
  (module, parts) => module.createSettingsPage({ ...parts, applyModules, applySettings, saveLocal })
);
export const loadOnboarding = lazy(
  () => import("../features/settings/onboarding.js"),
  (module, parts) => module.createOnboarding({ ...parts, applyModules })
);
export const loadTraining = lazy(
  () => import("../features/training/training-pages.js"),
  (module, parts) => module.createTrainingPages(parts)
);
export const loadSimulation = lazy(
  () => import("../features/simulation/simulation-page.js"),
  (module, parts) => module.createSimulationPage(parts)
);
export const loadCasino = lazy(
  () => import("../features/casino/casino-page.js"),
  (module, parts) => module.createCasinoPage(parts)
);
export const loadLegal = lazy(
  () => import("../features/legal/legal-page.js"),
  (module, parts) => module.createLegalPages(parts)
);
export const loadDevelopers = lazy(
  () => import("../features/developers/developers-page.js"),
  (module, parts) => module.createDevelopersPages(parts)
);

// The hero data editor (administrators): once a hero is saved, the sheet on screen and the catalogue are refreshed.
export const loadHeroEditor = lazy(
  () => import("../features/heroes/hero-editor.js"),
  (module, parts) =>
    module.createHeroEditor({
      ...parts,
      onSaved: profile => {
        if (state.heroSheet) {
          state.heroSheet = { ...state.heroSheet, profile };
          render();
        }
        loadHeroes()
          .then(page => page.loadCatalog(true))
          .then(catalog => {
            state.catalog = catalog;
          })
          .catch(() => {});
      }
    })
);

/** The buttons of these pages work from any page: the first click brings the page that answers them. */
export function installLazyActions() {
  const loaders = {
    heroes: loadHeroes,
    scrims: loadScrims,
    history: loadHistoryPages,
    home: loadHome,
    tierLists: loadTierLists
  };
  for (const [feature, { names }] of Object.entries(LAZY_ACTIONS)) {
    onLazyActions(names, loaders[feature]);
  }
}
