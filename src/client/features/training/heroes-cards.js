// The cards of the heroes one works on, and the suggestions when there are none.
import { FOCUS_MAX } from "./training-shared.js";
import { classLabel, laneLogos } from "../../domain/lanes.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { featuredHtml, howHtml, paintFeatured } from "./showcase.js";
import { heroOfTheDay } from "../../domain/hero-of-the-day.js";
import { icon } from "../../../shared/icons.js";
import { lineHtml } from "../community/stage.js";
import { number, t } from "../../app/browser-i18n.js";

export const countText = view =>
  t("{count} of {max} heroes", { count: view.focus.length, max: FOCUS_MAX });

export const goalsOf = (view, id) =>
  view.assigned.teams.flatMap(entry => entry.heroGoals.filter(goal => goal.heroId === id));

/** How many combos of a hero wait to be checked; null when the list of the day is cut short. */
export const dueOf = (view, id) =>
  view.review && view.review.dueTotal <= view.review.due.length
    ? view.review.due.filter(combo => combo.heroId === id).length
    : null;

// ---- the cards of the heroes one works on ---------------------------------------------------------
export function heroCards(view) {
  return `<ul class="trn-cards fh-grid">${view.focus
    .map(id => {
      const hero = view.heroOf(id);
      const goals = view.goalsOf(id);
      const done = goals.filter(goal => goal.progress?.complete).length;
      const due = view.dueOf(id);
      const badges = [
        goals.length
          ? `<span class="trn-badge${done === goals.length ? " is-done" : ""}" title="${esc(t("Objective"))}">${icon(done === goals.length ? "check" : "flag", "i--sm")}${number(done)}/${number(goals.length)}</span>`
          : "",
        due
          ? `<span class="trn-badge is-due" title="${esc(t("To check"))}">${icon("refresh", "i--sm")}${number(due)}</span>`
          : ""
      ].join("");
      const roles = (hero?.roles ?? []).map(classLabel).join(" / ") || t("Global");
      return `<li class="trn-card keep-dark${id === view.opened ? " on" : ""}"><button type="button" class="focus-card" data-open="${esc(id)}" aria-pressed="${id === view.opened}" aria-label="${esc(view.heroName(id))}">${view.portrait(id, 192, "trn-card__img")}<span class="trn-card__lanes">${laneLogos(hero?.lanes ?? [], 22)}</span>${badges ? `<span class="trn-card__badges">${badges}</span>` : ""}<span class="trn-card__name"><b>${esc(view.heroName(id))}</b><small>${esc(roles)}</small></span></button><button type="button" class="btn btn--icon btn--sm trn-card__remove" data-untrain="${esc(id)}" aria-label="${esc(`${t("Remove")}: ${view.heroName(id)}`)}" title="${esc(t("Remove"))}">${icon("x", "i--sm")}</button></li>`;
    })
    .join("")}</ul>`;
}

/** A few heroes of the roster to start with: the same ones all day, never the one on the cover of the day. */
export function suggestions(view) {
  const pool = view.state.heroes.filter(hero => hero.availableGlobal !== false && !hero.isFlowborn);
  const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  const step = Math.max(1, Math.floor(pool.length / 7));
  const today = heroOfTheDay()?.id;
  const picks = [];
  for (let offset = 1; picks.length < 6 && offset <= pool.length; offset += 1) {
    const hero = pool[(day + offset * step) % pool.length];
    if (hero.id !== today && !view.focus.includes(hero.id) && !picks.includes(hero)) {
      picks.push(hero);
    }
  }
  return picks.length
    ? `<section aria-label="${esc(t("Add to my heroes"))}"><ul class="trn-cards trn-cards--picks">${picks
        .map(hero => {
          const name = hero.displayName || hero.name;
          const roles = (hero.roles ?? []).map(classLabel).join(" / ") || t("Global");
          return `<li class="trn-card keep-dark"><button type="button" class="trn-pickcard" data-add-hero="${esc(hero.id)}" aria-label="${esc(`${t("Add to my heroes")}: ${name}`)}">${view.portrait(hero.id, 192, "trn-card__img")}<span class="trn-card__lanes">${laneLogos(hero.lanes ?? [], 22)}</span><span class="trn-pickcard__add" aria-hidden="true">${icon("plus")}</span><span class="trn-card__name"><b>${esc(name)}</b><small>${esc(roles)}</small></span></button></li>`;
        })
        .join("")}</ul></section>`
    : "";
}

export function mine(view) {
  if (!view.focus.length) {
    return `${lineHtml(
      "target",
      t("No hero chosen yet"),
      t("Tick the heroes you work on in the list: they appear here for quick access.")
    )}${featuredHtml(esc, { add: true })}${view.suggestions()}${howHtml()}`;
  }
  return `<section aria-labelledby="trn-mine-title"><div class="trn-sec"><h2 id="trn-mine-title">${t("Heroes worked on")}</h2><span class="pill pill--blue">${esc(view.countText())}</span></div>${view.heroCards()}</section>`;
}

export function paintMine(view) {
  view.root.querySelector("#trn-mine").innerHTML = view.mine();
  if (!view.focus.length) {
    paintFeatured(view.root);
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { countText, goalsOf, dueOf, heroCards, suggestions, mine, paintMine };
