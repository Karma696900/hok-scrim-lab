// The tier lists page: one module, downloaded when somebody opens it (app/lazy-pages.js); it installs what listens to the
// board (drag and drop, keys) and to its buttons, once.
import { app, watchVideos } from "../../lib/dom.js";
import { installTierListsActions } from "./tier-list-actions.js";
import { installTierLists, renderTierLists } from "./tier-list-view.js";

export function createTierListsPage() {
  installTierLists();
  installTierListsActions();
  return {
    show() {
      renderTierLists();
      watchVideos(app);
    }
  };
}
