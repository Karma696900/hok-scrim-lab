// Loading the events and writing the agenda into the page.
import { agendaStepsHtml, lineHtml, paintStage, setFigure, stageHtml } from "./stage.js";
import { format } from "./labels.js";
import { icon } from "../../../shared/icons.js";
import { number, t } from "../../app/browser-i18n.js";
import { ATTEND, DAY, addDays, monthStart, weekStart } from "./agenda-shared.js";
import { listView } from "./agenda-views.js";

// ---- the page ---------------------------------------------------------------------------------
export const range = page => {
  if (page.view === "list") {
    const from = Date.now() - 3600_000;
    return [from, from + 62 * DAY];
  }
  const from = (
    page.view === "week" ? weekStart(page.cursor) : weekStart(monthStart(page.cursor))
  ).getTime();
  return [from, from + (page.view === "week" ? 7 : 42) * DAY];
};

export async function load(page) {
  const [from, to] = page.range();
  page.events = (await page.api(`/api/me/agenda?from=${from}&to=${to}`)).items;
}

export async function loadUpcoming(page) {
  const from = Date.now() - 3600_000;
  page.upcoming = (await page.api(`/api/me/agenda?from=${from}&to=${from + 62 * DAY}`)).items;
  const root = page.ctx.root();
  const attend = page.upcoming.filter(event => ATTEND(event) && event.endsAt > Date.now());
  setFigure(
    root,
    "fig-week",
    number(attend.filter(event => event.startsAt < Date.now() + 7 * DAY).length)
  );
  setFigure(root, "fig-answer", number(attend.filter(event => !event.rsvp.mine).length));
}

export const title = page => {
  if (page.view === "month") {
    return format(page.cursor, { month: "long", year: "numeric" });
  }
  if (page.view === "week") {
    const monday = weekStart(page.cursor);
    const sunday = addDays(monday, 6);
    return `${format(monday, { day: "numeric", month: "short" })} – ${format(sunday, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return t("Next 60 days");
};

/** The position of the events on the hour grid, and of the line for the present hour: CSS variables. */
export function placeEvents(root) {
  const week = root.querySelector(".ag-week");
  if (!week) {
    return;
  }
  const from = Number(week.dataset.from) * 60;
  week.style.setProperty("--hours", week.dataset.hours);
  for (const item of week.querySelectorAll(".wev")) {
    const start = Number(item.dataset.start);
    item.style.setProperty("--top", String((start - from) / 60));
    item.style.setProperty("--len", String((Number(item.dataset.end) - start) / 60));
    item.style.setProperty("--lane", item.dataset.lane);
    item.style.setProperty("--lanes", item.dataset.lanes);
  }
  for (const line of week.querySelectorAll(".ag-marker")) {
    line.style.setProperty("--top", String((Number(line.dataset.now) - from) / 60));
  }
}

export function paint(page) {
  const root = page.ctx.root();
  const days = page.byDay();
  root.querySelector("#agenda-title").textContent = page.title();
  root.querySelector("#agenda-main").innerHTML =
    page.view === "month"
      ? page.monthView(days)
      : page.view === "week"
        ? page.weekView(days)
        : listView(days);
  placeEvents(root);
  root.querySelector("#agenda-day").innerHTML = page.dayPanel(days);
  root.querySelector("#agenda-upcoming").innerHTML = page.upcomingPanel();
  for (const button of root.querySelectorAll(
    "[data-community='agenda-prev'], [data-community='agenda-next'], [data-community='agenda-today']"
  )) {
    button.hidden = page.view === "list";
  }
  const label =
    page.view === "week"
      ? [t("Previous week"), t("Next week")]
      : [t("Previous month"), t("Next month")];
  root.querySelector("[data-community='agenda-prev']").setAttribute("aria-label", label[0]);
  root.querySelector("[data-community='agenda-next']").setAttribute("aria-label", label[1]);
  for (const button of root.querySelectorAll("[data-community='agenda-view']")) {
    const on = button.dataset.mode === page.view;
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", String(on));
  }
}

export const empty = (page, hero) => {
  const root = page.ctx.root();
  root.innerHTML = `${stageHtml({
    cls: "ag-stage",
    hero,
    title: t("Agenda"),
    text: t("Join or create a team to get an agenda."),
    actions: `<a class="btn btn--primary btn--lg" href="/teams">${icon("users")}${t("Teams")}</a>`
  })}${lineHtml("users", t("No team yet"), t("Your agenda shows the events of your teams."), `<a class="btn btn--primary btn--sm" href="/teams">${t("Teams")}</a>`)}
      <section class="fd-how ag-how" aria-labelledby="ag-how-title"><h2 id="ag-how-title">${t("How the agenda works")}</h2>${agendaStepsHtml()}</section>`;
  paintStage(root, hero);
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { range, load, loadUpcoming, title, paint, empty };
