// Find a scrim. Wireframe:
//   1. the stage: a cover, the title (64 px), three numbers (open announcements, teams, regions), the main action;
//   2. three columns: the filters on the left (date, window, level, region, format, hero rule, control), the
//      announcements as cards in the middle (team mark, note, rules, the slot as a big date, "Request"), and on
//      the right the panel that publishes an announcement, then the announcements and requests of the person and
//      a short directory of teams;
//   3. "How a scrim works" in three steps under it all.
// The server decides who may do what; the buttons only hide what would be refused.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { skeleton } from "../../lib/skeleton.js";
import {
  CONTROLS,
  FORMATS,
  HERO_RULES,
  LEVELS,
  REGIONS,
  controlLabel,
  levelLabel,
  options,
  ruleLabel
} from "./community-shared.js";
import { paintStage, scrimStepsHtml, stageHero, stageHtml } from "./stage.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as findForms } from "./find-forms.js";
import { onView as findList } from "./find-list.js";
import { onView as findSide } from "./find-side.js";
import { onView as findActions } from "./find-actions.js";
import { actionsOf, formsOf } from "./find-actions.js";
import { chips } from "./find-forms.js";

export function createFindPage(ctx) {
  const view = { ctx, show };
  bindTo(view, findForms, findList, findSide, findActions);
  ({ api: view.api, tell: view.tell, go: view.go, hydration: view.hydration } = view.ctx);
  view.posts = [];
  view.mine = [];
  view.requests = [];
  view.directory = [];

  const anyOption = `<option value="">${t("Any")}</option>`;

  // ---- the page ---------------------------------------------------------------------------------
  async function show() {
    const root = view.ctx.root();
    await view.ctx.loadMyTeams();
    // While the page starts up the list the server drew stays until the real one arrives (no
    // collapse to a loading line, no layout shift).
    const drawn = view.hydration?.active() ? root.querySelector("#post-list")?.innerHTML : "";
    const hero = stageHero(6);
    root.innerHTML = `${stageHtml({
      cls: "fd-stage",
      hero,
      title: t("Find a scrim"),
      text: t("Search open announcements and teams that match your level, time zone and format."),
      actions: `<button type="button" class="btn btn--primary btn--lg" data-community="open-post-form">${icon("plus")}${t("Post “Looking for scrim”")}</button><a class="btn btn--lg" href="/teams">${icon("users")}${t("Teams")}</a>`,
      figures: [
        ["–", t("Open announcements"), "fig-open"],
        ["–", t("Teams"), "fig-teams"],
        ["–", t("Regions"), "fig-regions"]
      ]
    })}
      <div class="cm-layout cm-layout--3 fd-layout rise d-1">
        <form id="find-filters" class="cm-filters" role="search" novalidate>
          <button type="button" class="btn cm-filters__toggle" data-community="filters-toggle" aria-expanded="false" aria-controls="find-filters-body">${icon("filter", "i--sm")}<span>${t("Filters")}</span></button>
          <div class="cm-filters__body" id="find-filters-body">
            <label class="label">${t("Date")}<span class="field"><input id="f-date" name="date" type="date"></span></label>
            <fieldset class="cm-group"><legend>${t("Window")}</legend><div class="cm-chips">${[["", t("Any length")], ...[2, 3, 4].map(hours => [String(hours), t("At least {hours} h", { hours })])].map(([value, text], index) => `<label class="cm-chip"><input type="radio" name="minHours" value="${value}"${index === 0 ? " checked" : ""}><span>${esc(text)}</span></label>`).join("")}</div></fieldset>
            <label class="label">${t("Level")}<span class="field"><select id="f-level" name="level">${anyOption}${options(LEVELS, "", levelLabel)}</select></span></label>
            <label class="label">${t("Region")}<span class="field"><select id="f-region" name="region">${anyOption}${options(REGIONS, "")}</select></span></label>
            <fieldset class="cm-group"><legend>${t("Format")}</legend><div class="cm-chips">${chips("format", FORMATS, value => `BO${value}`)}</div></fieldset>
            <fieldset class="cm-group"><legend>${t("Hero rule")}</legend><div class="cm-chips">${chips("rule", HERO_RULES, ruleLabel)}</div></fieldset>
            <fieldset class="cm-group"><legend>${t("Draft control")}</legend><div class="cm-chips">${chips("control", CONTROLS, controlLabel)}</div></fieldset>
            <button type="button" class="btn btn--ghost btn--sm" data-community="reset-filters" hidden>${icon("refresh", "i--sm")}${t("Reset")}</button>
          </div>
        </form>
        <section class="cm-main" aria-label="${t("Find a scrim")}">
          <div id="composer-slot" hidden></div>
          <div class="cm-bar"><p id="posts-count" role="status"></p><button type="button" class="btn btn--ghost btn--sm" data-community="reset-filters" hidden>${icon("refresh", "i--sm")}${t("Reset")}</button></div>
          <div class="fd-list" id="post-list">${drawn || skeleton("list", 4)}</div>
          <div id="fd-directory"></div>
          <section class="fd-how" aria-labelledby="fd-how-title"><h2 id="fd-how-title">${t("How a scrim works")}</h2>${scrimStepsHtml()}</section>
        </section>
        <aside class="cm-side" aria-label="${t("Your announcements")}">
          ${view.publishPanel()}
          <div class="fd-rest" id="find-side"><div id="fd-side-cards"></div></div>
        </aside>
      </div>`;
    paintStage(root, hero);
    await Promise.all([view.loadPosts(), view.loadSide()]);
    const wanted = new URLSearchParams(location.search).get("to");
    if (wanted) {
      try {
        view.openComposer(await view.api(`/api/teams/${encodeURIComponent(wanted)}`));
      } catch {
        /* unknown team: the list is shown */
      }
    }
  }

  view.actions = actionsOf(view);

  view.forms = formsOf(view);

  return { show, actions: view.actions, forms: view.forms, change: view.change };
}
