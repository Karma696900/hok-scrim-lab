// The side of the agenda: the next events, the day that is open, the form of an event.
import { KINDS, dayLabel, hourLabel, localInput, options, slotText } from "./community-shared.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { format, kindLabel } from "./labels.js";
import { icon } from "../../../shared/icons.js";
import { lineHtml } from "./stage.js";
import { t } from "../../app/browser-i18n.js";
import { teamEmblem } from "../../domain/team-emblem.js";
import { ATTEND, DAY } from "./agenda-shared.js";
import { eventTitle } from "./agenda-views.js";

// ---- the side ---------------------------------------------------------------------------------
export const answers = () => [
  ["going", "yes", t("Going")],
  ["maybe", "maybe", t("Maybe")],
  ["no", "no", t("Can’t")]
];

export const rsvpBar = event =>
  `<div class="seg rsvp" role="group" aria-label="${t("Your answer")}">${answers()
    .map(
      ([answer, tone, label]) =>
        `<button type="button" class="${tone}${event.rsvp.mine === answer ? " on" : ""}" data-community="rsvp" data-id="${esc(event.id)}" data-answer="${answer}" aria-pressed="${event.rsvp.mine === answer}">${esc(label)}</button>`
    )
    .join("")}</div>`;

/** The next events (all teams, or the one that is chosen), each with the three answers. */
export function upcomingPanel(page) {
  const list = page
    .shownEvents(page.upcoming)
    .filter(event => ATTEND(event) && event.endsAt > Date.now())
    .slice(0, 4);
  return `<div class="card__head"><h2>${t("Upcoming")}</h2><span class="count">${list.length}</span></div>${
    list.length
      ? `<div class="ag-up">${list
          .map(
            event =>
              `<article class="ag-up__item k-${esc(event.kind)}"><button type="button" class="ag-up__top" data-community="open-event" data-id="${esc(event.id)}"><span class="cm-date">${new Date(event.startsAt).getDate()}<small>${esc(format(event.startsAt, { weekday: "short" }))}</small></span><span class="row__body"><b>${esc(eventTitle(event))}</b><small>${esc(format(event.startsAt, { weekday: "long", month: "short", day: "numeric" }))} · ${esc(hourLabel(event.startsAt))} · ${esc(event.team.name)}</small></span></button>${rsvpBar(event)}</article>`
          )
          .join("")}</div>`
      : lineHtml("calendar", t("Nothing planned in the next 60 days."), "", "", "cm-line")
  }`;
}

export function dayPanel(page, days) {
  const list = days.get(page.selected) ?? [];
  const staff = page.ctx.staffTeams();
  const [year, month, date] = page.selected.split("-").map(Number);
  const head = `<div class="card__head daypanel"><h2>${esc(dayLabel(new Date(year, month, date).getTime()))}</h2><span class="count">${list.length}</span></div>`;
  if (!list.length) {
    return `${head}${lineHtml("calendar", t("Nothing planned that day."), "", staff.length ? `<button type="button" class="btn btn--sm" data-community="agenda-new">${icon("plus", "i--sm")}${t("Add an event")}</button>` : "", "cm-line")}`;
  }
  return head + list.map(eventBlock).join("");
}

export function eventBlock(event) {
  const r = event.rsvp;
  const names = people => people.map(person => esc(person.name)).join(", ");
  return `<div class="devent k-${esc(event.kind)}">
      <div class="top">${teamEmblem(event.team, 40)}<div class="grow"><b>${esc(eventTitle(event))}</b><small>${slotText(event.startsAt, event.endsAt)} · ${esc(kindLabel(event.kind))} · ${esc(event.team.name)}</small></div></div>
      ${event.note ? `<p class="event-note-box">${esc(event.note)}</p>` : ""}
      ${
        event.kind !== "availability"
          ? `${rsvpBar(event)}
        <p class="muted rsvp-summary">${t("{going} going · {maybe} maybe · {no} can’t", { going: r.going.length, maybe: r.maybe.length, no: r.no.length })}${r.going.length ? `<br>${t("Going")}: ${names(r.going)}` : ""}</p>`
          : ""
      }
      ${event.kind === "scrim" && /^Scrim vs /.test(event.title) ? `<button type="button" class="btn btn--sm" data-community="series-from-event" data-id="${esc(event.id)}">${icon("swords", "i--sm")}${t("Create the series from this event")}</button>` : ""}
    </div>`;
}

/** The form that adds an event to one of the teams the person leads (the same fields as on the team's page). */
export function eventForm(page) {
  const staff = page.ctx.staffTeams();
  if (!staff.length) {
    return "";
  }
  const [year, month, date] = page.selected.split("-").map(Number);
  const base = new Date(year, month, date, 20, 0).getTime();
  const start = base > Date.now() ? base : Math.ceil(Date.now() / 1800000) * 1800000 + DAY;
  return `<details class="card card--feature ag-add" id="agenda-add"><summary><h2>${t("Add an event")}</h2><span class="ag-add__plus">${icon("plus", "i--sm")}</span></summary>
      <form id="agenda-event-form" class="ag-form" novalidate>
        <label class="label">${t("Team")}<span class="field"><select id="ag-team" name="teamId">${staff.map(team => `<option value="${esc(team.id)}"${team.id === page.teamId ? " selected" : ""}>${esc(team.name)}</option>`).join("")}</select></span></label>
        <div class="ag-pair">
          <label class="label">${t("Kind")}<span class="field"><select id="ag-kind" name="kind">${options(KINDS, "scrim", kindLabel)}</select></span></label>
          <label class="label">${t("Title")}<span class="field"><input id="ag-title" name="title" maxlength="80" autocomplete="off"></span></label>
        </div>
        <label class="label">${t("Start")}<span class="field"><input id="ag-start" name="start" type="datetime-local" required value="${localInput(start)}"></span></label>
        <label class="label">${t("End")}<span class="field"><input id="ag-end" name="end" type="datetime-local" required value="${localInput(start + 2 * 3600_000)}"></span></label>
        <label class="label">${t("Repeat")}<span class="field"><select id="ag-repeat" name="repeatWeeks"><option value="0">${t("Does not repeat")}</option>${[1, 2, 3, 4, 8, 12].map(weeks => `<option value="${weeks}">${t("Every week, {count} more times", { count: weeks })}</option>`).join("")}</select></span></label>
        <label class="label">${t("Note")}<span class="field field--area"><textarea id="ag-note" name="note" rows="2" maxlength="400"></textarea></span><small>${t("A note is only visible to the team.")}</small></label>
        <p class="form-error" id="ag-error" role="alert"></p>
        <button class="btn btn--primary" type="submit">${icon("check")}${t("Add an event")}</button>
      </form></details>`;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { upcomingPanel, dayPanel, eventForm };
