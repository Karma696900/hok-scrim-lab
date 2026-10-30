// The history page and the export of a series: one module, downloaded when somebody opens one of them (app/lazy-pages.js);
// it installs what listens to their buttons, once.
import { state } from "../../app/app-state.js";
import { app, watchVideos } from "../../lib/dom.js";
import { installExportDialog } from "./export.js";
import { installHistoryActions } from "./history-actions.js";
import { loadHistory, renderHistory } from "./history-view.js";

export function createHistoryPages() {
  installHistoryActions();
  installExportDialog();
  return {
    /** Draws the page; returns the loading of the history when this call started it (the page is whole once it is done). */
    show() {
      const loading = !state.history && !state.historyLoading ? loadHistory() : null;
      renderHistory();
      watchVideos(app);
      return loading;
    }
  };
}
