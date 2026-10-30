import { DRAFT_STEPS, PICK_ONLY_STEPS } from "../../../shared/draft-model.js";
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { escapeHtml } from "../../lib/dom.js";
import { BEST_OF_OPTIONS, state } from "../../app/app-state.js";

// The panel that sets up a new series: the hero rule as three big tiles (each one explains itself and shows
// the order of its steps), the two teams, the format and who controls the draft.

export const MODES = [
  {
    id: "global-ban-pick",
    icon: "swords",
    title: () => t("Global Ban & Pick"),
    tag: () => t("Competitive"),
    text: () =>
      t("{rule} Picking one Flowborn form locks all five forms for that team.", {
        rule: t("Each team can only pick a hero once in this series.")
      }),
    steps: DRAFT_STEPS
  },
  {
    id: "free-for-all",
    icon: "shield",
    title: () => t("Free For All"),
    tag: () => t("Picks only"),
    text: () => t("Heroes can be picked again freely in later games."),
    steps: PICK_ONLY_STEPS
  },
  {
    id: "classic",
    icon: "eyeoff",
    title: () => t("Classic"),
    tag: () => t("Hidden picks"),
    text: () =>
      t(
        "Picks only, and both sides can take the same hero. Online, you only see your own picks until the draft ends."
      ),
    steps: PICK_ONLY_STEPS
  }
];

export const CONTROLS = [
  {
    id: "solo",
    title: () => t("Solo"),
    text: () => t("You control both sides of this local draft.")
  },
  {
    id: "two-players",
    title: () => t("Two players · local"),
    text: () => t("Players hand off the same device after each side's turn.")
  },
  {
    id: "online",
    title: () => t("Online · invite a player"),
    text: () => t("The draft is shared live with an invited opponent.")
  }
];

/**
 * The order of the steps of a rule, in runs of the same action: one small square per step, blue or red for
 * the side that plays it, a ban sign or a tick for what it does.
 */
function orderStrip(steps) {
  const runs = [];
  for (const step of steps) {
    const last = runs.at(-1);
    if (last?.action === step.action) {
      last.steps.push(step);
    } else {
      runs.push({ action: step.action, steps: [step] });
    }
  }
  return `<span class="sc-order" aria-hidden="true">${runs
    .map(
      run =>
        `<span class="sc-order__run">${run.steps
          .map(
            step =>
              `<i class="${step.team === "blue" ? "b" : "r"}">${icon(run.action === "ban" ? "ban" : "check", "i--sm")}</i>`
          )
          .join("")}</span>`
    )
    .join("")}</span>`;
}

/** Names handed over by the agenda ("Create the series from this event"), used once. */
function takePrefill() {
  try {
    const stored = JSON.parse(sessionStorage.getItem("hok.prefill") || "null");
    sessionStorage.removeItem("hok.prefill");
    if (stored && typeof stored.teamA === "string" && typeof stored.teamB === "string") {
      return { teamA: stored.teamA.slice(0, 40), teamB: stored.teamB.slice(0, 40) };
    }
  } catch {
    /* nothing handed over */
  }
  return { teamA: "Team A", teamB: "Team B" };
}

const ruleTile = mode =>
  `<button type="button" class="sc-rule" data-action="set-game-mode" data-mode="${mode.id}" aria-pressed="${state.gameMode === mode.id}">${icon(mode.icon, "i--lg")}<b>${mode.title()}</b><small>${mode.tag()}</small></button>`;

const rulePanel = mode =>
  `<div class="sc-rule-panel" data-rule-panel="${mode.id}"${state.gameMode === mode.id ? "" : " hidden"}><p>${mode.text()}</p>${orderStrip(mode.steps)}</div>`;

const controlRow = control =>
  `<button type="button" class="sc-control" data-action="set-draft-mode" data-mode="${control.id}" aria-pressed="${state.draftMode === control.id}"><b>${control.title()}</b><small>${control.text()}</small></button>`;

export function renderNewSeriesForm() {
  const prefill = takePrefill();
  const legend = `<span class="sc-legend" aria-hidden="true"><span><i class="b"></i>${t("Blue")}</span><span><i class="r"></i>${t("Red")}</span><span>${icon("ban", "i--sm")}${t("Ban")}</span><span>${icon("check", "i--sm")}${t("Pick")}</span></span>`;
  return `<aside class="card card--feature sc-new rise d-2" id="new-series-card" aria-labelledby="new-series-title">
    <h2 id="new-series-title">${t("New series")}</h2>
    <form id="new-series-form" class="sc-form">
      <fieldset class="sc-fieldset"><legend class="label">${t("Series hero rule")}</legend>
        <div class="sc-rules" role="group" aria-label="${t("Series hero rule")}">${MODES.map(ruleTile).join("")}</div>
        <div class="sc-rule-panels">${MODES.map(rulePanel).join("")}${legend}</div>
      </fieldset>
      <div class="sc-pair">
        <label class="label" for="team-a">${t("Team A")}<span class="field"><input id="team-a" name="teamA" maxlength="40" value="${escapeHtml(prefill.teamA)}" required></span></label>
        <label class="label" for="team-b">${t("Team B")}<span class="field"><input id="team-b" name="teamB" maxlength="40" value="${escapeHtml(prefill.teamB)}" required></span></label>
      </div>
      <p class="sc-hint">${icon("info", "i--sm")}${t("Team A plays Blue in game 1; the sides then alternate.")}</p>
      <div class="sc-pair">
        <label class="label" for="best-of">${t("Series format")}<span class="field"><select id="best-of" name="bestOf">${BEST_OF_OPTIONS.map(value => `<option value="${value}" ${value === state.settings.bestOf ? "selected" : ""}>${t("Best of {count}", { count: value })}</option>`).join("")}<option value="custom">${t("Custom")}</option></select></span></label>
        <label class="label" id="custom-best-of-wrap" for="custom-best-of" hidden>${t("Maximum games")}<span class="field"><input id="custom-best-of" name="customBestOf" type="number" min="1" max="99" value="9"></span></label>
      </div>
      <fieldset class="sc-fieldset"><legend class="label">${t("Draft control")}</legend>
        <div class="sc-controls" role="group" aria-label="${t("Draft control")}">${CONTROLS.map(controlRow).join("")}</div>
        <p class="muted sc-note" data-draft-mode-note>${state.draftMode === "online" && !state.auth.user ? t("Google sign-in is required to create an online room.") : ""}</p>
      </fieldset>
      <button class="btn btn--primary btn--lg btn--block" type="submit">${t("Create series")}${icon("arrow")}</button>
    </form>
  </aside>`;
}
