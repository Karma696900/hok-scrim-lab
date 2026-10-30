import { LEGAL_VIEWS } from "../../shared/routes.js";
import { app } from "../lib/dom.js";
import {
  loadGuideEditor,
  loadBuildLab,
  loadCatalogPage,
  loadCommunity,
  loadOnboarding,
  loadGameData,
  loadHeroes,
  loadHistoryPages,
  loadHome,
  loadLegal,
  loadPopular,
  loadRatings,
  loadSettings,
  loadScrims,
  loadSpace,
  loadTeams,
  loadTierLists,
  loadTournaments,
  loadTraining
} from "./lazy-pages.js";
import { state } from "./app-state.js";

/**
 * The views whose page is downloaded when somebody opens it (the chunk is preloaded with the HTML): how to load the page,
 * whether the view draws what the staff wrote (it then waits for its translation, domain/staff-content.js), and how to
 * show it. The loaders are arrow functions: lazy-pages.js and app/router.js import each other, so a loader is only read
 * when a view is started.
 */
export const LAZY_VIEWS = {
  home: { loader: () => loadHome, show: page => page.show() },
  heroes: { loader: () => loadHeroes, show: page => page.showIndex() },
  hero: { loader: () => loadHeroes, show: page => page.showSheet() },
  "tier-lists": { loader: () => loadTierLists, show: page => page.show() },
  scrims: { loader: () => loadScrims, show: page => page.show() },
  history: { loader: () => loadHistoryPages, show: page => page.show() },
  "build-lab": { loader: () => loadBuildLab, content: true, show: page => page.show(app) },
  items: { loader: () => loadGameData, content: true, show: page => page.show(app, state.view) },
  arcana: { loader: () => loadGameData, content: true, show: page => page.show(app, state.view) },
  spells: { loader: () => loadGameData, content: true, show: page => page.show(app, state.view) },
  popular: { loader: () => loadPopular, show: page => page.show(app, state.popularSection) },
  ratings: { loader: () => loadRatings, show: page => page.show(app) },
  space: { loader: () => loadSpace, content: true, show: page => page.show(app) },
  "space-shared": { loader: () => loadSpace, content: true, show: page => page.showShared(app) },
  guides: {
    loader: () => loadGuideEditor,
    content: true,
    show: page => page.show(app, state.guideHeroId)
  },
  catalog: { loader: () => loadCatalogPage, show: page => page.show(app, state) },
  settings: { loader: () => loadSettings, show: page => page.show(app) },
  welcome: { loader: () => loadOnboarding, show: page => page.show(app) },
  training: {
    loader: () => loadTraining,
    content: true,
    show: page => page.show(app, state.trainingSection)
  },
  teams: { loader: () => loadTeams, show: page => page.show(app, null) },
  team: { loader: () => loadTeams, show: page => page.show(app, state.activeTeamId) },
  tournaments: { loader: () => loadTournaments, show: page => page.show(app) },
  ...Object.fromEntries(
    ["find", "inbox", "agenda", "discord", "player", "reports"].map(view => [
      view,
      {
        loader: () => loadCommunity,
        show: page => page.show(app, state.view, state.activePlayerTag)
      }
    ])
  ),
  ...Object.fromEntries(
    LEGAL_VIEWS.map(view => [
      view,
      { loader: () => loadLegal, show: page => page.show(app, state.view) }
    ])
  )
};
