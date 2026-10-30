import { icon } from "../../../shared/icons.js";
import { dataNotice, escapeHtml } from "../../lib/dom.js";
import { t, number } from "../../app/browser-i18n.js";
import { state } from "../../app/app-state.js";
import { MODES, renderNewSeriesForm } from "./new-series.js";
import { emptyLine, seriesRow } from "./rows.js";
import { sceneHtml } from "./scene.js";

// The Scrims page: the stage with the three numbers, the series of the person as rich rows (tabs and a
// search), the quick starts, and on the right the panel that sets up a new series.

const modeName = id => MODES.find(mode => mode.id === id)?.title() ?? "";

/** The series that match a tab ("all", "live", "done") and the words typed in the search. */
function matchingSeries(tab, query) {
  const needle = query.trim().toLocaleLowerCase();
  return state.series
    .filter(series => {
      const live = series.status === "active";
      if ((tab === "live" && !live) || (tab === "done" && live)) {
        return false;
      }
      return (
        !needle ||
        [series.teamA.name, series.teamB.name, modeName(series.gameMode)].some(text =>
          text.toLocaleLowerCase().includes(needle)
        )
      );
    })
    .toSorted((left, right) => (right.status === "active") - (left.status === "active")); // what is being played first
}

/** A series to launch in one click: a rule and a format; the panel on the right takes them over. */
const QUICK_STARTS = [
  ["global-ban-pick", 3],
  ["global-ban-pick", 5],
  ["free-for-all", 1],
  ["classic", 3]
];

export function quickStartHtml() {
  return `<section class="card sc-quick rise d-1" aria-labelledby="quick-title"><div class="card__head"><h2 id="quick-title">${t("Quick start")}</h2></div><div class="sc-quick__grid">${QUICK_STARTS.map(
    ([id, bestOf]) => {
      const mode = MODES.find(item => item.id === id);
      return `<button type="button" class="sc-quick__tile" data-action="quick-series" data-mode="${id}" data-best-of="${bestOf}">${icon(mode.icon, "i--lg")}<span><b>${mode.title()}</b><small>${mode.tag()} · ${t("Best of {count}", { count: bestOf })}</small></span>${icon("arrow", "i--sm")}</button>`;
    }
  ).join("")}</div></section>`;
}

/** The three moves of a series, for somebody who has none yet. */
function howItWorksHtml() {
  const steps = [
    [t("Set up"), t("Choose the hero rule, the format and the two teams.")],
    [t("Draft"), t("Ban and pick on a 30-second clock, alone, on one device or online.")],
    [t("Review"), t("Record the result, then export or share the series.")]
  ];
  return `<section class="card sc-how rise d-3" aria-labelledby="how-title"><div class="card__head"><h2 id="how-title">${t("How a series runs")}</h2></div><ol>${steps
    .map(([title, text]) => `<li><b>${title}</b><span>${text}</span></li>`)
    .join("")}</ol></section>`;
}

/** What the list says when it has nothing to show: one line and one action. */
const emptyList = () =>
  state.series.length
    ? emptyLine("search", t("No matches"), t("Adjust the active filters."))
    : emptyLine(
        "swords",
        t("Ready for the first draft"),
        t("Create a series to start a draft, or find a team to play against."),
        `<button type="button" class="btn btn--primary btn--sm" data-action="focus-new-series">${icon("plus", "i--sm")}${t("New series")}</button>`
      );

const rowsOf = (tab, query) => {
  const found = matchingSeries(tab, query);
  return found.length ? found.map(seriesRow).join("") : emptyList();
};

/** Redraws only the rows (and the tabs): the search field keeps its focus. */
export function refreshScrimList() {
  const list = document.querySelector("#scrim-list");
  if (!list) {
    return;
  }
  list.innerHTML = rowsOf(state.scrimTab, state.scrimQuery);
  for (const tab of document.querySelectorAll('[data-action="scrim-tab"]')) {
    const on = tab.dataset.tab === state.scrimTab;
    tab.classList.toggle("on", on);
    tab.setAttribute("aria-selected", String(on));
  }
}

export function scrimsPage() {
  const total = state.series.length;
  const live = state.series.filter(series => series.status === "active").length;
  const tabs = [
    ["all", t("All"), total],
    ["live", t("In progress"), live],
    ["done", t("Finished"), total - live]
  ];
  const scene = sceneHtml({
    title: t("Scrims & Drafts"),
    text: t("Prepare a series, draft live and keep the history of every game."),
    figures: [
      [number(live), t("In progress")],
      [number(total - live), t("Finished")],
      [number(total), t("Total")]
    ],
    actions: `<button type="button" class="btn btn--primary btn--lg" data-action="focus-new-series">${icon("plus")}${t("New series")}</button><a class="btn btn--lg" href="/live">${icon("bolt")}${t("Enter the room")}</a><button type="button" class="btn btn--lg btn--ghost" data-action="import-series">${icon("upload")}${t("Import series")}</button>`,
    salt: 0
  });
  return `${scene}
    <div class="sc-layout">
      <div class="sc-main">
        ${quickStartHtml()}
        <section class="card card--flush sc-listing rise d-2"><div class="tabrow"><div class="tabs" role="tablist" aria-label="${t("Series")}">${tabs
          .map(
            ([id, label, count]) =>
              `<button type="button" role="tab" aria-selected="${id === state.scrimTab}" class="${id === state.scrimTab ? "on" : ""}" data-action="scrim-tab" data-tab="${id}">${label}<em class="count">${count}</em></button>`
          )
          .join(
            ""
          )}</div><label class="field field--search">${icon("search", "i--sm")}<input id="scrim-search" type="search" placeholder="${t("Team, mode…")}" aria-label="${t("Team, mode…")}" value="${escapeHtml(state.scrimQuery)}" autocomplete="off"></label></div><div class="list sc-list" id="scrim-list" role="tabpanel">${rowsOf(state.scrimTab, state.scrimQuery)}</div></section>
        ${total ? "" : howItWorksHtml()}
        <div class="sc-notice">${dataNotice()}</div>
      </div>
      ${renderNewSeriesForm()}
    </div>`;
}
