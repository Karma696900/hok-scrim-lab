// The editor of the conditions of a value or of an effect (Catalog page, administrators). A set of
// conditions about the hero: all of them, or any of them, must hold, and each is a test on a stat of
// the hero, on its tags, its class, its lane, on the hero itself or on its level; a set can hold
// sets. It draws form fields and reads them back; the page keeps the draft and draws again when a
// button was pressed (see shared/condition-model.js for what the conditions mean).
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as conditionsEditorParts } from "./conditions-editor-parts.js";
import { onView as conditionsEditorDraftApi } from "./conditions-editor-draft-api.js";
import { onView as conditionsEditorFormFields } from "./conditions-editor-form-fields.js";
import { onView as conditionsEditorReadingFields } from "./conditions-editor-reading-fields.js";
import { onView as conditionsEditorButtons } from "./conditions-editor-buttons.js";
import { fromApi, toApi } from "./conditions-editor-draft-api.js";
import { summary } from "./conditions-editor-buttons.js";

/**
 * @param escapeHtml the page's HTML escaper
 * @param getCatalog the catalogue (stats and tags)
 * @param getHeroes the roster (heroes with their classes)
 */
export function createConditionsEditor({ getCatalog, getHeroes }) {
  const view = { getHeroes, getCatalog };
  bindTo(
    view,
    conditionsEditorParts,
    conditionsEditorDraftApi,
    conditionsEditorFormFields,
    conditionsEditorReadingFields,
    conditionsEditorButtons
  );
  view.esc = escapeHtml;

  return {
    markup: view.markup,
    read: view.read,
    press: view.press,
    fromApi,
    toApi,
    isComplete: view.isComplete,
    summary
  };
}
