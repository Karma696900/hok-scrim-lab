// The page of a team. Wireframe:
//   1. the stage: the cover of a hero under the colour of the team, its mark (large), the name (64 px), the
//      facts, the actions of the person, three big numbers (members, lanes covered, planned events);
//   2. the tabs: Overview, Roster, Agenda, Series, Training, Discord, Settings (each only for the people who
//      may use it);
//   3. Overview = the five lanes with who plays them, the next events and the latest series on the left, the
//      facts and the staff on the right; Roster = one tall card per player and, for the staff, the invitations.
// The server decides who may do what; the buttons only hide what would be refused.

import { t } from "../../app/browser-i18n.js";
import { paintStage } from "../community/stage.js";
import { eventForm } from "./team-agenda-panel.js";
import { loadTeamExtras } from "./team-load.js";
import { pageMarkup, panelsOf, plannedCount } from "./team-panels.js";
import { STAFF } from "./team-shared.js";
import { notFound, stage } from "./team-stage.js";

const TABS = /^(overview|roster|agenda|series|training|discord|settings)$/;

export function createTeamView(ctx) {
  const { api, tell, state, training } = ctx;
  let tab = "overview"; // the open tab: kept while the person acts on the team, back to Overview for another team
  let shown = null;

  const setTab = name => {
    tab = name;
    const root = ctx.root();
    for (const button of root.querySelectorAll('[data-team="tab"][role="tab"]')) {
      const on = button.dataset.tab === name;
      button.classList.toggle("on", on);
      button.setAttribute("aria-selected", String(on));
    }
    for (const panel of root.querySelectorAll("[data-panel]")) {
      panel.hidden = panel.dataset.panel !== name;
    }
  };

  /** What the address asks for (coming back from Discord, a link to a tab, "add an event"); true when the event form must open. */
  function readAddress(agenda) {
    const params = new URLSearchParams(location.search);
    if (params.get("discord")) {
      tell(
        params.get("discord") === "added"
          ? t("The bot was added to your server. Now choose a channel.")
          : t("The bot could not be added to your server. Try again.")
      );
      history.replaceState(null, "", location.pathname);
      tab = "discord";
    }
    const wanted = params.get("tab");
    if (wanted && TABS.test(wanted)) {
      history.replaceState(null, "", location.pathname);
      tab = wanted;
    }
    const addEvent = params.get("add") === "1" && agenda.canSchedule;
    if (addEvent) {
      history.replaceState(null, "", location.pathname);
      tab = "agenda";
    }
    return addEvent;
  }

  async function show(teamId, { fresh = false } = {}) {
    const root = ctx.root();
    if (fresh) {
      tab = "overview";
    }
    let team;
    try {
      team = await api(`/api/teams/${encodeURIComponent(teamId)}`);
    } catch (error) {
      root.innerHTML = notFound(error.message);
      return;
    }
    const staff = STAFF.includes(team.myRole);
    const { agenda, discord, trainingData, series, mySeries } = await loadTeamExtras(
      ctx,
      team,
      teamId
    );
    team.agenda = agenda;
    team.discord = discord;
    team.training = trainingData;
    const addEvent = readAddress(agenda);
    const data = { agenda, series, mySeries };
    const panels = panelsOf({ team, staff, data, training, myId: state.auth.user?.id });
    if (!panels.some(([name]) => name === tab)) {
      tab = "overview";
    }
    const { html, hero } = stage(team, staff, plannedCount(team, agenda), Boolean(state.auth.user));
    root.innerHTML = pageMarkup(html, team, panels, tab);
    paintStage(root, hero);
    root.teamData = team;
    shown = team;
    if (team.training?.canSeeRanking) {
      training.fillRanking(root, team.id);
    }
    if (addEvent) {
      openEventForm(null);
    }
  }

  function openEventForm(event) {
    const root = ctx.root();
    const slot = root.querySelector("#event-form-slot");
    if (!slot) {
      return;
    }
    slot.innerHTML = eventForm(event);
    slot.hidden = false;
    slot.querySelector("select")?.focus();
  }

  return {
    show,
    setTab,
    openEventForm,
    current: () => shown,
    tab: () => tab
  };
}
