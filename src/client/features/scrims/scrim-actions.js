import { onAction, onChange, onInput, onSubmit } from "../../app/event-actions.js";
import { stepsOf } from "../../../shared/draft-model.js";
import { t } from "../../app/browser-i18n.js";
import { api, fetchSeries } from "../../app/api-client.js";
import { currentSeries } from "../../app/roster-data.js";
import { tell } from "../../lib/dom.js";
import { formatDuration, parseDuration } from "../../lib/format.js";
import { render } from "../../app/router.js";
import { state } from "../../app/app-state.js";
import { refreshSeries, reloadSeries, teamForStep } from "./board.js";
import { draftEditor } from "./scrim-draft.js";
import { refreshScrimList } from "./scrim-list.js";
import { createSeriesImportInput } from "./import.js";
import { installTeamSharing } from "./teams.js";
import { showForm, showMode } from "./scrim-actions-parts.js";

export function installScrimsActions() {
  installScrimsForms();
  installScrimsButtons();
  installScrimsKeys();
}

function installScrimsForms() {
  installTeamSharing();
  onAction("new-series", () => {
    state.view = "scrims";
    state.activeSeriesId = null;
    render();
    document.querySelector("#team-a")?.focus();
  });

  onAction("open-series", async button => {
    const opened = await api(`/api/series/${encodeURIComponent(button.dataset.seriesId)}`);
    state.series = [opened, ...state.series.filter(item => item.id !== opened.id)];
    state.view = "scrims";
    state.activeSeriesId = opened.id;
    state.viewGameIndex = null;
    render();
  });

  onAction("back-series", () => {
    state.activeSeriesId = null;
    state.viewGameIndex = null;
    render();
  });

  onAction("view-game", button => {
    state.viewGameIndex =
      button.dataset.gameIndex === "current" ? null : Number(button.dataset.gameIndex);
    refreshSeries();
  });

  // The tabs and the search of the list of series: only the rows are redrawn.
  onAction("scrim-tab", button => {
    state.scrimTab = button.dataset.tab;
    refreshScrimList();
  });
  onInput(
    event => event.target.id === "scrim-search",
    event => {
      state.scrimQuery = event.target.value;
      refreshScrimList();
    }
  );

  onAction("focus-new-series", showForm);
  onAction("quick-series", button => {
    const bestOf = document.querySelector("#best-of");
    if (!bestOf) {
      // from another page (History): the panel of a new series opens with the choice made
      state.gameMode = button.dataset.mode;
      state.settings = { ...state.settings, bestOf: Number(button.dataset.bestOf) };
      state.view = "scrims";
      state.activeSeriesId = null;
      render();
      document.querySelector("#team-a")?.focus();
      return;
    }
    showMode(button.dataset.mode);
    bestOf.value = button.dataset.bestOf;
    bestOf.dispatchEvent(new Event("change", { bubbles: true }));
    showForm();
  });

  onAction("set-game-mode", button => showMode(button.dataset.mode));

  onAction("set-draft-mode", button => {
    state.draftMode = button.dataset.mode;
    document
      .querySelectorAll("[data-action='set-draft-mode']")
      .forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    const note = document.querySelector("[data-draft-mode-note]");
    if (note) {
      note.textContent =
        state.draftMode === "online" && !state.auth.user
          ? t("Google sign-in is required to create an online room.")
          : "";
    }
  });

  onAction("start-game", async button => {
    const series = state.series.find(item => item.id === button.dataset.seriesId);
    const blueTeam = document.querySelector("#blue-team-select")?.value;
    await api(`/api/series/${encodeURIComponent(series.id)}/game`, {
      method: "POST",
      body: { blueTeam }
    });
    await reloadSeries(series.id);
  });
}

function installScrimsButtons() {
  onAction(["start-local-draft", "start-side"], async (button, event, action) => {
    const series = currentSeries();
    await api(`/api/series/${encodeURIComponent(series.id)}/game/ready`, {
      method: "POST",
      body: action === "start-side" ? { side: button.dataset.side } : { localStart: true }
    });
    await reloadSeries(series.id);
    if (currentSeries()?.currentGame?.draft.started) {
      tell(t("Draft started"));
    }
  });

  onAction("draft-pick", async button => {
    if (state.pickPending) {
      return;
    }
    state.pickPending = true;
    const series = currentSeries();
    const team = teamForStep(
      series.currentGame,
      stepsOf(series.currentGame.draft)[series.currentGame.draft.stepIndex]
    );
    try {
      await api(`/api/series/${encodeURIComponent(series.id)}/game/action`, {
        method: "POST",
        body: { heroId: button.dataset.heroId, expectedVersion: series.version }
      });
    } catch (error) {
      if (error.code === "version_conflict") {
        await reloadSeries(series.id);
      }
      throw error;
    } finally {
      state.pickPending = false;
    }
    await reloadSeries(series.id);
    const updated = currentSeries();
    if (updated?.draftMode === "two-players" && updated.currentGame?.draft.phase === "draft") {
      const next = stepsOf(updated.currentGame.draft)[updated.currentGame.draft.stepIndex];
      const nextTeam = teamForStep(updated.currentGame, next);
      if (nextTeam !== team) {
        document.querySelector("#handoff-title").textContent = t("Pass to {team}", {
          team: nextTeam
        });
        document.querySelector("#handoff-copy").textContent =
          next.action === "ban"
            ? t("{team} is up next for a ban.", { team: nextTeam })
            : t("{team} is up next for a pick.", { team: nextTeam });
        document.querySelector("#handoff").hidden = false;
      }
    }
  });

  onAction("copy-invite", async () => {
    await navigator.clipboard.writeText(document.querySelector("#invite-link").value);
    tell(t("Invite link copied"));
  });

  onAction("advance-draft", async button => {
    await api(`/api/series/${encodeURIComponent(button.dataset.seriesId)}/game/advance`, {
      method: "POST",
      body: {}
    });
    await reloadSeries(button.dataset.seriesId);
  });

  onAction(["timer-start", "timer-pause", "timer-finish"], async (button, event, action) => {
    const suffix = action.replace("timer-", "");
    await api(`/api/series/${encodeURIComponent(button.dataset.seriesId)}/game/timer/${suffix}`, {
      method: "POST",
      body: {}
    });
    await reloadSeries(button.dataset.seriesId);
    if (suffix === "finish") {
      const input = document.querySelector("#game-duration");
      if (input) {
        input.value = formatDuration(currentSeries().currentGame.suggestedDurationSeconds);
      }
    }
  });
}

function installScrimsKeys() {
  onAction("edit-draft", button => {
    const series = currentSeries();
    const index = button.dataset.gameIndex;
    const game = index === "current" ? series.currentGame : series.games[Number(index)];
    draftEditor.open({
      gameIndex: index === "current" ? "current" : Number(index),
      draft: game.draft,
      title: t("Game {number} · {teamA} vs {teamB}", {
        number: game.gameNumber,
        teamA: series.teamA.name,
        teamB: series.teamB.name
      }),
      rule:
        series.gameMode === "global-ban-pick"
          ? t(
              "Global Ban & Pick still applies: a team cannot use a hero (or a second Flowborn) it already picked in another game of the series."
            )
          : ""
    });
  });

  onAction("import-series", () => {
    document.querySelector("#series-import-file")?.click() || createSeriesImportInput();
  });

  onAction("delete-series", async button => {
    if (confirm(t("Delete this series and its games?"))) {
      await api(`/api/series/${encodeURIComponent(button.dataset.seriesId)}`, { method: "DELETE" });
      state.activeSeriesId = null;
      state.series = await fetchSeries();
      render();
    }
  });

  onChange(
    event => event.target.id === "best-of",
    event => {
      document.querySelector("#custom-best-of-wrap").hidden = event.target.value !== "custom";
    }
  );

  onSubmit(
    event => event.target.id === "new-series-form",
    async event => {
      event.preventDefault();
      const form = new FormData(event.target);
      try {
        const bestOf =
          form.get("bestOf") === "custom"
            ? Number(form.get("customBestOf"))
            : Number(form.get("bestOf"));
        const seriesBody = {
          teamA: form.get("teamA"),
          teamB: form.get("teamB"),
          bestOf,
          gameMode: state.gameMode || "global-ban-pick"
        };
        const series =
          state.draftMode === "online"
            ? await api("/api/online/series", { method: "POST", body: seriesBody })
            : await api("/api/series", {
                method: "POST",
                body: { ...seriesBody, draftMode: state.draftMode }
              });
        state.activeSeriesId = series.id;
        await reloadSeries(series.id);
        tell(
          state.draftMode === "online"
            ? t("Online room created · share the invite link")
            : t("Series created and saved")
        );
      } catch (error) {
        tell(error.message);
      }
    }
  );

  onSubmit(
    event => event.target.id === "game-result-form",
    async event => {
      event.preventDefault();
      const form = new FormData(event.target);
      const durationSeconds = parseDuration(form.get("duration"));
      if (durationSeconds === null) {
        return tell(t("Enter game duration as MM:SS"));
      }
      try {
        await api(
          `/api/series/${encodeURIComponent(event.target.dataset.seriesId)}/game/complete`,
          { method: "POST", body: { winner: form.get("winner"), durationSeconds } }
        );
        await reloadSeries(state.activeSeriesId);
        tell(t("Game result recorded"));
      } catch (error) {
        tell(error.message);
      }
    }
  );
}
