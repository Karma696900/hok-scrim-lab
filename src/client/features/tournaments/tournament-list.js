// The list: figures on the stage, a table, a page of series, the summary by event.
import { RELIABILITY, badge, ruleLabel } from "./tournament-model.js";
import { escapeHtml } from "../../lib/escape.js";
import { fillSceneArt, sceneArtSlot, sceneHero } from "../../domain/scene-art.js";
import { icon } from "../../../shared/icons.js";
import { number, t } from "../../app/browser-i18n.js";
import { skeleton } from "../../lib/skeleton.js";
import { teamEmblem } from "../../domain/team-emblem.js";

// ---- the list: figures on the stage, a table, a page of series, the summary by event ----------------

export const stage = view => {
  const figure = (value, label) =>
    `<div class="ws-figure"><b>${value}</b><span>${label}</span></div>`;
  const events = view.suggestions.events.length;
  return `<header class="page-head ws-stage keep-dark card--feature${view.rise()}">${sceneArtSlot("ws-stage__art", sceneHero(5))}
      <div class="ws-stage__main"><h1>${t("Tournaments")}</h1><p>${t("Real series that were played. Hero statistics and pairings come from here.")}</p>
        <div class="ws-stage__tools"><span class="pill pill--warn">${t("Admin")}</span>${view.editor ? "" : `<button type="button" class="btn btn--primary" data-new>${icon("plus")}${t("New series")}</button>`}</div></div>
      <div class="ws-figures">${figure(view.summary ? number(view.summary.series) : "&mdash;", t("Series"))}${figure(view.summary ? number(view.summary.games) : "&mdash;", t("Games"))}${figure(view.summary ? (events >= 50 ? "50+" : number(events)) : "&mdash;", t("Events"))}</div></header>`;
};

/** One series of the table: the event, the date, the two teams, the score, the format, what can be done. */
export const rowMarkup = item => `<tr class="series-entry">
      <th scope="row"><span class="ws-main-cell"><b>${escapeHtml(item.event)}</b>${item.stage ? `<small>${escapeHtml(item.stage)}</small>` : ""}</span></th>
      <td class="tn-date"><span class="ws-main-cell"><b>${escapeHtml(item.playedOn)}</b>${item.patch ? `<small>${t("patch {patch}", { patch: escapeHtml(item.patch) })}</small>` : ""}</span></td>
      <td class="tn-teams"><span class="series-versus">${teamEmblem(item.teamA, 28)}<b>${escapeHtml(item.teamA)}</b><span class="faint">vs</span>${teamEmblem(item.teamB, 28)}<b>${escapeHtml(item.teamB)}</b></span></td>
      <td class="r tn-scorecell"><b class="tn-score">${item.score.teamA} – ${item.score.teamB}</b></td>
      <td class="tn-format"><span class="pill pill--grey">${t("Best of")} ${item.bestOf}</span><span class="pill pill--grey">${escapeHtml(ruleLabel(item.rule))}</span>${item.ultimateBattle ? `<span class="pill pill--red">${t("Ultimate Battle")}</span>` : ""}</td>
      <td class="tn-reliability">${badge(item.verification, item.pickOrderKnown)}${item.verification === "verified" && item.pickOrderKnown === false ? `<small class="tn-count">${t("Pick order unknown")}</small>` : ""}${item.toCheck?.length ? `<small class="tn-count">${t("{count, plural, one {# point to check} other {# points to check}}", { count: item.toCheck.length })}</small>` : ""}</td>
      <td class="r tn-actions"><span class="hstack series-actions"><button type="button" class="btn btn--sm" data-edit="${escapeHtml(item.id)}" data-roles>${icon("swap", "i--sm")}${t("Lanes")}</button><button type="button" class="btn btn--sm" data-edit="${escapeHtml(item.id)}">${icon("pencil", "i--sm")}${t("Edit")}</button><button type="button" class="btn btn--danger btn--icon btn--sm" data-delete="${escapeHtml(item.id)}" aria-label="${t("Delete")}" title="${t("Delete")}">${icon("trash", "i--sm")}</button></span></td></tr>`;

export const listMarkup = view => {
  if (!view.list) {
    return `<section class="ws-card tn-list">${skeleton("list", 5)}</section>`;
  }
  const pages = Math.max(1, Math.ceil(view.list.total / 25));
  const table = `<div class="ws-scroll"><table class="ws-table series-table"><thead><tr><th scope="col" class="tn-first">${t("Event")}</th><th scope="col" class="tn-date">${t("Date")}</th><th scope="col">${t("Teams")}</th><th scope="col" class="r">${t("Score")}</th><th scope="col" class="tn-format">${t("Format")}</th><th scope="col" class="tn-reliability">${t("Reliability")}</th><th scope="col" class="r"><span class="visually-hidden">${t("Actions")}</span></th></tr></thead><tbody>${view.list.items.map(rowMarkup).join("")}</tbody></table></div>`;
  const pager =
    pages > 1
      ? `<nav class="pager tn-pager" aria-label="${t("Pages")}"><button type="button" class="btn btn--sm" data-page="${view.page - 1}" ${view.page <= 1 ? "disabled" : ""}>${t("Previous")}</button><span class="muted">${view.page} / ${pages}</span><button type="button" class="btn btn--sm" data-page="${view.page + 1}" ${view.page >= pages ? "disabled" : ""}>${t("Next")}</button></nav>`
      : "";
  const none = `<p class="empty-line tn-empty"><span>${view.query || view.verify ? t("No series matches.") : t("No series entered yet.")}</span>${view.query ? "" : `<button type="button" class="btn btn--sm" data-new>${icon("plus", "i--sm")}${t("New series")}</button>`}</p>${view.query ? "" : `<div class="tn-start">${quickSteps()}</div>`}`;
  return `<section class="ws-card tn-list${view.rise(" d-1")}">
      <div class="ws-bar"><label class="field field--search series-filter">${icon("search", "i--sm")}<input type="search" id="series-query" placeholder="${t("Filter by event, stage or team")}" aria-label="${t("Filter by event, stage or team")}" value="${escapeHtml(view.query)}"></label>
        <span class="ws-bar__end"><span class="pill pill--grey">${t("{count, plural, one {# series} other {# series}}", { count: view.list.total })}</span><button type="button" class="btn btn--sm" data-suggest-all>${icon("bolt", "i--sm")}${t("Suggest the lanes of all series")}</button></span></div>
      <div class="tn-verify seg" role="group" aria-label="${t("Filter by reliability")}"><button type="button" class="${view.verify ? "" : "on"}" aria-pressed="${!view.verify}" data-verify="">${t("All")} · ${number(view.summary ? Object.values(view.summary.verifications ?? {}).reduce((sum, count) => sum + count, 0) : 0)}</button>${RELIABILITY.map(([value, , , label]) => `<button type="button" class="${view.verify === value ? "on" : ""}" aria-pressed="${view.verify === value}" data-verify="${value}">${label()} · ${number(view.summary?.verifications?.[value] ?? 0)}</button>`).join("")}</div>
      ${view.proposalMarkup()}
      ${view.list.items.length ? table : none}
      ${pager}</section>`;
};

/** The series of the page, grouped by event: how many series and games each has, and when it was last played. */
export function eventsMarkup(view) {
  const byEvent = new Map();
  for (const item of view.list?.items ?? []) {
    const entry = byEvent.get(item.event) ?? { event: item.event, series: 0, games: 0, last: "" };
    entry.series += 1;
    entry.games += item.gamesCount ?? 0;
    entry.last = item.playedOn > entry.last ? item.playedOn : entry.last;
    byEvent.set(item.event, entry);
  }
  const events = [...byEvent.values()].sort((a, b) => b.last.localeCompare(a.last));
  return events.length
    ? `<ul class="tn-events">${events
        .map(
          entry =>
            `<li><button type="button" class="tn-event${view.query === entry.event ? " on" : ""}" data-event="${escapeHtml(entry.event)}"><b>${escapeHtml(entry.event)}</b><small>${t("{series, plural, one {# series} other {# series}} · {games, plural, one {# game} other {# games}}", { series: entry.series, games: entry.games })}</small><em>${escapeHtml(entry.last)}</em></button></li>`
        )
        .join("")}</ul>`
    : "";
}

/** The three steps of entering a series: in the list while it is empty, in the side column otherwise. */
export const quickSteps = () => `<ol class="ws-steps">
          <li><b>${t("Describe the series")}</b><span>${t("The event, the date, the two teams and the draft rule.")}</span></li>
          <li><b>${t("Pick the heroes")}</b><span>${t("Click a slot, type a hero name and press Enter: the next free slot is filled.")}</span></li>
          <li><b>${t("Give each hero its lane")}</b><span>${t("Slide a lane onto a hero, or click a lane and then a hero.")}</span></li>
        </ol>`;

/** Where the series that are entered are used: the pages that read them. */
export const usesMarkup = () => `<h3 class="ws-title">${t("Where the numbers go")}</h3>
        <div class="list">${[
          ["/popular", "trophy", t("Popular drafts")],
          ["/popular/heroes", "trend", t("Popular heroes")],
          ["/heroes", "users", t("Hero stats")]
        ]
          .map(
            ([href, name, label]) =>
              `<a class="row link-row" href="${href}">${icon(name, "i--sm")}<span class="row__body"><b>${label}</b></span>${icon("right", "i--sm")}</a>`
          )
          .join("")}</div>`;

/** The column on the right of the list: the events on this page, and the quickest way to enter a series. */
export const sideMarkup = view => {
  const events = view.eventsMarkup();
  const nothing = !events && !view.query; // no series at all: the steps are in the list
  return `<aside class="ws-panel tn-side${view.rise(" d-2")}">
      <div class="ws-panel__head"><h2>${t("By event")}</h2>${view.query ? `<button type="button" class="btn btn--ghost btn--sm" data-event="">${t("Show all series")}</button>` : ""}</div>
      <div class="ws-panel__body">${events || `<p class="ws-hint">${t("No series entered yet.")}</p>`}
        ${nothing ? usesMarkup() : `<h3 class="ws-title">${t("Quick entry")}</h3>${quickSteps()}`}</div></aside>`;
};

/** `frame`: the first drawing, before the data (the stage and the skeleton of the list), that the server draws too. */
export function paint(view, frame = false) {
  const html = `${view.stage()}${
    view.editor
      ? view.editorMarkup()
      : `<div class="tn-layout">${view.listMarkup()}${view.sideMarkup()}</div>`
  }`;
  if (frame) {
    view.root.paintFrame(html);
  } else {
    view.root.innerHTML = html;
  }
  fillSceneArt(view.root.querySelector(".ws-stage__art"), sceneHero(5));
  view.entered = true;
  if (view.active) {
    view.root.querySelector("#picker-search")?.focus({ preventScroll: true });
  }
}

export async function reload(view) {
  const [result, extra] = await Promise.all([
    view.api(view.listUrl(view.page)),
    view.api("/api/admin/tournaments/suggestions")
  ]);
  view.list = result;
  view.summary = result.summary;
  view.suggestions = extra;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { stage, listMarkup, eventsMarkup, sideMarkup, paint, reload };
