// ranking, small helpers: visibleTeams, options, fillBody, fill.
import { EXERCISES, exerciseOf } from "../../../../shared/reflex-model.js";
import { avatarMarkup } from "../../auth/auth-avatar.js";
import { exerciseName, scoreText } from "../../../domain/reflex-labels.js";
import { lineHtml } from "../../community/stage.js";
import { t } from "../../../app/browser-i18n.js";

/** The teams the player may see the ranking of: the ones whose own training page says so. */
export async function visibleTeams(view) {
  const teams = (await view.api("/api/me/teams").catch(() => null))?.items ?? [];
  const seen = [];
  for (const team of teams.slice(0, 6)) {
    const training = await view
      .api(`/api/teams/${encodeURIComponent(team.id)}/training`)
      .catch(() => null);
    if (training?.canSeeRanking) {
      seen.push(team);
    }
  }
  return { teams: teams.length, seen };
}

export const options = (view, values, selected, label) =>
  values
    .map(
      value =>
        `<option value="${view.esc(value)}"${value === selected ? " selected" : ""}>${view.esc(label(value))}</option>`
    )
    .join("");

/** The table of the ranking for the team, the exercise and the period that are chosen. */
export async function fillBody(view, slot) {
  const body = slot.querySelector("#rx-ranking-body");
  if (!body) {
    return;
  }
  body.innerHTML = `<div class="loading-line"></div>`;
  try {
    const { rows } = await view.api(
      `/api/teams/${encodeURIComponent(view.choice.team)}/training/ranking?exercise=${encodeURIComponent(view.choice.exercise)}&period=${view.choice.period}`
    );
    if (slot.querySelector("#rx-ranking-body") !== body) {
      return; // drawn again meanwhile
    }
    const exercise = exerciseOf(view.choice.exercise);
    body.innerHTML = rows.length
      ? `<div class="table-scroll"><table class="table table--boxed rank-table"><thead><tr><th scope="col">#</th><th scope="col">${t("Player")}</th><th scope="col" class="r">${t("Best")}</th><th scope="col" class="r">${t("Runs")}</th></tr></thead><tbody>${rows
          .map(
            row =>
              `<tr class="${row.userId === view.state.auth.user?.id ? "is-me" : ""}"><td class="rank-place">${row.rank}</td><th scope="row"><span class="hstack">${avatarMarkup(row, 28)}<b>${view.esc(row.name)}</b><small class="faint">#${view.esc(row.tag)}</small></span></th><td class="r">${view.esc(scoreText(exercise, row.best))}</td><td class="r">${row.runs}</td></tr>`
          )
          .join("")}</tbody></table></div>`
      : `<p class="muted">${view.choice.period === "week" ? t("Nobody has played this exercise this week.") : t("Nobody has played this exercise yet.")}</p>`;
  } catch (error) {
    body.innerHTML = `<p class="form-error" role="alert">${view.esc(error.message)}</p>`;
  }
}

/** Draws the ranking into `slot` when there is one to show. `exercise` presets the exercise. */
export async function fill(view, slot, { exercise = "" } = {}) {
  const { teams, seen } = await view.visibleTeams();
  if (!slot.isConnected) {
    return;
  }
  if (!seen.length) {
    // in a team whose staff keeps the ranking for itself there is nothing to say; without a team, how to get one
    slot.hidden = teams > 0;
    slot.innerHTML = teams
      ? ""
      : lineHtml(
          "users",
          t("Team ranking"),
          t("Join a team to see its ranking."),
          `<a class="btn btn--sm" href="/teams">${t("Teams")}</a>`
        );
    return;
  }
  if (exercise) {
    view.choice.exercise = exercise;
  }
  if (!seen.some(team => team.id === view.choice.team)) {
    view.choice.team = seen[0].id;
  }
  const periods = [
    ["week", t("This week")],
    ["all", t("All time")]
  ];
  slot.hidden = false;
  slot.innerHTML = `<section class="card rx-rank" id="rx-ranking">
        <div class="card__head"><h2>${t("Team ranking")}</h2>
          <div class="hstack wrap rx-rank__controls">
            ${
              seen.length > 1
                ? `<label class="field"><select id="rx-rank-team" aria-label="${t("Team")}">${view.options(
                    seen.map(team => team.id),
                    view.choice.team,
                    id => seen.find(team => team.id === id)?.name ?? id
                  )}</select></label>`
                : `<span class="pill pill--blue">${view.esc(seen[0].name)}</span>`
            }
            <label class="field"><select id="rx-rank-exercise" aria-label="${t("Exercise")}">${view.options(
              EXERCISES.map(entry => entry.id),
              view.choice.exercise,
              exerciseName
            )}</select></label>
            <div class="seg" role="group" aria-label="${t("Period")}">${periods
              .map(
                ([period, label]) =>
                  `<button type="button" class="${view.choice.period === period ? "on" : ""}" data-rank-period="${period}" aria-pressed="${view.choice.period === period}">${label}</button>`
              )
              .join("")}</div>
          </div>
        </div>
        <div id="rx-ranking-body" aria-live="polite"></div>
      </section>`;
  slot.onchange = event => {
    if (event.target.id === "rx-rank-team") {
      view.choice.team = event.target.value;
    } else if (event.target.id === "rx-rank-exercise") {
      view.choice.exercise = event.target.value;
    } else {
      return;
    }
    view.fillBody(slot);
  };
  slot.onclick = event => {
    const button = event.target.closest("[data-rank-period]");
    if (!button) {
      return;
    }
    view.choice.period = button.dataset.rankPeriod;
    for (const other of slot.querySelectorAll("[data-rank-period]")) {
      const on = other === button;
      other.classList.toggle("on", on);
      other.setAttribute("aria-pressed", String(on));
    }
    view.fillBody(slot);
  };
  await view.fillBody(slot);
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { visibleTeams, options, fillBody, fill };
