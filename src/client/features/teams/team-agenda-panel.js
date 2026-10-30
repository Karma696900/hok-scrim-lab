// Agenda tab: the events of the team (or the windows it made public) and the form of an event.
import {
  KINDS,
  dayLabel,
  hourLabel,
  localInput,
  options,
  zoneName
} from "../community/community-shared.js";
import { escapeHtml as esc } from "../../lib/dom.js";
import { format, kindLabel } from "../community/labels.js";
import { icon } from "../../../shared/icons.js";
import { lineHtml } from "../community/stage.js";
import { t } from "../../app/browser-i18n.js";
import { formError } from "./team-shared.js";

// ---- Agenda -----------------------------------------------------------------------------------
export const eventRow = (
  event,
  canSchedule
) => `<div class="event-row tp-event k-${esc(event.kind)}">
      <span class="cm-date">${new Date(event.startsAt).getDate()}<small>${esc(format(event.startsAt, { weekday: "short" }))}</small></span>
      <span class="row__body"><b>${esc(event.title || kindLabel(event.kind))}</b><small>${esc(hourLabel(event.startsAt))}–${esc(hourLabel(event.endsAt))} · ${esc(kindLabel(event.kind))}${event.note ? ` · ${esc(event.note)}` : ""}</small></span>
      ${canSchedule ? `<span class="hstack"><button type="button" class="btn btn--ghost btn--sm" data-team="edit-event" data-id="${esc(event.id)}">${t("Edit")}</button><button type="button" class="btn btn--ghost btn--sm" data-team="delete-event" data-id="${esc(event.id)}">${t("Delete")}</button></span>` : ""}
    </div>`;

/** The agenda of the team (its members), or the windows it made public (everybody else). */
export function agendaPanel(team, agenda) {
  if (!team.myRole) {
    const windows = agenda.items.filter(item => item.kind === "availability");
    return `<section class="card"><div class="card__head"><h2>${t("Public availability")}</h2></div>${timeNote()}<div class="list">${windows.map(event => `<div class="event-row tp-event k-availability"><span class="cm-date">${new Date(event.startsAt).getDate()}<small>${esc(format(event.startsAt, { weekday: "short" }))}</small></span><span class="row__body"><b>${esc(dayLabel(event.startsAt))}</b><small>${esc(hourLabel(event.startsAt))}–${esc(hourLabel(event.endsAt))}</small></span></div>`).join("")}</div></section>`;
  }
  return `<section class="card" id="team-agenda">
      <div class="card__head"><h2>${t("Agenda")}</h2>${agenda.canSchedule ? `<button type="button" class="btn btn--sm" data-team="new-event">${icon("plus", "i--sm")}${t("Add an event")}</button>` : ""}</div>
      <div id="event-form-slot" hidden></div>
      ${timeNote()}
      ${
        agenda.items.length
          ? `<div class="list">${agenda.items.map(event => eventRow(event, agenda.canSchedule)).join("")}</div>`
          : lineHtml("calendar", t("Nothing planned in the next 60 days."), "", "", "cm-line")
      }
    </section>`;
}

export const eventForm = (event = null) => {
  const start = event?.startsAt ?? Math.ceil(Date.now() / 1800000) * 1800000 + 86400000;
  const end = event?.endsAt ?? start + 2 * 3600000;
  return `<form id="event-form" class="tp-eventform rise" data-event-id="${esc(event?.id ?? "")}" novalidate>
      <div class="tm-form__pair">
        <label class="label">${t("Kind")}<span class="field"><select id="event-kind" name="kind">${options(KINDS, event?.kind ?? "scrim", kindLabel)}</select></span></label>
        <label class="label">${t("Title")}<span class="field"><input id="event-title" name="title" maxlength="80" value="${esc(event?.title ?? "")}"></span></label>
      </div>
      <div class="tm-form__pair">
        <label class="label">${t("Start")}<span class="field"><input id="event-start" name="start" type="datetime-local" required value="${localInput(start)}"></span></label>
        <label class="label">${t("End")}<span class="field"><input id="event-end" name="end" type="datetime-local" required value="${localInput(end)}"></span></label>
      </div>
      ${event ? "" : `<label class="label">${t("Repeat")}<span class="field"><select id="event-repeat" name="repeatWeeks"><option value="0">${t("Does not repeat")}</option>${[1, 2, 3, 4, 8, 12].map(weeks => `<option value="${weeks}">${t("Every week, {count} more times", { count: weeks })}</option>`).join("")}</select></span></label>`}
      <label class="label">${t("Note")}<span class="field field--area"><textarea id="event-note" name="note" rows="2" maxlength="400">${esc(event?.note ?? "")}</textarea></span><small>${t("A note is only visible to the team.")}</small></label>
      ${formError("event-error")}
      <div class="hstack wrap"><button class="btn btn--primary" type="submit">${icon("check")}${event ? t("Save the event") : t("Add an event")}</button><button class="btn btn--ghost" type="button" data-team="close-event">${t("Cancel")}</button></div>
    </form>`;
};

const timeNote = () =>
  `<p class="muted">${t("Times are shown in your time zone ({zone}).", { zone: esc(zoneName()) })}</p>`;
