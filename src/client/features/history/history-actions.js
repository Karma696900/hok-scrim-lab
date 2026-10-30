import { onAction, onChange, onSubmit } from "../../app/event-actions.js";
import { t } from "../../app/browser-i18n.js";
import { api } from "../../app/api-client.js";
import { tell } from "../../lib/dom.js";
import { parseDuration } from "../../lib/format.js";
import { render } from "../../app/router.js";
import { state } from "../../app/app-state.js";
import { sinceOf } from "../heroes/hero-stats.js";
import { openExportDialog } from "./export.js";
import { loadScrims } from "../../app/lazy-pages.js";

export function installHistoryActions() {
  onAction("export-pdf", () => {
    openExportDialog({ bulk: true });
  });

  onAction("history-page", button => {
    state.historyPage = Number(button.dataset.page);
    state.history = null;
    render();
  });

  onAction("hero-page", button => {
    state.heroPage = Number(button.dataset.page);
    state.history = null;
    render();
  });

  onAction("history-reset", () => {
    state.historyFilters = { status: "", mode: "", q: "", from: "", to: "" };
    state.historyPage = 1;
    state.heroPage = 1;
    state.heroSearch = "";
    state.heroOrder = "presence";
    state.history = null;
    render();
  });

  // a period of the filter card fills the first day of the dates (nothing for "all time")
  onAction("history-range", button => {
    state.historyFilters = {
      ...state.historyFilters,
      from: sinceOf({ kind: button.dataset.range }) ?? "",
      to: ""
    };
    state.historyPage = 1;
    state.heroPage = 1;
    state.history = null;
    render();
  });

  onAction("open-export", button => {
    openExportDialog({ seriesId: button.dataset.seriesId, name: button.dataset.name });
  });

  onChange(
    event => event.target.classList.contains("history-duration"),
    async event => {
      const seconds = parseDuration(event.target.value);
      const series = state.series.find(item => item.id === event.target.dataset.seriesId);
      const game = series?.games[Number(event.target.dataset.gameIndex)];
      if (game && seconds !== null) {
        await api(
          `/api/series/${encodeURIComponent(series.id)}/games/${Number(event.target.dataset.gameIndex)}`,
          { method: "PATCH", body: { durationSeconds: seconds, expectedVersion: series.version } }
        );
        await (await loadScrims()).reloadSeries(series.id);
        tell(t("Game duration updated"));
      } else {
        tell(t("Use MM:SS, for example 24:37"));
      }
    }
  );

  onSubmit(
    event => event.target.id === "history-filter-form",
    event => {
      event.preventDefault();
      const form = new FormData(event.target);
      state.historyFilters = Object.fromEntries(
        ["status", "mode", "q", "from", "to"].map(key => [key, String(form.get(key) ?? "").trim()])
      );
      state.historyPage = 1;
      state.heroPage = 1;
      state.history = null;
      render();
      return;
    }
  );

  onSubmit(
    event => event.target.id === "hero-stats-form",
    event => {
      event.preventDefault();
      const form = new FormData(event.target);
      state.heroSearch = String(form.get("hero") ?? "").trim();
      state.heroOrder = String(form.get("order") ?? "presence");
      state.heroPage = 1;
      state.history = null;
      render();
      return;
    }
  );
}
