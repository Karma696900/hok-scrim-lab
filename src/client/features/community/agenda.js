// The agenda. Wireframe:
//   1. the stage: a cover, the title, three numbers (events in the next 7 days, events to answer, teams);
//   2. the calendar on the left: the week as seven columns on an hour grid (events coloured by kind, today
//      marked, a line for the present hour), or the month, or the list; the toolbar holds the arrows, the team
//      filter and the choice of view;
//   3. on the right: "Upcoming" (answer in one click), the day that is selected, the form that adds an event
//      and the calendar files; on a phone the week is a list of days.
// The server decides who may do what; the buttons only hide what would be refused.
import { icon } from "../../../shared/icons.js";
import { number, t } from "../../app/browser-i18n.js";
import { kindLabel } from "./labels.js";
import { KINDS, dayKey, zoneName } from "./community-shared.js";
import { paintStage, stageHero, stageHtml } from "./stage.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as agendaViews } from "./agenda-views.js";
import { onView as agendaSide } from "./agenda-side.js";
import { onView as agendaPaint } from "./agenda-paint.js";
import { onView as agendaActions } from "./agenda-actions.js";
import { actionsOf, formsOf } from "./agenda-actions.js";

export function createAgendaPage(ctx) {
  const page = { ctx };
  bindTo(page, agendaViews, agendaSide, agendaPaint, agendaActions);
  ({ api: page.api, tell: page.tell, go: page.go } = page.ctx);
  page.view = "week";
  page.cursor = new Date(); // the day the month or the week is about
  page.events = []; // the events of what the calendar shows
  page.upcoming = []; // the events from now on (the panel and the numbers)
  page.selected = dayKey(Date.now()); // the day whose events the side card details
  page.teamId = ""; // the team the calendar is limited to ("" = all)

  async function show() {
    const root = page.ctx.root();
    await page.ctx.loadMyTeams();
    const teams = page.ctx.myTeams();
    const staff = page.ctx.staffTeams();
    const hero = stageHero(9);
    page.teamId = "";
    page.cursor = new Date();
    page.selected = dayKey(Date.now());
    if (!teams.length) {
      page.empty(hero);
      return;
    }
    const views = [
      ["month", t("Month")],
      ["week", t("Week")],
      ["list", t("List")]
    ];
    root.innerHTML = `${stageHtml({
      cls: "ag-stage",
      hero,
      title: t("Agenda"),
      text: t("The agenda of your teams, in your time zone ({zone}).", { zone: esc(zoneName()) }),
      actions: `${staff.length ? `<button type="button" class="btn btn--primary btn--lg" data-community="agenda-new">${icon("plus")}${t("New event")}</button>` : ""}<a class="btn btn--lg" href="/teams">${icon("users")}${t("Teams")}</a>`,
      figures: [
        ["–", t("Next 7 days"), "fig-week"],
        ["–", t("To answer"), "fig-answer"],
        [number(teams.length), t("Teams"), "fig-teams"]
      ]
    })}
      <div class="cm-layout cm-layout--side ag-layout rise d-1">
        <section class="card ag-cal">
          <div class="ag-toolbar">
            <div class="hstack tight">
              <button type="button" class="btn btn--ghost btn--icon btn--sm" data-community="agenda-prev">${icon("left")}</button>
              <h2 id="agenda-title" class="agenda-title"></h2>
              <button type="button" class="btn btn--ghost btn--icon btn--sm" data-community="agenda-next">${icon("right")}</button>
              <button type="button" class="btn btn--ghost btn--sm" data-community="agenda-today">${t("Today")}</button>
            </div>
            <div class="hstack wrap">
              ${teams.length > 1 ? `<label class="field ag-filter">${icon("users", "i--sm")}<select id="agenda-team" aria-label="${t("Team")}"><option value="">${t("All teams")}</option>${teams.map(team => `<option value="${esc(team.id)}">${esc(team.name)}</option>`).join("")}</select></label>` : ""}
              <div class="seg" role="group" aria-label="${t("View")}">${views.map(([id, label]) => `<button type="button" data-community="agenda-view" data-mode="${id}" aria-pressed="${id === page.view}">${esc(label)}</button>`).join("")}</div>
            </div>
          </div>
          <div id="agenda-main"></div>
          <div class="legend4">${KINDS.map(kind => `<span class="k-${kind}"><i></i>${esc(kindLabel(kind))}</span>`).join("")}</div>
        </section>
        <aside class="cm-side ag-side" aria-label="${t("Upcoming")}">
          <section class="card" id="agenda-upcoming"></section>
          <section class="card" id="agenda-day"></section>
          ${page.eventForm()}
          <section class="card ag-files"><div class="card__head"><h2>${t("Calendar")}</h2><span class="pill pill--blue">Discord</span></div>
            <div class="hstack wrap">${teams.map(team => `<a class="btn btn--sm" href="/api/teams/${encodeURIComponent(team.id)}/events.ics" download>${icon("download", "i--sm")}${esc(team.tag)} .ics</a>`).join("")}</div>
            <p class="muted">${t("Agenda reminders (6 h, 4 h and 2 h before)")}</p>
            <p><a class="link" href="/discord">${t("Discord & onboarding")} →</a></p>
          </section>
        </aside>
      </div>`;
    paintStage(root, hero);
    // The grid is drawn at once, empty: the events fill it in when they arrive and nothing moves.
    page.events = [];
    page.upcoming = [];
    page.paint();
    await Promise.all([page.load(), page.loadUpcoming()]);
    // a week with nothing in it is not what a person came for: the calendar opens on the week of the next event
    if (page.view === "week" && !page.events.length && page.upcoming.length) {
      page.cursor = new Date(page.upcoming[0].startsAt);
      page.selected = dayKey(page.upcoming[0].startsAt);
      await page.load();
    }
    page.paint();
    const add = root.querySelector("#agenda-add");
    if (add && !page.upcoming.length) {
      add.open = true;
    }
  }

  page.actions = actionsOf(page);

  page.forms = formsOf(page);

  return { show, actions: page.actions, forms: page.forms, change: page.change };
}
