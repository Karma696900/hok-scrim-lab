// What to do today: the heroes the teams ask for, the combos to check and to learn.
import { comboSteps, heroGoalRow } from "../../domain/hero-combos.js";
import { daysText } from "../../domain/reflex-labels.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { tx } from "../../domain/staff-content.js";

// ---- what to work on first: the heroes the teams ask for, the combos to check and to learn ----------
export function assignedCard(view) {
  if (!view.assigned.teams.length) {
    return "";
  }
  return `<section class="card trn-mod" id="train-assigned"><div class="card__head"><h2>${t("Heroes to master")}</h2></div>${view.assigned.teams
    .map(
      entry =>
        `<p class="trn-team"><b>${esc(entry.team.name)}</b> <span class="pill pill--grey">${esc(entry.team.tag)}</span></p><ul class="rx-goals">${entry.heroGoals
          .map(goal =>
            heroGoalRow(goal, {
              hero: view.heroOf(goal.heroId),
              progress: goal.progress,
              action: `<button type="button" class="btn btn--sm btn--ghost" data-practise="${esc(goal.heroId)}">${icon("target", "i--sm")}${t("Practise")}</button>`
            })
          )
          .join("")}</ul>`
    )
    .join("")}</section>`;
}

/** A combo of the lists: its hero, its name, its steps, and what can be done with it. */
export function comboRow(view, combo, actions) {
  const known = new Map((view.review.skills[combo.heroId] ?? []).map(skill => [skill.id, skill]));
  return `<li class="review-row" data-review-row="${esc(combo.id)}">
          <span class="trn-rv__who"><span class="pt s-40">${view.portrait(combo.heroId, 40)}</span><span class="review-row__text"><b>${esc(tx(combo.name))}</b><small>${esc(view.heroName(combo.heroId))}</small></span></span>
          ${comboSteps(combo.steps, known, { compact: true })}
          <div class="hstack review-row__actions">${actions}</div>
        </li>`;
}

export function reviewCards(view) {
  if (!view.review || (!view.review.due.length && !view.review.toLearn.length)) {
    return "";
  }
  const rest = view.review.dueTotal - view.review.due.length;
  const due = `<section class="card trn-mod" id="train-review">
          <div class="card__head"><h2>${t("Combos to check today")}</h2><span class="pill pill--blue">${view.review.dueTotal}</span></div>
          ${
            view.review.due.length
              ? `<p class="muted">${t("You acquired these combos a while ago: do you still master them?")}</p><ul class="stack-y review-list">${view.review.due
                  .map(combo =>
                    view.comboRow(
                      combo,
                      `<button type="button" class="btn btn--primary btn--sm" data-answer="sharp" data-review-combo="${esc(combo.id)}">${icon("check", "i--sm")}${t("Still sharp")}</button><button type="button" class="btn btn--sm" data-answer="rusty" data-review-combo="${esc(combo.id)}">${t("Rusty")}</button>`
                    )
                  )
                  .join(
                    ""
                  )}</ul>${rest > 0 ? `<p class="muted">${t("{count} more after these.", { count: rest })}</p>` : ""}`
              : `<p class="muted">${t("Nothing to check today.")}</p>`
          }
        </section>`;
  const learn = view.review.toLearn.length
    ? `<section class="card trn-mod" id="train-learn">
          <div class="card__head"><h2>${t("Combos to learn")}</h2><span class="pill pill--grey">${view.review.toLearnTotal}</span></div>
          <p class="muted">${t("Combos of the heroes you work on and of the ones your teams ask for, that you have not acquired yet.")}</p>
          <ul class="stack-y review-list">${view.review.toLearn
            .map(combo =>
              view.comboRow(
                combo,
                `<button type="button" class="btn btn--sm" data-practise="${esc(combo.heroId)}">${icon("target", "i--sm")}${t("Practise")}</button>`
              )
            )
            .join("")}</ul>
        </section>`
    : "";
  return due + learn;
}

export const cards = view => view.assignedCard() + view.reviewCards();

/** Draws the cards of the day again (and the hero cards, which carry their badges), then the stage. */
export function paintCards(view) {
  const holder = view.root.querySelector("#train-cards");
  const html = view.cards();
  holder.innerHTML = html;
  holder.hidden = !html.trim();
  view.root.querySelector("#trn-heroes").classList.toggle("has-today", Boolean(html.trim()));
  view.overview.assigned = view.assigned;
  view.overview.review = view.review;
  view.paintMine();
  view.kit.refreshChrome();
}

/** What changed (a form ticked, a combo checked): what the cards say is asked again. */
export async function refreshCards(view) {
  const [again, checked] = await Promise.all([
    view.api("/api/training/assigned").catch(() => null),
    view.api("/api/training/combos/review").catch(() => null)
  ]);
  view.assigned = again ?? view.assigned;
  view.review = checked ?? view.review;
  view.paintCards();
}

/** The player says whether they still master a combo of the list. */
export async function answerReview(view, button) {
  const comboId = button.dataset.reviewCombo;
  const sharp = button.dataset.answer === "sharp";
  try {
    const next = await view.api(`/api/training/combos/${encodeURIComponent(comboId)}/review`, {
      method: "POST",
      body: { sharp }
    });
    const days = Math.max(1, Math.round((next.dueAt - Date.now()) / DAY));
    view.tell(t("You will see it again in {days}.", { days: daysText(days) }));
    view.review.due = view.review.due.filter(combo => combo.id !== comboId);
    view.review.dueTotal = Math.max(0, view.review.dueTotal - 1);
    // the list was cut at ten: when it is empty and some wait, the next ones are fetched
    if (!view.review.due.length && view.review.dueTotal > 0) {
      await view.refreshCards();
    } else {
      view.paintCards();
    }
  } catch (error) {
    view.tell(error.message);
  }
}

const DAY = 86_400_000;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  assignedCard,
  comboRow,
  reviewCards,
  cards,
  paintCards,
  refreshCards,
  answerReview
};
