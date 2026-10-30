// combos, markup: checksHtml, stepsHtml, formHtml, skillsHtml, and 1 more.
import { COMBO_STEPS_MAX } from "../../../shared/combo-model.js";
import { comboSteps, skillPicture } from "../../domain/hero-combos.js";
import { escapeHtml } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { checksHtml } from "./checks-markup.js";

// ---- markup -----------------------------------------------------------------------------------

export function stepsHtml(view) {
  if (!view.editing.steps.length) {
    return `<p class="empty-line"><span>${t("No step yet: choose a skill above.")}</span></p>`;
  }
  const last = view.editing.steps.length - 1;
  return `<ol class="bed-steps">${view.editing.steps
    .map(
      (step, index) =>
        `<li>${skillPicture(view.byId.get(step.skillId), 36)}<label class="field"><input data-cb-hint="${index}" value="${escapeHtml(step.hint)}" maxlength="60" placeholder="${t("Hint (optional)")}" aria-label="${t("Hint for step {number}", { number: index + 1 })}" autocomplete="off"></label><button type="button" class="btn btn--ghost btn--icon btn--sm" data-cb-step-up="${index}" aria-label="${t("Move up")}"${index === 0 ? " disabled" : ""}>${icon("up", "i--sm")}</button><button type="button" class="btn btn--ghost btn--icon btn--sm" data-cb-step-down="${index}" aria-label="${t("Move down")}"${index === last ? " disabled" : ""}>${icon("chevron", "i--sm")}</button><button type="button" class="btn btn--ghost btn--icon btn--sm" data-cb-step-remove="${index}" aria-label="${t("Remove step {number}", { number: index + 1 })}">${icon("x", "i--sm")}</button></li>`
    )
    .join("")}</ol>`;
}

/** The form of the combo that is open: in a panel on the right, its buttons always in view. */
export function formHtml(view) {
  const full = view.editing.steps.length >= COMBO_STEPS_MAX;
  return `<aside class="ws-panel bed-form" id="cb-form">
        <div class="ws-panel__head card__head"><h2>${view.editing.id ? t("Edit the combo") : t("New combo")}</h2><span class="pill pill--grey">${t("{count} of {max} steps", { count: view.editing.steps.length, max: COMBO_STEPS_MAX })}</span></div>
        <div class="ws-panel__body ws-form">
          <label class="label">${t("Name")}<span class="field"><input id="cb-name" maxlength="80" value="${escapeHtml(view.editing.name)}" autocomplete="off"></span></label>
          <label class="label">${t("Note (optional)")}<span class="field field--area"><textarea id="cb-note" maxlength="500">${escapeHtml(view.editing.note)}</textarea></span></label>
          <div class="label">${t("Combo: pick the skills in order")}
            <div class="bed-palette">${view.skills
              .map(
                skill =>
                  `<button type="button" class="bed-pal" data-cb-add="${escapeHtml(skill.id)}" aria-label="${escapeHtml(skill.name)}" title="${escapeHtml(skill.name)}"${full ? " disabled" : ""}>${skillPicture(skill, 36)}<span>${escapeHtml(skill.name)}</span></button>`
              )
              .join("")}</div>
          </div>
          <div id="cb-steps">${view.stepsHtml()}</div>
        </div>
        <div class="ws-panel__foot">
          <div id="cb-checks" role="status" aria-live="polite">${view.checksHtml()}</div>
          <button type="button" class="btn btn--primary" data-cb-save${view.canSave() ? "" : " disabled"}>${icon("check", "i--sm")}${t("Save the combo")}</button>
          <button type="button" class="btn btn--ghost" data-cb-cancel>${t("Cancel")}</button>
          <span class="muted" id="cb-dirty">${view.dirty ? t("Changes not saved yet") : ""}</span>
          <p class="form-error" role="alert">${escapeHtml(view.error)}</p>
        </div>
      </aside>`;
}

/** The panel while no combo is open: the skills a step can be, and how to start. */
export function skillsHtml(view) {
  return `<aside class="ws-panel bed-form bed-skills">
        <div class="ws-panel__head"><h2>${t("Skills")}</h2></div>
        <div class="ws-panel__body"><ul class="bed-skill-list">${view.skills
          .map(skill => `<li>${skillPicture(skill, 44)}<span>${escapeHtml(skill.name)}</span></li>`)
          .join(
            ""
          )}</ul><p class="ws-hint">${t("Write the first combo of this hero: pick its skills in the order they are used.")}</p></div>
      </aside>`;
}

export function listHtml(view) {
  if (!view.combos.length) {
    return `<p class="empty-line bed-empty"><span><b>${t("No combo yet")}</b> ${t("Write the first combo of this hero: pick its skills in the order they are used.")}</span><button type="button" class="btn btn--sm" data-cb-new${view.editing && !view.editing.id ? " disabled" : ""}>${icon("plus", "i--sm")}${t("New combo")}</button></p>`;
  }
  return `<ol class="bed-combos">${view.combos
    .map((combo, index) => {
      const id = escapeHtml(combo.id);
      return `<li class="bed-combo${view.editing?.id === combo.id ? " is-open" : ""}">
          <div class="bed-combo__head">
            <span class="bed-combo__num" aria-hidden="true">${index + 1}</span>
            <div class="grow"><b>${escapeHtml(combo.name)}</b>${combo.note ? `<p class="muted">${escapeHtml(combo.note)}</p>` : ""}</div>
            <div class="hstack">
              <button type="button" class="btn btn--ghost btn--icon btn--sm" data-cb-up="${id}" aria-label="${t("Move up")}"${index === 0 ? " disabled" : ""}>${icon("up", "i--sm")}</button>
              <button type="button" class="btn btn--ghost btn--icon btn--sm" data-cb-down="${id}" aria-label="${t("Move down")}"${index === view.combos.length - 1 ? " disabled" : ""}>${icon("chevron", "i--sm")}</button>
              <button type="button" class="btn btn--ghost btn--sm" data-cb-edit="${id}">${icon("pencil", "i--sm")}${t("Edit")}</button>
              <button type="button" class="btn btn--ghost btn--sm" data-cb-remove="${id}">${icon("trash", "i--sm")}${t("Delete")}</button>
            </div>
          </div>
          ${comboSteps(combo.steps, view.byId, { compact: true })}
        </li>`;
    })
    .join("")}</ol>`;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { checksHtml, stepsHtml, formHtml, skillsHtml, listHtml };
