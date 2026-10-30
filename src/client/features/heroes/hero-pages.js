// The pages of the heroes: the index (/heroes) and the sheet of a hero (/heroes/<id>). One module, downloaded when somebody
// opens one of them (app/lazy-pages.js); it installs what listens to their buttons, once.
import { state } from "../../app/app-state.js";
import { app, watchVideos } from "../../lib/dom.js";
import { installHeroesActions } from "./hero-actions.js";
import { refreshDetailsStatus, renderHeroes } from "./hero-list.js";
import { loadCatalog, openHero, prefetchHeroSheet, renderHeroSheet } from "./hero-sheet.js";

export function createHeroesPages() {
  installHeroesActions();
  return {
    showIndex() {
      if (state.auth.user?.isAdmin && !state.competitiveLoaded) {
        state.competitiveLoaded = true;
        refreshDetailsStatus();
      }
      renderHeroes();
      watchVideos(app);
    },
    showSheet() {
      renderHeroSheet();
      watchVideos(app);
    },
    openHero,
    prefetch: prefetchHeroSheet,
    loadCatalog
  };
}
