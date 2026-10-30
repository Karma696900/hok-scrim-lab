// training, small helpers: address, options, goalForm, progressTable, and 7 more.
import {
  EXERCISES,
  GOAL_LIMITS,
  MAX_GOALS_PER_TEAM,
  exerciseOf
} from "../../../shared/reflex-model.js";
import { HERO_GOAL_FORMS, MAX_HERO_GOALS_PER_TEAM } from "../../../shared/combo-model.js";
import { avatarMarkup } from "../auth/auth-avatar.js";
import { escapeHtml } from "../../lib/escape.js";
import { exerciseName, goalParts, scoreText } from "../../domain/reflex-labels.js";
import { heroGoalFormLabel, heroGoalRow } from "../../domain/hero-combos.js";
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";

export const address = (teamId, ...rest) =>
  ["/api/teams", encodeURIComponent(teamId), "training", ...rest].join("/");

export const options = (values, selected, label) =>
  values
    .map(
      value =>
        `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label(value))}</option>`
    )
    .join("");

export function goalForm(canAssign, count) {
  if (!canAssign) {
    return "";
  }
  if (count >= MAX_GOALS_PER_TEAM) {
    return `<p class="muted">${t("A team has at most {max} training goals.", { max: MAX_GOALS_PER_TEAM })}</p>`;
  }
  return `<form id="goal-form" class="form-grid goal-form" novalidate>
        <label class="label">${t("Period")}<span class="field"><select id="goal-period" name="period">${options(["day", "week"], "day", period => (period === "day" ? t("Every day") : t("Every week")))}</select></span></label>
        <label class="label">${t("Counted in")}<span class="field"><select id="goal-metric" name="metric">${options(["runs", "minutes"], "runs", metric => (metric === "runs" ? t("Runs") : t("Minutes")))}</select></span></label>
        <label class="label">${t("Amount")}<span class="field"><input id="goal-amount" name="amount" type="number" inputmode="numeric" min="1" max="${GOAL_LIMITS.runs.week}" value="10" required></span></label>
        <label class="label">${t("Exercise")}<span class="field"><select id="goal-exercise" name="exercise"><option value="">${t("Any exercise")}</option>${options(
          EXERCISES.map(exercise => exercise.id),
          "",
          exerciseName
        )}</select></span></label>
        <p class="form-error full" id="goal-error" role="alert"></p>
        <div class="full hstack"><button class="btn btn--primary" type="submit" data-goal-submit>${icon("plus", "i--sm")}${t("Add the goal")}</button><button class="btn btn--ghost" type="button" data-team="goal-cancel" hidden>${t("Cancel")}</button></div>
      </form>`;
}

/** What a player is asked and how far they are, as a line of numbers per goal (reflex goals, then heroes). */
export function progressTable(view, { goals, heroGoals, players }) {
  if (!goals.length && !heroGoals.length) {
    return "";
  }
  if (!players.length) {
    return `<p class="muted">${t("Nobody is asked to train yet: the goals are for the players, the substitutes and the captains.")}</p>`;
  }
  const head = [
    ...goals.map(goal => {
      const parts = goalParts(goal);
      return `<th scope="col" class="r goal-head">${escapeHtml(parts.period)}<small>${escapeHtml(parts.amount)} · ${escapeHtml(parts.exercise)}</small></th>`;
    }),
    ...heroGoals.map(
      goal =>
        `<th scope="col" class="r goal-head">${escapeHtml(view.heroName(goal.heroId))}<small>${escapeHtml(heroGoalFormLabel(goal.form))}</small></th>`
    )
  ].join("");
  const cell = progress => {
    const shown = progress ?? { done: 0, target: 0, complete: false };
    return `<td class="r"><span class="goal-cell${shown.complete ? " is-done" : ""}">${shown.complete ? icon("check", "i--sm") : ""}${shown.done} / ${shown.target}</span></td>`;
  };
  const rows = players
    .map(
      player =>
        `<tr><th scope="row"><b>${escapeHtml(player.name)}</b><small class="faint"> #${escapeHtml(player.tag)}</small></th>${goals
          .map(goal =>
            cell(player.progress[goal.id] ?? { done: 0, target: goal.amount, complete: false })
          )
          .join("")}${heroGoals.map(goal => cell(player.heroProgress?.[goal.id])).join("")}</tr>`
    )
    .join("");
  return `<div class="table-scroll"><table class="table table--boxed goal-table"><thead><tr><th scope="col">${t("Player")}</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export const heroOf = (view, id) => view.state.heroes.find(hero => hero.id === id) ?? null;

export const heroName = (view, id) => view.heroOf(id)?.displayName || view.heroOf(id)?.name || id;

export const combosText = count => t("{count, plural, one {# combo} other {# combos}}", { count });

/** What the staff asks for the heroes: their combos acquired, in one form or in both. */
export function heroGoalsCard(view, { heroGoals, canAssign, heroesWithCombos }) {
  const list = heroGoals.length
    ? `<ul class="stack-y goal-list">${heroGoals
        .map(goal =>
          heroGoalRow(goal, {
            hero: view.heroOf(goal.heroId),
            action: `<span class="hstack"><span class="muted">${escapeHtml(combosText(goal.target))}</span>${canAssign ? `<button type="button" class="btn btn--ghost btn--sm" data-team="hero-goal-delete" data-id="${escapeHtml(goal.id)}">${t("Delete")}</button>` : ""}</span>`
          })
        )
        .join("")}</ul>`
    : `<p class="muted">${canAssign ? t("No goal about a hero yet. Ask the players to acquire the combos of a hero.") : t("The staff has not asked anything about the heroes yet.")}</p>`;
  const heroes = Object.entries(heroesWithCombos)
    .map(([id, count]) => ({ id, count, name: view.heroName(id) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  let form = "";
  if (canAssign && heroGoals.length >= MAX_HERO_GOALS_PER_TEAM) {
    form = `<p class="muted">${t("A team has at most {max} goals about heroes.", { max: MAX_HERO_GOALS_PER_TEAM })}</p>`;
  } else if (canAssign && !heroes.length) {
    form = `<p class="muted">${t("No hero has a combo yet: the editors write them in the hero guides.")}</p>`;
  } else if (canAssign) {
    form = `<form id="hero-goal-form" class="form-grid goal-form" novalidate>
          <label class="label">${t("Hero")}<span class="field"><select id="hero-goal-hero" name="heroId">${heroes.map(hero => `<option value="${escapeHtml(hero.id)}">${escapeHtml(hero.name)} · ${escapeHtml(combosText(hero.count))}</option>`).join("")}</select></span></label>
          <label class="label">${t("Acquired in")}<span class="field"><select id="hero-goal-form-kind" name="form">${options(HERO_GOAL_FORMS, "both", heroGoalFormLabel)}</select></span></label>
          <p class="form-error full" id="hero-goal-error" role="alert"></p>
          <div class="full"><button class="btn btn--primary" type="submit">${icon("plus", "i--sm")}${t("Ask for this hero")}</button></div>
        </form>`;
  }
  return `<section class="card" id="team-hero-goals">
        <div class="card__head"><h2>${t("Heroes to master")}</h2><span class="pill pill--grey">${heroGoals.length} / ${MAX_HERO_GOALS_PER_TEAM}</span></div>
        <p class="muted">${t("Each player is asked to acquire the combos of these heroes, in the form that is chosen. The combos are the ones the editors wrote for the hero.")}</p>
        ${list}
        ${form}
      </section>`;
}

/** The numbers on top of the tab: what is asked, of how many players, and how many have done it all. */
export function strip({ goals, heroGoals, players }) {
  const asked = goals.length + heroGoals.length > 0;
  const done = asked
    ? players.filter(
        player =>
          goals.every(goal => player.progress[goal.id]?.complete) &&
          heroGoals.every(goal => player.heroProgress?.[goal.id]?.complete)
      ).length
    : 0;
  return `<ul class="tp-record">${[
    [goals.length, t("Training goals")],
    [heroGoals.length, t("Heroes to master")],
    [players.length, t("Players")],
    [done, t("All goals done")]
  ]
    .map(([value, label]) => `<li><b>${value}</b><span>${label}</span></li>`)
    .join("")}</ul>`;
}

/** The ranking card: the staff decides whether the players see it; the table is filled apart. */
export function rankingCard(view, { canAssign, settings }) {
  const periods = [
    ["week", t("This week")],
    ["all", t("All time")]
  ];
  return `<section class="card" id="team-ranking">
        <div class="card__head"><h2>${t("Ranking")}</h2>${
          canAssign
            ? `<label class="chip-check"><input type="checkbox" id="rank-visible"${settings.leaderboard ? " checked" : ""}><span>${t("Show the ranking to the players")}</span></label>`
            : ""
        }</div>
        <p class="muted">${t("The best score of each player who is asked to train, in the exercise you choose. A tie shares the place.")}</p>
        <div class="hstack wrap rank-controls">
          <label class="field"><select id="rank-exercise" aria-label="${t("Exercise")}">${options(
            EXERCISES.map(exercise => exercise.id),
            view.ranking.exercise,
            exerciseName
          )}</select></label>
          <div class="seg" role="group" aria-label="${t("Period")}">${periods
            .map(
              ([period, label]) =>
                `<button type="button" class="${view.ranking.period === period ? "on" : ""}" data-team="rank-period" data-period="${period}" aria-pressed="${view.ranking.period === period}">${label}</button>`
            )
            .join("")}</div>
        </div>
        <div id="team-ranking-body" aria-live="polite"></div>
      </section>`;
}

/** The table of the ranking for the exercise and the period that are chosen. */
export async function fillRanking(view, root, teamId) {
  const body = root.querySelector("#team-ranking-body");
  if (!body) {
    return;
  }
  body.innerHTML = `<div class="loading-line"></div>`;
  try {
    const { rows } = await view.api(
      `${address(teamId, "ranking")}?exercise=${encodeURIComponent(view.ranking.exercise)}&period=${view.ranking.period}`
    );
    if (root.querySelector("#team-ranking-body") !== body) {
      return; // the page was drawn again meanwhile
    }
    const exercise = exerciseOf(view.ranking.exercise);
    body.innerHTML = rows.length
      ? `<div class="table-scroll"><table class="table table--boxed rank-table"><thead><tr><th scope="col">#</th><th scope="col">${t("Player")}</th><th scope="col" class="r">${t("Best")}</th><th scope="col" class="r">${t("Runs")}</th></tr></thead><tbody>${rows
          .map(
            row =>
              `<tr class="${row.userId === view.state.auth.user?.id ? "is-me" : ""}"><td class="rank-place">${row.rank}</td><th scope="row"><span class="hstack">${avatarMarkup(row, 28)}<b>${escapeHtml(row.name)}</b><small class="faint">#${escapeHtml(row.tag)}</small></span></th><td class="r">${escapeHtml(scoreText(exercise, row.best))}</td><td class="r">${row.runs}</td></tr>`
          )
          .join("")}</tbody></table></div>`
      : `<p class="muted">${view.ranking.period === "week" ? t("Nobody has played this exercise this week.") : t("Nobody has played this exercise yet.")}</p>`;
  } catch (error) {
    body.innerHTML = `<p class="form-error" role="alert">${escapeHtml(error.message)}</p>`;
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { progressTable, heroOf, heroName, heroGoalsCard, rankingCard, fillRanking };
