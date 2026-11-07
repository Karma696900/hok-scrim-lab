import { icon } from "../../../shared/icons.js";
import { skeleton } from "../../lib/skeleton.js";
import { responsive } from "../../../shared/media.js";
import { number, t } from "../../app/browser-i18n.js";
import * as heroStats from "../heroes/hero-stats.js";
import { api } from "../../app/api-client.js";
import { currentHero } from "../../app/roster-data.js";
import { app, escapeHtml, tell } from "../../lib/dom.js";
import { formatDuration, percent } from "../../lib/format.js";
import { render } from "../../app/router.js";
import { state } from "../../app/app-state.js";
import { emptyLine, summaryRow } from "../scrims/rows.js";
import { quickStartHtml } from "../scrims/scrim-list.js";
import { fillScene, sceneHtml } from "../scrims/scene.js";

// ---- History: filters, pagination and statistics all come from the server -----------------------
const EXPORT_MAX_SERIES = 100;
// the filter column is a block that opens and closes on a phone, and a plain column on a desktop
const WIDE = "(min-width: 1101px)";

const exportLimitMessage = () =>
  t("100 series maximum per export. Narrow the date range or filters.");

function historyQuery(extra = {}) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...state.historyFilters, ...extra })) {
    if (value !== "" && value !== undefined && value !== null) {
      parameters.set(key, String(value));
    }
  }
  return parameters.toString();
}

export async function loadHistory() {
  state.historyLoading = true;
  try {
    const [series, stats, heroes, board] = await Promise.all([
      api(`/api/series?${historyQuery({ view: "summary", page: state.historyPage, pageSize: 8 })}`),
      api(`/api/stats/overview?${historyQuery()}`),
      api(
        `/api/stats/heroes?${historyQuery({ page: state.heroPage, pageSize: 10, order: state.heroOrder, hero: state.heroSearch })}`
      ),
      // every hero of the filters, for the most picked and the most banned ones of the dashboard
      api(`/api/stats/heroes?${historyQuery({ page: 1, pageSize: 100, order: "presence" })}`)
    ]);
    state.history = { series, stats, heroes, board };
  } catch (error) {
    tell(error.message);
  } finally {
    state.historyLoading = false;
  }
  if (state.view === "history") {
    render();
  }
}

function pager(action, current, total, pageSize) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) {
    return "";
  }
  return `<nav class="pager" aria-label="${t("Pages")}"><button class="btn btn--sm" data-action="${action}" data-page="${current - 1}" ${current <= 1 ? "disabled" : ""}>${t("← Previous")}</button><span class="muted">${t("Page {current} of {pages} · {total} total", { current: current, pages: pages, total: total })}</span><button class="btn btn--sm" data-action="${action}" data-page="${current + 1}" ${current >= pages ? "disabled" : ""}>${t("Next →")}</button></nav>`;
}

/** A sample too small for a rate: how far it is from the threshold, in a few pixels and in words. */
function insufficientSample(row, minGames) {
  const text = t("Insufficient sample ({picked}/{minGames})", {
    picked: row.picked,
    minGames: minGames
  });
  return `<span class="hi-sample" title="${escapeHtml(text)}"><span class="bar" aria-hidden="true"><i data-p="${Math.min(100, Math.round((row.picked / minGames) * 100))}"></i></span><b aria-hidden="true">${row.picked}/${minGames}</b><span class="visually-hidden">${escapeHtml(text)}</span></span>`;
}

/** The periods that fill the dates of the filter in one click (the same as the periods of a hero sheet). */
const PRESETS = [
  ["all", () => t("All time")],
  ["3m", () => t("Last 3 months")],
  ["6m", () => t("Last 6 months")],
  ["year", () => t("This year")]
];

const field = (label, control) => `<label class="label">${label}${control}</label>`;

function filtersHtml() {
  const filters = state.historyFilters;
  const select = (name, label, options) =>
    field(
      label,
      `<span class="field"><select name="${name}">${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${filters[name] === value ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></span>`
    );
  const form = `<form id="history-filter-form" class="history-filters">
      ${field(t("Team name"), `<span class="field">${icon("search", "i--sm")}<input name="q" type="search" placeholder="${t("Team name")}" value="${escapeHtml(filters.q)}" autocomplete="off"></span>`)}
      ${select("status", t("Status"), [
        ["", t("Any status")],
        ["active", t("Active")],
        ["complete", t("Complete")],
        ["draw", t("Draw")]
      ])}
      ${select("mode", t("Hero rule"), [
        ["", t("Any hero rule")],
        ["global-ban-pick", t("Global Ban & Pick")],
        ["free-for-all", t("Free For All")],
        ["classic", t("Classic")]
      ])}
      <div class="hi-presets" role="group" aria-label="${t("Period")}">${PRESETS.map(([kind, label]) => `<button type="button" class="hi-preset" data-action="history-range" data-range="${kind}">${label()}</button>`).join("")}</div>
      <div class="hi-dates">${field(t("From"), `<span class="field"><input id="history-from" name="from" type="date" value="${escapeHtml(filters.from)}"></span>`)}${field(t("To"), `<span class="field"><input id="history-to" name="to" type="date" value="${escapeHtml(filters.to)}"></span>`)}</div>
      <div class="hi-filters__buttons"><button class="btn btn--primary" type="submit">${icon("filter", "i--sm")}${t("Apply")}</button><button class="btn btn--ghost" type="button" data-action="history-reset">${t("Reset")}</button></div>
    </form>`;
  const open = typeof matchMedia === "function" && matchMedia(WIDE).matches ? " open" : "";
  return `<aside class="card hi-filters rise d-1"><details${open}><summary>${icon("filter", "i--sm")}<h2>${t("Filters")}</h2>${icon("chevron", "i--sm")}</summary>${form}</details></aside>`;
}

/** How long the games lasted: the shortest, the average and the longest, on one scale. */
function lengthHtml(stats) {
  const { shortestSeconds: min, longestSeconds: max, averageDurationSeconds: average } = stats;
  if (min === null || max === null) {
    return "";
  }
  const place =
    average !== null && max > min ? Math.round(((average - min) / (max - min)) * 100) : 50;
  return `<section class="card hi-length rise d-2" aria-labelledby="length-title"><div class="card__head"><h2 id="length-title">${t("Duration")}</h2></div><div class="hi-range" aria-hidden="true"><span class="hi-range__track"><i data-p="${place}"></i></span></div><dl class="hi-length__facts"><div><dt>${t("Shortest game")}</dt><dd>${formatDuration(min)}</dd></div><div><dt>${t("Average game")}</dt><dd>${average === null ? "—" : formatDuration(average)}</dd></div><div><dt>${t("Longest game")}</dt><dd>${formatDuration(max)}</dd></div></dl></section>`;
}

/** A hero of the dashboard: a big portrait, its name and how many times it was picked or banned. */
function heroTile(row, key) {
  const hero = currentHero(row.heroId);
  const name = hero.displayName || hero.name;
  return `<li><button type="button" class="hi-hero" data-action="open-hero" data-hero-id="${escapeHtml(row.heroId)}" aria-label="${escapeHtml(name)}"><span class="hi-hero__art">${hero.image ? `<img ${responsive(hero.image, 128)} alt="" width="96" height="96" loading="lazy" decoding="async">` : ""}<em>${row[key]}</em></span><b>${escapeHtml(name)}</b></button></li>`;
}

/** The wins of each side: two big numbers around the ring of the share (the ring only when the sample allows it). */
function balanceHtml(stats) {
  const wins = stats.blueWins + stats.redWins;
  const side = wins
    ? `<div class="hi-wins"><div class="hi-wins__side blue"><b>${stats.blueWins}</b><span>${t("Blue")}</span></div>${stats.blueWinRate === null ? "" : `<div class="hi-wins__donut">${heroStats.donut(stats.blueWins, stats.redWins)}</div>`}<div class="hi-wins__side red"><b>${stats.redWins}</b><span>${t("Red")}</span></div></div>${stats.blueWinRate === null ? `<p class="hi-sample-note">${t("Insufficient sample ({gamesCount}/{minGames})", { gamesCount: stats.gamesCount, minGames: stats.minGames })}</p>` : `<p class="hi-sample-note">${t("Blue side win rate")} · <b>${percent(stats.blueWinRate)}</b></p>`}`
    : `<p class="hi-sample-note">${t("No hero sample")}</p>`;
  return wins
    ? `<section class="card hi-balance rise d-2"><div class="card__head"><h2>${t("Blue side – Red side wins")}</h2></div>${side}</section>`
    : "";
}

/** The dashboard: how long the games last, the heroes that came back the most and the ones that were banned the most. */
function dashboardHtml({ stats, board }) {
  const top = key =>
    board.rows
      .filter(row => row[key] > 0)
      .toSorted((left, right) => right[key] - left[key])
      .slice(0, 5);
  const picked = top("picked");
  const banned = top("banned");
  const length = lengthHtml(stats);
  const heroes = (title, list, key, emptyText) =>
    `<section class="card hi-module rise d-2"><div class="card__head"><h2>${title}</h2></div>${list.length ? `<ol class="hi-heroes">${list.map(row => heroTile(row, key)).join("")}</ol>` : `<p class="hi-sample-note">${emptyText}</p>`}</section>`;
  return `<div class="hi-dashboard${length ? "" : " hi-dashboard--two"}">
      ${length}
      ${heroes(t("Most picked"), picked, "picked", t("Draft stats appear after completed games are saved."))}
      ${heroes(t("Most banned"), banned, "banned", t("Draft stats appear after completed games are saved."))}
    </div>`;
}

/** The roster, for a history that has no game yet: real heroes to draft with, in place of an empty dashboard. One row of
 * 10 heroes, up to 16 on a wide screen (history.css shows as many as the width holds, at the same size). */
function rosterHtml() {
  const heroes = state.heroes
    .filter(hero => hero.availableGlobal !== false && hero.image && !hero.isFlowborn)
    .slice(0, 16);
  if (!heroes.length) {
    return "";
  }
  return `<section class="card hi-roster rise d-2"><div class="card__head"><h2>${t("Heroes")}</h2><a class="link" href="/heroes">${t("Browse heroes")}${icon("right", "i--sm")}</a></div><ul>${heroes
    .map(
      hero =>
        `<li><button type="button" class="hi-hero" data-action="open-hero" data-hero-id="${escapeHtml(hero.id)}" aria-label="${escapeHtml(hero.displayName || hero.name)}"><span class="hi-hero__art"><img ${responsive(hero.image, 128)} alt="" width="96" height="96" loading="lazy" decoding="async"></span><b>${escapeHtml(hero.displayName || hero.name)}</b></button></li>`
    )
    .join("")}</ul></section>`;
}

const actionsHtml = tooMany =>
  `<button type="button" class="btn btn--lg" data-action="export-pdf" ${tooMany ? "disabled" : ""}>${icon("download")}${t("Export PDF")}</button><button type="button" class="btn btn--lg btn--ghost" data-action="import-series">${icon("upload")}${t("Import series")}</button>`;

export function renderHistory() {
  const history = state.history;
  const tooMany = (history?.series.total ?? 0) > EXPORT_MAX_SERIES;
  const note = tooMany
    ? `<p class="export-note note note--warn" role="status">${icon("warn", "i--sm")}<span>${escapeHtml(exportLimitMessage())}</span></p>`
    : "";
  const scene = (figures, prefer) =>
    sceneHtml({
      title: t("History & stats"),
      text: t("Every number below comes from your completed scrims."),
      figures,
      actions: actionsHtml(tooMany),
      salt: 2,
      prefer,
      figuresClass: "stats-strip"
    });
  const figure = (value, label) => [value, label];
  if (!history) {
    app.innerHTML = `${scene(
      [
        figure("—", t("Series played")),
        figure("—", t("Games played")),
        figure("—", t("Average game")),
        figure("—", t("Total game time"))
      ],
      []
    )}${note}<div class="hi-layout"><div class="hi-side">${filtersHtml()}</div><div class="hi-main">${skeleton("list", 6)}</div></div>`;
    fillScene();
    return;
  }
  const { series, stats, heroes, board } = history;
  const duration = seconds => (seconds === null ? "—" : formatDuration(seconds));
  const noFilter = Object.values(state.historyFilters).every(value => value === "");
  const heroRows = heroes.rows
    .map(row => {
      const hero = currentHero(row.heroId);
      const name = hero.displayName || hero.name;
      return `<div class="hero-stats-row"><button type="button" class="hero-cell" data-action="open-hero" data-hero-id="${escapeHtml(row.heroId)}">${hero.image ? `<span class="pt pt--sq s-44"><img ${responsive(hero.image, 44)} alt="" width="44" height="44" loading="lazy" decoding="async"></span>` : `<span class="pt pt--sq s-44"></span>`}<span>${escapeHtml(name)}</span></button><span>${row.picked}</span><span>${row.banned}</span><span>${row.wins}-${row.losses}</span><span>${row.insufficient ? insufficientSample(row, heroes.minGames) : heroStats.bar(percent(row.winRate), row.winRate)}</span></div>`;
    })
    .join("");
  const heroTable = heroes.rows.length
    ? `<div class="hero-stats-table"><div class="hero-stats-head"><span>${t("Hero")}</span><span>${t("Pick")}</span><span>${t("Ban")}</span><span>${t("W-L")}</span><span>${t("Win rate")}</span></div>${heroRows}</div>${pager("hero-page", heroes.page, heroes.total, heroes.pageSize)}<p class="muted hi-note">${t("Win rates appear from {minGames} games picked.", { minGames: heroes.minGames })}</p>`
    : `<p class="hi-sample-note">${icon("book", "i--sm")}<span><b>${t("No hero sample")}</b> ${t("Draft stats appear after completed games are saved.")}</span></p>`;
  const seriesBlock = series.items.length
    ? `<div class="series-list list">${series.items.map(item => summaryRow(item)).join("")}</div>${pager("history-page", series.page, series.total, series.pageSize)}`
    : emptyLine(
        "swords",
        series.total === 0 && noFilter ? t("No scrim history") : t("Nothing matches these filters"),
        noFilter
          ? t("Results appear here after you record a game.")
          : t("Adjust or reset the filters."),
        noFilter
          ? `<button type="button" class="btn btn--primary btn--sm" data-action="new-series">${icon("plus", "i--sm")}${t("New series")}</button>`
          : ""
      );
  const seriesHtml = `<section class="card hi-series rise d-4"><div class="card__head"><h2>${t("Saved series")}</h2><span class="pill pill--grey">${series.total}</span></div>${seriesBlock}</section>${series.total === 0 && noFilter ? quickStartHtml() : ""}`;
  const sparse = heroes.rows.length === 0; // nothing to put in the table: the series take its place next to the filters
  const picked = board.rows.filter(row => row.picked > 0);
  const hero1 = picked.toSorted((left, right) => right.picked - left.picked)[0]?.heroId;
  const hero2 = board.rows.toSorted((left, right) => right.banned - left.banned)[0]?.heroId;
  app.innerHTML = `${scene(
    [
      figure(number(stats.seriesCount), t("Series played")),
      figure(number(stats.gamesCount), t("Games played")),
      figure(duration(stats.averageDurationSeconds), t("Average game")),
      figure(formatDuration(stats.totalDurationSeconds), t("Total game time"))
    ],
    [hero1, hero2].filter(Boolean)
  )}${note}
    ${stats.gamesCount ? dashboardHtml({ stats, board }) : rosterHtml()}
    <div class="hi-layout${sparse ? " hi-layout--sparse" : ""}">
      <div class="hi-side">${filtersHtml()}${balanceHtml(stats)}</div>
      <div class="hi-main">
        <section class="card hi-heroes-card rise d-3"><div class="card__head"><h2>${t("Hero draft stats")}</h2><span class="pill pill--grey">${t("Your scrims")}</span></div><form id="hero-stats-form" class="hi-hero-form"><label class="field field--grow">${icon("search", "i--sm")}<input name="hero" type="search" placeholder="${t("Search hero")}" value="${escapeHtml(state.heroSearch)}" aria-label="${t("Search hero")}" autocomplete="off"></label><label class="field"><select name="order" aria-label="${t("Sort heroes")}">${[
          ["presence", t("Most involved")],
          ["picked", t("Most picked")],
          ["banned", t("Most banned")],
          ["winrate", t("Best win rate")]
        ]
          .map(
            ([value, label]) =>
              `<option value="${value}" ${state.heroOrder === value ? "selected" : ""}>${label}</option>`
          )
          .join(
            ""
          )}</select></label><button class="btn btn--sm" type="submit">${t("Apply")}</button></form>${heroTable}</section>${sparse ? seriesHtml : ""}
      </div>
    </div>
    ${sparse ? "" : seriesHtml}`;
  fillScene();
}
