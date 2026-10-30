// The three views of the calendar: month, week and list.
import { KIND_ICONS, dayKey, dayLabel, hourLabel } from "./community-shared.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { format, kindLabel } from "./labels.js";
import { icon } from "../../../shared/icons.js";
import { lineHtml } from "./stage.js";
import { t } from "../../app/browser-i18n.js";
import { teamEmblem } from "../../domain/team-emblem.js";
import { addDays, monthStart, weekStart } from "./agenda-shared.js";

export const shownEvents = (page, list) =>
  page.teamId ? list.filter(event => event.team.id === page.teamId) : list;

export const byDay = page => {
  const days = new Map();
  for (const event of page.shownEvents(page.events)) {
    const key = dayKey(event.startsAt);
    days.set(key, [...(days.get(key) ?? []), event]);
  }
  return days;
};

export const eventTitle = event => event.title || kindLabel(event.kind);

// ---- the three views --------------------------------------------------------------------------
export function monthView(page, days) {
  const first = monthStart(page.cursor);
  const start = weekStart(first);
  const names = Array.from({ length: 7 }, (_, index) =>
    format(addDays(start, index), { weekday: "short" })
  );
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = addDays(start, index);
    const key = dayKey(day.getTime());
    const list = days.get(key) ?? [];
    const classes = [
      day.getMonth() === first.getMonth() ? "" : "out",
      key === dayKey(Date.now()) ? "today" : "",
      key === page.selected ? "sel" : "",
      list.length ? "has" : ""
    ]
      .filter(Boolean)
      .join(" ");
    return `<button type="button" class="cell ${classes}" data-community="select-day" data-day="${key}" aria-label="${esc(dayLabel(day.getTime()))}${list.length ? ` · ${list.length}` : ""}"><span class="dnum">${day.getDate()}</span>${list
      .slice(0, 3)
      .map(
        event =>
          `<span class="ev k-${esc(event.kind)}">${icon(KIND_ICONS[event.kind], "i--sm")}${esc(chipTime(event.startsAt))} ${esc(eventTitle(event))}</span>`
      )
      .join(
        ""
      )}${list.length > 3 ? `<span class="more-ev">+${list.length - 3}</span>` : ""}</button>`;
  });
  return `<div class="mgrid">${names.map(name => `<div class="dow">${esc(name)}</div>`).join("")}${cells.join("")}</div>`;
}

export function weekView(page, days) {
  const start = weekStart(page.cursor);
  const week = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const columns = week.map(day => layoutDay(days.get(dayKey(day.getTime())) ?? []));
  const from = Math.min(12, ...columns.flat().map(item => Math.floor(item.start / 60)));
  const today = dayKey(Date.now());
  const nowMinutes = minutesOf(Date.now());
  const hours = Array.from({ length: 24 - from }, (_, index) => from + index);
  const none = columns.every(column => !column.length);
  return `<div class="ag-week" data-from="${from}" data-hours="${24 - from}">
      <div class="ag-week__head"><span></span>${week
        .map(day => {
          const key = dayKey(day.getTime());
          return `<button type="button" class="ag-dayhead${key === today ? " today" : ""}${key === page.selected ? " sel" : ""}" data-community="select-day" data-day="${key}" aria-label="${esc(dayLabel(day.getTime()))}">${esc(format(day, { weekday: "short" }))}<b>${day.getDate()}</b></button>`;
        })
        .join("")}</div>
      ${none ? lineHtml("calendar", t("Nothing planned in this period."), "", "", "cm-line ag-none") : ""}
      <div class="ag-week__body">
        <div class="ag-hours" aria-hidden="true">${hours.map(hour => `<span>${esc(format(new Date(2000, 0, 1, hour), { hour: "numeric", minute: "2-digit" }))}</span>`).join("")}</div>
        <div class="wcols">${week
          .map((day, index) => {
            const key = dayKey(day.getTime());
            return `<div class="wcol${key === today ? " today" : ""}${key === page.selected ? " sel" : ""}" data-day="${key}"><h3 class="ag-coldate">${esc(dayLabel(day.getTime()))}</h3>${
              key === today && nowMinutes >= from * 60
                ? `<i class="ag-marker" data-now="${nowMinutes}" aria-hidden="true"></i>`
                : ""
            }${columns[index]
              .map(
                ({ event, start: startMin, end, lane, lanes }) =>
                  `<button type="button" class="wev k-${esc(event.kind)}" data-community="open-event" data-id="${esc(event.id)}" data-start="${startMin}" data-end="${end}" data-lane="${lane}" data-lanes="${lanes}"><b>${esc(hourLabel(event.startsAt))}</b><span>${esc(eventTitle(event))}</span><small>${esc(event.team.name)}</small></button>`
              )
              .join(
                ""
              )}${columns[index].length ? "" : `<span class="faint wempty">${t("Nothing planned in this period.")}</span>`}</div>`;
          })
          .join("")}</div>
      </div>
    </div>`;
}

export function listView(days) {
  const groups = [...days.entries()];
  if (!groups.length) {
    return lineHtml("calendar", t("Nothing planned in this period."));
  }
  return groups
    .map(
      ([, list]) =>
        `<div class="lgroup"><h4>${esc(dayLabel(list[0].startsAt))}</h4>${list
          .map(event => {
            const mine = event.rsvp?.mine;
            const answer = mine
              ? `<span class="pill${mine === "going" ? "" : " pill--warn"}">${esc({ going: t("Going"), maybe: t("Maybe"), no: t("Can’t") }[mine])}</span>`
              : event.kind === "availability"
                ? ""
                : `<span class="pill pill--grey">${t("To answer")}</span>`;
            return `<button type="button" class="levent k-${esc(event.kind)}" data-community="open-event" data-id="${esc(event.id)}"><span class="tm">${esc(hourLabel(event.startsAt))}</span>${teamEmblem(event.team, 36)}<span class="row__body"><b>${esc(eventTitle(event))}</b><small>${esc(kindLabel(event.kind))} · ${esc(event.team.name)}</small></span>${answer}</button>`;
          })
          .join("")}</div>`
    )
    .join("");
}

/** The hour of a chip of the month, as short as the language allows ("7:00 PM", "19:00"). */
const chipTime = time => format(time, { hour: "numeric", minute: "2-digit" });

const minutesOf = time => {
  const date = new Date(time);
  return date.getHours() * 60 + date.getMinutes();
};

/**
 * The events of one day side by side: each gets a lane and the number of lanes of its group (events that
 * overlap in time share the width of the column). Times are minutes since midnight, clipped to the day.
 */
export function layoutDay(events) {
  const items = events
    .map(event => {
      const start = minutesOf(event.startsAt);
      const sameDay = dayKey(event.startsAt) === dayKey(event.endsAt - 1);
      // an end at midnight sharp is the end of this day (00:00 would make the event end before it starts)
      const end = (sameDay && minutesOf(event.endsAt)) || 24 * 60;
      return { event, start, end: Math.max(end, start + 30) };
    })
    .sort((left, right) => left.start - right.start || right.end - left.end);
  const placed = [];
  let group = [];
  let groupEnd = -1;
  const close = () => {
    const lanes = Math.max(1, ...group.map(item => item.lane + 1));
    for (const item of group) {
      placed.push({ ...item, lanes });
    }
    group = [];
    groupEnd = -1;
  };
  for (const item of items) {
    if (item.start >= groupEnd) {
      close();
    }
    const taken = new Set(group.filter(other => other.end > item.start).map(other => other.lane));
    let lane = 0;
    while (taken.has(lane)) {
      lane += 1;
    }
    group.push({ ...item, lane });
    groupEnd = Math.max(groupEnd, item.end);
  }
  close();
  return placed;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { shownEvents, byDay, monthView, weekView };
