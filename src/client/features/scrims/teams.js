// Sharing a series with a team: the creator who leads a team (owner, manager or coach) puts the series on it, and the
// members of the team then read it (read only). The block opens under the band of the series, next to the buttons
// that share and export it; it is only there for the creator, and only when they are signed in (a guest has no team).
import { icon } from "../../../shared/icons.js";
import { onAction } from "../../app/event-actions.js";
import { api } from "../../app/api-client.js";
import { currentSeries } from "../../app/roster-data.js";
import { escapeHtml, tell } from "../../lib/dom.js";
import { teamEmblem } from "../../domain/team-emblem.js";
import { t } from "../../app/browser-i18n.js";
import { state } from "../../app/app-state.js";
import { refreshSeries } from "./board.js";

// What the person sees of the teams of the series on screen. Nothing is asked of the server until the block is opened.
const panel = { open: false, seriesId: null, data: null, loading: false, error: "" };

/** The block is for the creator of the series who is signed in. */
const canShareWithTeams = series => Boolean(series.viewer?.canShare && state.auth.user);

const isOpen = series => canShareWithTeams(series) && panel.open && panel.seriesId === series.id;

/** The button of the band that opens and closes the block (with the number of teams once they are known). */
export function teamsButtonHtml(series) {
  if (!canShareWithTeams(series)) {
    return "";
  }
  const open = isOpen(series);
  const count = open && panel.data?.shared.length ? panel.data.shared.length : 0;
  return `<button type="button" class="btn btn--sm" data-action="toggle-teams" aria-expanded="${open}" aria-controls="series-teams">${icon("users", "i--sm")}${t("Share with a team")}${count ? `<em class="count">${count}</em>` : ""}</button>`;
}

const chipHtml = team =>
  `<li class="sr-teams__chip"><a href="/teams/${encodeURIComponent(team.id)}">${teamEmblem(team.name, 28)}<b>${escapeHtml(team.name)}</b></a><button type="button" class="btn btn--ghost btn--icon btn--sm" data-action="share-team-remove" data-team-id="${escapeHtml(team.id)}" data-team-name="${escapeHtml(team.name)}" aria-label="${escapeHtml(t("Take the series off {team}", { team: team.name }))}" title="${escapeHtml(t("Take the series off {team}", { team: team.name }))}">${icon("x", "i--sm")}</button></li>`;

function addHtml({ available, shared, max }) {
  if (shared.length >= max) {
    return `<p class="muted">${t("A series can be on {max} teams at most.", { max })}</p>`;
  }
  if (!available.length) {
    return `<p class="muted">${t("No team to add: you must own, manage or coach a team to share a series with it.")} <a class="link" href="/teams">${t("Teams")}</a></p>`;
  }
  return `<label class="label" for="share-team-select">${t("Team")}<span class="field"><select id="share-team-select"><option value="">${t("Choose a team")}</option>${available.map(team => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)}</option>`).join("")}</select></span></label><button type="button" class="btn btn--primary" data-action="share-team-add">${icon("plus", "i--sm")}${t("Add")}</button>`;
}

/** The block itself: what it is for, the teams the series is on (each with its remove button), and the teams it can still be put on. */
export function teamsPanelHtml(series) {
  if (!isOpen(series)) {
    return "";
  }
  const { data, loading, error } = panel;
  let body;
  if (!data) {
    body = loading
      ? `<p class="muted">${t("Loading…")}</p>`
      : `<p class="form-error" role="alert">${escapeHtml(error)}</p><button type="button" class="btn btn--sm" data-action="toggle-teams" data-retry>${icon("refresh", "i--sm")}${t("Try again")}</button>`;
  } else {
    body = `<div class="sr-teams__on"><h3>${t("Shared with")}</h3>${data.shared.length ? `<ul>${data.shared.map(chipHtml).join("")}</ul>` : `<p class="muted">${t("Not shared with any team yet.")}</p>`}</div><div class="sr-teams__add">${addHtml(data)}</div>${error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : ""}`;
  }
  return `<section class="sr-teams" id="series-teams" aria-labelledby="series-teams-title"><div class="sr-teams__intro"><h2 id="series-teams-title">${t("Share with a team")}</h2><p class="muted">${t("The members of a team you lead can open this series and read it, but not change it.")}</p></div>${body}</section>`;
}

/** Asks the server where the series is, and what it can still be put on. */
async function load(series) {
  panel.loading = true;
  panel.error = "";
  refreshSeries();
  try {
    panel.data = await api(`/api/series/${encodeURIComponent(series.id)}/teams`);
  } catch (error) {
    panel.data = null;
    panel.error = error.message;
  } finally {
    panel.loading = false;
    refreshSeries();
  }
}

export function installTeamSharing() {
  onAction("toggle-teams", async button => {
    const series = currentSeries();
    if (!series || !canShareWithTeams(series)) {
      return;
    }
    if (isOpen(series) && !button.hasAttribute("data-retry")) {
      panel.open = false;
      refreshSeries();
      document.querySelector('[data-action="toggle-teams"]')?.focus();
      return;
    }
    Object.assign(panel, { open: true, seriesId: series.id, data: null });
    await load(series);
    document.querySelector("#share-team-select, #series-teams [data-action]")?.focus();
  });

  /** Puts the series on, or takes it off, a team, then asks the server again what is where. */
  async function change(method, teamId, message) {
    const series = currentSeries();
    try {
      await api(
        `/api/series/${encodeURIComponent(series.id)}/teams/${encodeURIComponent(teamId)}`,
        {
          method
        }
      );
      tell(message);
      await load(series);
    } catch (error) {
      panel.error = error.message;
      refreshSeries();
    }
  }

  onAction("share-team-add", async () => {
    const select = document.querySelector("#share-team-select");
    if (!select?.value) {
      select?.focus();
      return;
    }
    const name = select.selectedOptions[0].textContent;
    await change("PUT", select.value, t("Series shared with {team}", { team: name }));
    document.querySelector("#share-team-select, #series-teams [data-action]")?.focus();
  });

  onAction("share-team-remove", async button => {
    await change(
      "DELETE",
      button.dataset.teamId,
      t("Series taken off {team}", { team: button.dataset.teamName })
    );
    document.querySelector("#share-team-select, #series-teams [data-action]")?.focus();
  });
}
