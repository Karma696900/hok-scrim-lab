// The training of a team: what its staff (the owner, the managers, the coaches) asks of the players
// each day or each week, and how far each player is in the period that is running. A player sees
// their own line, the staff sees everybody's.
import { EXERCISES } from "../../../shared/reflex-model.js";
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { goalRow } from "../../domain/reflex-labels.js";
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as trainingParts } from "./training-parts.js";
import { address, goalForm, strip } from "./training-parts.js";

export function createTeamTraining({ api, tell, state }) {
  const view = { state, api };
  bindTo(view, trainingParts);
  // what the ranking shows: kept while the person moves between tabs and teams
  view.ranking = { exercise: EXERCISES[0].id, period: "week" };

  return {
    /** What the team asks and how far the players are; null when it cannot be read. */
    load: teamId => view.api(address(teamId)).catch(() => null),

    panel(training) {
      const { goals, heroGoals, players, canAssign, timezone } = training;
      const list = goals.length
        ? `<ul class="stack-y goal-list">${goals
            .map(goal =>
              goalRow(
                goal,
                null,
                canAssign
                  ? `<span class="hstack"><button type="button" class="btn btn--ghost btn--sm" data-team="goal-edit" data-id="${escapeHtml(goal.id)}">${t("Edit")}</button><button type="button" class="btn btn--ghost btn--sm" data-team="goal-delete" data-id="${escapeHtml(goal.id)}">${t("Delete")}</button></span>`
                  : ""
              )
            )
            .join("")}</ul>`
        : `<p class="muted">${canAssign ? t("No goal yet. Ask the players for a number of runs or of minutes each day or each week.") : t("The staff has not set any goal yet.")}</p>`;
      return `${strip(training)}<div class="tp-training"><section class="card" id="team-goals">
          <div class="card__head"><h2>${t("Training goals")}</h2><span class="pill pill--grey">${escapeHtml(timezone)}</span></div>
          <p class="muted">${t("Each player is asked for a number of runs, or of minutes, of the reflex exercises each day or each week. A day, and a week from Monday, follow the clock of the team.")}</p>
          ${list}
          ${goalForm(canAssign, goals.length)}
        </section>
        <section class="card" id="team-progress">
          <div class="card__head"><h2>${canAssign ? t("Progress of the players") : t("Your progress")}</h2><a class="btn btn--sm btn--ghost" href="/training/reflex">${icon("bolt", "i--sm")}${t("Reflex training")}</a></div>
          ${goals.length || heroGoals.length ? view.progressTable({ goals, heroGoals, players }) : `<p class="muted">${t("Nothing to follow until a goal is set.")}</p>`}
        </section>
        ${view.heroGoalsCard(training)}
        ${training.canSeeRanking ? view.rankingCard(training) : ""}</div>`;
    },

    /** Fills the ranking card of the page that was just drawn (nothing when there is none). */
    fillRanking: view.fillRanking,

    /** The exercise or the period of the ranking was changed. */
    async chooseRanking(root, teamId, choice) {
      Object.assign(view.ranking, choice);
      for (const button of root.querySelectorAll('[data-team="rank-period"]')) {
        const on = button.dataset.period === view.ranking.period;
        button.classList.toggle("on", on);
        button.setAttribute("aria-pressed", String(on));
      }
      await view.fillRanking(root, teamId);
    },

    /** The staff opens the ranking to the players, or keeps it for itself. */
    async showRankingToPlayers(teamId, on) {
      await view.api(address(teamId, "settings"), { method: "PUT", body: { leaderboard: on } });
      tell(on ? t("The players can see the ranking") : t("The ranking is for the staff only"));
    },

    /** Puts a goal in the form to change it. */
    edit(form, goal) {
      form.dataset.goalId = goal.id;
      form.querySelector("#goal-period").value = goal.period;
      form.querySelector("#goal-metric").value = goal.metric;
      form.querySelector("#goal-amount").value = String(goal.amount);
      form.querySelector("#goal-exercise").value = goal.exercise;
      form.querySelector("[data-goal-submit]").lastChild.textContent = t("Save the goal");
      form.querySelector('[data-team="goal-cancel"]').hidden = false;
      form.querySelector("#goal-amount").focus();
    },

    /** Adds the goal in the form, or saves it when it is a goal being changed. */
    async submit(form, teamId) {
      const data = new FormData(form);
      const body = {
        period: String(data.get("period")),
        metric: String(data.get("metric")),
        amount: Number(data.get("amount")),
        exercise: String(data.get("exercise") ?? "")
      };
      const id = form.dataset.goalId;
      await view.api(id ? address(teamId, "goals", id) : address(teamId, "goals"), {
        method: id ? "PUT" : "POST",
        body
      });
      tell(t("Goal saved"));
    },

    async remove(teamId, goalId) {
      await view.api(address(teamId, "goals", goalId), { method: "DELETE" });
      tell(t("Goal removed"));
    },

    /** Asks for the combos of a hero, in the form of the form. */
    async askForHero(form, teamId) {
      const data = new FormData(form);
      await view.api(address(teamId, "hero-goals"), {
        method: "POST",
        body: { heroId: String(data.get("heroId")), form: String(data.get("form")) }
      });
      tell(t("Goal saved"));
    },

    async removeHeroGoal(teamId, goalId) {
      await view.api(address(teamId, "hero-goals", goalId), { method: "DELETE" });
      tell(t("Goal removed"));
    }
  };
}
