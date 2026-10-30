// The tabs of the page of a team and the HTML around them. Which tabs exist depends on who looks (see the wireframe in
// team-view.js); each tab is drawn by its own file.
import { escapeHtml as esc } from "../../lib/dom.js";
import { t } from "../../app/browser-i18n.js";
import { agendaPanel } from "./team-agenda-panel.js";
import { discordPanel, settingsPanel } from "./team-admin-panels.js";
import { overviewPanel } from "./team-overview-panel.js";
import { rosterPanel } from "./team-roster-panel.js";
import { seriesPanel } from "./team-series-panel.js";

const publicWindows = agenda => agenda.items.filter(item => item.kind === "availability");

/** The big number "planned events" of the stage: the team's own events, or the windows it made public. */
export const plannedCount = (team, agenda) =>
  team.myRole
    ? agenda.items.filter(item => !["availability", "unavailable"].includes(item.kind)).length
    : publicWindows(agenda).length;

/** The tabs this person gets, as `[name, label, html]`, in the order they are shown. */
export function panelsOf({ team, staff, data, training, myId }) {
  const { agenda } = data;
  const panels = [
    ["overview", t("Overview"), overviewPanel(team, staff, data)],
    ["roster", t("Roster"), rosterPanel(team, staff, myId)]
  ];
  if (team.myRole || publicWindows(agenda).length) {
    panels.push([
      "agenda",
      team.myRole ? t("Agenda") : t("Public availability"),
      agendaPanel(team, agenda)
    ]);
  }
  if (team.myRole) {
    panels.push(["series", t("Series"), seriesPanel(team, data)]);
  }
  if (team.training) {
    panels.push(["training", t("Training"), training.panel(team.training)]);
  }
  if (team.discord) {
    panels.push(["discord", "Discord", discordPanel(team)]);
  }
  if (staff) {
    panels.push(["settings", t("Settings"), settingsPanel(team)]);
  }
  return panels;
}

/** The stage, the row of tabs and one panel per tab (only the open one is visible). */
export const pageMarkup = (stageHtml, team, panels, tab) => `${stageHtml}
      <div class="tabs tp-tabs teams-tabs rise d-1" role="tablist" aria-label="${esc(team.name)}">${panels
        .map(
          ([name, label]) =>
            `<button type="button" role="tab" aria-selected="${name === tab}" class="${name === tab ? "on" : ""}" data-team="tab" data-tab="${name}">${label}</button>`
        )
        .join("")}</div>
      ${panels
        .map(
          ([name, , body]) =>
            `<div class="team-panel stack-y" role="tabpanel" data-panel="${name}"${name === tab ? "" : " hidden"}>${body}</div>`
        )
        .join("")}`;
