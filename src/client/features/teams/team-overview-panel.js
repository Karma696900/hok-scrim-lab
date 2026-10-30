// Overview tab: the five lanes with who plays them, the next events, the facts and the staff.
import { LANES, hourLabel, levelLabel } from "../community/community-shared.js";
import { avatarMarkup } from "../auth/auth-avatar.js";
import { escapeHtml as esc } from "../../lib/dom.js";
import { format, kindLabel, roleLabel } from "../community/labels.js";
import { getSeriesScore } from "../../../shared/draft-model.js";
import { icon } from "../../../shared/icons.js";
import { laneLogos, laneName } from "../../domain/lanes.js";
import { lineHtml } from "../community/stage.js";
import { recordOf } from "./team-list.js";
import { seriesRow } from "../scrims/rows.js";
import { t } from "../../app/browser-i18n.js";
import { languageNames } from "./team-shared.js";

// ---- Overview ---------------------------------------------------------------------------------
/** The five lanes, each with the player who plays it (or an open slot). */
export function lineup(team, staff) {
  return `<section class="card tp-lineup" aria-labelledby="tp-lineup-title"><div class="card__head"><h2 id="tp-lineup-title">${t("Roster roles")}</h2>${staff ? `<button type="button" class="btn btn--sm" data-team="tab" data-tab="roster">${icon("users", "i--sm")}${t("Roster")}</button>` : ""}</div><ol class="tp-lineup__list">${LANES.map(
    lane => {
      const players = team.members.filter(member => member.lane === lane);
      const first = players[0];
      return `<li class="${first ? "" : "is-open"}">${laneLogos([lane], 34, { decorative: true })}<b>${esc(laneName(lane))}</b>${
        first
          ? `<a class="tp-lineup__who" href="/players/${encodeURIComponent(first.tag)}">${avatarMarkup(first, 40)}<span>${esc(first.name)}${players.length > 1 ? ` <small>+${players.length - 1}</small>` : ""}</span></a>`
          : `<span class="muted tp-lineup__who">${t("Open slot")}</span>`
      }</li>`;
    }
  ).join("")}</ol></section>`;
}

/** A line of the next events (Overview): the day, the title, the hour; a click opens the agenda. */
export const nextEvent = event =>
  `<button type="button" class="tp-next k-${esc(event.kind)}" data-team="tab" data-tab="agenda"><span class="cm-date">${new Date(event.startsAt).getDate()}<small>${esc(format(event.startsAt, { weekday: "short" }))}</small></span><span class="row__body"><b>${esc(event.title || kindLabel(event.kind))}</b><small>${esc(hourLabel(event.startsAt))}–${esc(hourLabel(event.endsAt))} · ${esc(kindLabel(event.kind))}</small></span>${icon("right", "i--sm")}</button>`;

export function overviewPanel(team, staff, data) {
  const events = data.agenda.items.filter(item => item.kind !== "unavailable").slice(0, 4);
  const series = data.series?.items ?? [];
  const staffList = team.members.filter(member =>
    ["owner", "manager", "coach"].includes(member.role)
  );
  const facts = [
    [t("Region"), team.region],
    [t("Level"), levelLabel(team.level)],
    [t("Time zone"), team.timezone],
    [t("Languages"), languageNames(team.languages).join(", ")],
    [t("Founded"), format(team.createdAt, { dateStyle: "medium" })],
    [t("Member limit"), String(team.maxMembers)]
  ].filter(([, value]) => value);
  const about = team.description
    ? `<section class="card team-about"><div class="card__head"><h2>${t("About")}</h2></div><p>${esc(team.description)}</p></section>`
    : staff
      ? lineHtml(
          "pencil",
          t("No description yet."),
          "",
          `<button type="button" class="btn btn--sm" data-team="open-form">${t("Edit the team")}</button>`,
          "cm-line"
        )
      : "";
  const done = recordOf(
    team,
    series.map(item => ({
      teamA: item.teamA.name,
      teamB: item.teamB.name,
      status: item.status,
      score: getSeriesScore(item)
    }))
  );
  const record = team.myRole
    ? `<section class="card"><div class="card__head"><h2>${t("Series")}</h2></div><ul class="tp-record tp-record--card">${[
        [data.series?.total ?? 0, t("Total")],
        [done.won, t("Won")],
        [done.lost, t("Lost")]
      ]
        .map(([value, label]) => `<li><b>${value}</b><span>${label}</span></li>`)
        .join("")}</ul></section>`
    : "";
  return `<div class="cm-layout cm-layout--side tp-overview">
      <div class="cm-main">
        ${lineup(team, staff)}
        ${about}
        <section class="card" aria-labelledby="tp-next-title"><div class="card__head"><h2 id="tp-next-title">${team.myRole ? t("Agenda") : t("Public availability")}</h2>${events.length ? `<button type="button" class="btn btn--sm btn--ghost" data-team="tab" data-tab="agenda">${t("Agenda")}${icon("arrow", "i--sm")}</button>` : ""}</div>${
          events.length
            ? `<div class="list">${events.map(nextEvent).join("")}</div>`
            : lineHtml(
                "calendar",
                t("Nothing planned in the next 60 days."),
                "",
                data.agenda.canSchedule
                  ? `<button type="button" class="btn btn--sm" data-team="new-event-tab">${icon("plus", "i--sm")}${t("Add an event")}</button>`
                  : "",
                "cm-line"
              )
        }</section>
      </div>
      <aside class="cm-side tp-aside">
        <section class="card"><div class="card__head"><h2>${t("Team")}</h2></div><dl class="tp-facts">${facts.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl></section>
        <section class="card"><div class="card__head"><h2>${t("Staff (manager, coach, analyst)")}</h2></div><div class="list">${staffList
          .map(
            member =>
              `<a class="row link-row" href="/players/${encodeURIComponent(member.tag)}">${avatarMarkup(member, 40)}<span class="row__body"><b>${esc(member.name)}</b><small>${esc(roleLabel(member.role))}</small></span></a>`
          )
          .join("")}</div></section>
        ${record}
      </aside>
    </div>
    ${
      team.myRole
        ? `<section class="card tp-lastseries" aria-labelledby="tp-last-title"><div class="card__head"><h2 id="tp-last-title">${t("Series")}</h2><button type="button" class="btn btn--sm btn--ghost" data-team="tab" data-tab="series">${t("Series")}${icon("arrow", "i--sm")}</button></div>${
            series.length
              ? `<div class="list tp-series">${series.slice(0, 2).map(seriesRow).join("")}</div>`
              : lineHtml(
                  "swords",
                  t("No series shared with the team yet."),
                  "",
                  `<button type="button" class="btn btn--sm" data-team="tab" data-tab="series">${t("Series")}</button>`,
                  "cm-line"
                )
          }</section>`
        : ""
    }`;
}
