// The buttons inside the form of an entry: add or remove a stat line (of the item or of one of its passives
// and actives), an effect, an option, a condition; and where the cursor goes after an addition.
import { blankLine } from "./catalog-form.js";

/** The lines a prefix of the form names: "stat" (the item's own), or "effect-1-stat" (those of its second effect). */
function linesAt(draft, prefix = "stat") {
  const effect = /^effect-(\d+)-stat$/.exec(prefix);
  if (!effect) {
    return draft.stats;
  }
  const holder = draft.effects[Number(effect[1])];
  holder.stats ??= [];
  return holder.stats;
}

/** What the conditions named by `owner` belong to: a line of the item, an effect, or a line of an effect. */
function holderOf(draft, owner) {
  const line = /^(.*)-(\d+)$/.exec(owner);
  return line[1] === "effect"
    ? draft.effects[Number(line[2])]
    : linesAt(draft, line[1])[Number(line[2])];
}

/** A button inside the form (add or remove a stat, an effect, an option, a condition) changes the draft. False for any other button. */
export function changeDraft(view, target, draft) {
  if (target.matches("[data-clear-image]")) {
    draft.imageId = null;
  } else if (target.matches("[data-add-stat]")) {
    const rows = linesAt(draft, target.dataset.addStat);
    rows.push(
      blankLine(
        view.catalog.stats.find(stat => !rows.some(row => row.statId === stat.id))?.id ??
          view.catalog.stats[0]?.id
      )
    );
  } else if (target.dataset.removeStat !== undefined) {
    const [, prefix, index] = target.dataset.removeStat.match(/^(.*)-(\d+)$/);
    linesAt(draft, prefix).splice(Number(index), 1);
  } else if (target.matches("[data-add-effect]")) {
    draft.effects.push({
      kind: "passive",
      name: "",
      text: "",
      cooldownSeconds: null,
      when: null,
      open: false,
      stats: []
    });
  } else if (target.dataset.removeEffect !== undefined) {
    draft.effects.splice(Number(target.dataset.removeEffect), 1);
  } else if (target.matches("[data-add-option]")) {
    draft.options.push({ id: null, name: "" });
  } else if (target.dataset.removeOption !== undefined) {
    draft.options.splice(Number(target.dataset.removeOption), 1);
  } else if (
    target.dataset.wAdd !== undefined ||
    target.dataset.wGroup !== undefined ||
    target.dataset.wRemove !== undefined
  ) {
    // a button of the conditions of a line (stat-2), of an effect (effect-1) or of a line of an effect (effect-1-stat-0)
    const holder = holderOf(
      draft,
      target.dataset.wAdd ?? target.dataset.wGroup ?? target.dataset.wRemove
    );
    view.when.press(target, holder);
    holder.open = true;
  } else {
    return false;
  }
  return true;
}

/** After "Add a stat" or "Add a passive or an active", the cursor goes to what was added. */
export function focusAdded(view, target) {
  const field = target.matches("[data-add-stat]")
    ? [
        ...view.root.querySelectorAll(
          `[data-stat-rows="${target.dataset.addStat}"] > .stat-line [data-name-pick-input]`
        )
      ].at(-1)
    : target.matches("[data-add-effect]")
      ? [...view.root.querySelectorAll('.effect-row [name$="-name"]')].at(-1)
      : null;
  if (!field) {
    return;
  }
  // the list of names waits for the first letter: open at once, it would cover what is below the line
  field.dataset.quiet = "";
  field.focus({ preventScroll: true });
  delete field.dataset.quiet;
  field.select?.();
  field.scrollIntoView({ block: "nearest" });
}
