// The scrims pages (the list of series, the board of a series, its draft room): one module, downloaded when somebody opens
// one of them or presses one of their buttons (app/lazy-pages.js); it installs what listens to them, once.
import { app, watchVideos } from "../../lib/dom.js";
import { installBoard, paintSeriesFrame, reloadSeries, renderScrims } from "./board.js";
import { installScrimsImport } from "./import.js";
import { installScrimsActions } from "./scrim-actions.js";
import { loadDraftModules, settleActiveSeries } from "./scrim-draft.js";

export function createScrimsPages() {
  installBoard();
  installScrimsActions();
  installScrimsImport();
  return {
    /** The draft room's code is there and a game whose clock ran out is resolved: the page can open on the real state. */
    prepare: () => loadDraftModules().then(settleActiveSeries),
    show() {
      renderScrims();
      watchVideos(app);
    },
    paintSeriesFrame,
    reloadSeries
  };
}
