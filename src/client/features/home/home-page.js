// The overview page: one module, downloaded when somebody opens it (app/lazy-pages.js); it installs what listens to its
// buttons and to its banner, once.
import { state } from "../../app/app-state.js";
import { app, watchVideos } from "../../lib/dom.js";
import { installHome, startBanner } from "./home-actions.js";
import { loadOverview, renderHome } from "./home-view.js";

export function createHomePage() {
  installHome();
  return {
    /** Draws the page; returns the loading of the overview when this call started it (the page is whole once it is done). */
    show() {
      const loading = !state.overview && !state.overviewLoading ? loadOverview() : null;
      renderHome();
      watchVideos(app);
      if (state.overview) {
        startBanner();
      }
      return loading;
    }
  };
}
