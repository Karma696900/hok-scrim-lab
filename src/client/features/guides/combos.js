// The combos editor of the guides page: the combos of the chosen hero, as many as the editors want, in
// the order they chose. A combo is a name, a note and up to twelve steps, each one a skill (or the
// passive) of the hero with a short hint. Saved one at a time; the server checks the same rules. The list
// is on the left; on the right the form of the combo that is open, or the skills of the hero while none is.
import { COMBO_STEPS_MAX } from "../../../shared/combo-model.js";
import { icon } from "../../../shared/icons.js";
import { comboPieces, comboSkills } from "../../domain/hero-combos.js";
import { dataUnavailable } from "../../lib/dom.js";
import { t } from "../../app/browser-i18n.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as combosParts } from "./combos-parts.js";
import { onView as combosMarkup } from "./combos-markup.js";
import { onView as combosActions } from "./combos-actions.js";

/**
 * `repaint(focus)` redraws the section (and puts the focus on the first of the `focus` selectors that
 * exists); `counted(heroId, count)` tells the page how many combos the hero has now.
 */
export function createComboEditor({ api, tell, repaint, counted }) {
  const view = { repaint, counted, tell, api };
  bindTo(view, combosParts, combosMarkup, combosActions);
  view.heroId = null;
  view.skills = [];
  view.known = false;
  view.byId = new Map();
  view.combos = [];
  view.editing = null;
  view.dirty = false;
  view.saving = false;
  view.error = "";

  return {
    /** Takes the hero that was opened: its combos and the skills a step can use. */
    load(id, sheet) {
      view.heroId = id;
      view.known = comboSkills(sheet).length > 0;
      view.skills = comboPieces(sheet);
      view.byId = new Map(view.skills.map(skill => [skill.id, skill]));
      view.combos = sheet?.combos ?? [];
      view.editing = null;
      view.dirty = false;
      view.saving = false;
      view.error = "";
    },
    isDirty: () => view.dirty,
    /** The name and the note of each combo, for the overview of the texts written for the hero. */
    summary: () => view.combos.map(({ id, name, note }) => ({ id, name, note })),

    html() {
      if (!view.known) {
        return `<section class="ws-card bed-unknown"><div class="ws-bar"><h2 class="ws-title">${t("Combos")}</h2></div>${dataUnavailable(t("The skills of this hero have not been fetched yet."))}</section>`;
      }
      return `<div class="bed-combos-layout">
        <section class="ws-card bed-combo-list">
          <div class="ws-bar"><h2 class="ws-title">${t("Combos")}</h2><span class="pill pill--grey">${view.combos.length}</span><span class="ws-bar__end"><button type="button" class="btn btn--primary btn--sm" data-cb-new${view.editing && !view.editing.id ? " disabled" : ""}>${icon("plus", "i--sm")}${t("New combo")}</button></span></div>
          ${view.listHtml()}
        </section>
        ${view.editing ? view.formHtml() : view.skillsHtml()}
      </div>`;
    },

    /** A button of the section was pressed; true when it was one of ours. */
    async onClick(target) {
      const { dataset } = target;
      if ("cbNew" in dataset) {
        view.open(null);
      } else if (dataset.cbEdit) {
        view.open(view.combos.find(combo => combo.id === dataset.cbEdit));
      } else if (dataset.cbRemove) {
        await view.remove(dataset.cbRemove);
      } else if (dataset.cbUp || dataset.cbDown) {
        await view.reorder(dataset.cbUp ?? dataset.cbDown, dataset.cbUp ? -1 : 1);
      } else if ("cbCancel" in dataset) {
        if (!view.dirty || confirm(t("Leave this combo? What you changed is not saved."))) {
          view.editing = null;
          view.dirty = false;
          view.error = "";
          view.repaint();
        }
      } else if ("cbSave" in dataset) {
        await view.save();
      } else if (dataset.cbAdd && view.editing && view.editing.steps.length < COMBO_STEPS_MAX) {
        view.editing.steps.push({ skillId: dataset.cbAdd, hint: "" });
        view.dirty = true;
        view.repaint([`[data-cb-hint="${view.editing.steps.length - 1}"]`]);
      } else if (view.editing && dataset.cbStepUp !== undefined) {
        view.changeStep("up", Number(dataset.cbStepUp));
      } else if (view.editing && dataset.cbStepDown !== undefined) {
        view.changeStep("down", Number(dataset.cbStepDown));
      } else if (view.editing && dataset.cbStepRemove !== undefined) {
        view.changeStep("remove", Number(dataset.cbStepRemove));
      } else {
        return false;
      }
      return true;
    },

    /** Typing in the form; true when the field was one of ours. */
    onInput(event) {
      const { id, value, dataset } = event.target;
      if (!view.editing) {
        return false;
      }
      if (id === "cb-name") {
        view.editing.name = value;
      } else if (id === "cb-note") {
        view.editing.note = value;
      } else if (dataset.cbHint !== undefined) {
        view.editing.steps[Number(dataset.cbHint)].hint = value;
      } else {
        return false;
      }
      view.dirty = true;
      view.refresh();
      return true;
    }
  };
}
