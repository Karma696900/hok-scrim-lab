// conditions editor, buttons: setAt, press, summary.
import { MAX_CONDITIONS, conditionsOf } from "../../../shared/condition-model.js";
import { t } from "../../app/browser-i18n.js";

// ---- the buttons ---------------------------------------------------------------------------------------

/** The set at a path ("" is the first one, "1.0" the first of the second): where a button adds to. */
export function setAt(when, path) {
  return path
    .split(".")
    .filter(Boolean)
    .reduce((current, index) => current.of[Number(index)], when);
}

/**
 * A button of an editor was pressed. `holder` is the entry that owns the conditions (it has a
 * `when`). True when the button was one of ours (the page then draws the form again).
 */
export function press(view, target, holder) {
  if (target.dataset.wAdd !== undefined || target.dataset.wGroup !== undefined) {
    const added = target.dataset.wAdd !== undefined ? view.firstBlank() : view.blank("group");
    if (!holder.when) {
      holder.when = { match: "all", of: [] };
    }
    const room = MAX_CONDITIONS - conditionsOf(holder.when).length;
    if (added && room > 0) {
      setAt(holder.when, target.dataset.wPath).of.push(added);
    }
    if (!holder.when.of.length) {
      holder.when = null;
    }
    return true;
  }
  if (target.dataset.wRemove !== undefined) {
    const path = target.dataset.wPath.split(".").map(Number);
    const index = path.pop();
    setAt(holder.when, path.join(".")).of.splice(index, 1);
    // a group with nothing left goes with its last condition; a set with nothing left is no set
    for (let depth = path.length; depth > 0; depth -= 1) {
      const parent = setAt(holder.when, path.slice(0, depth - 1).join("."));
      if (!parent.of[path[depth - 1]]?.of?.length) {
        parent.of.splice(path[depth - 1], 1);
      }
    }
    if (!holder.when.of.length) {
      holder.when = null;
    }
    return true;
  }
  return false;
}

/** A few words for the heading of a closed editor: how many conditions there are. */
export const summary = when =>
  when?.of?.length
    ? t("{count, plural, one {# condition} other {# conditions}}", {
        count: conditionsOf(when).length
      })
    : "";

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { press };
