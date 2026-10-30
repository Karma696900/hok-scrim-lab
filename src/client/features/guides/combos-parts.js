// combos, small helpers: address, checks, canSave, move.
import { t } from "../../app/browser-i18n.js";

export const address = (view, ...parts) =>
  ["/api/combos", encodeURIComponent(view.heroId), ...parts].join("/");

/** What a combo needs before it can be saved, one line each. */
export const checks = view => [
  { ok: view.editing.name.trim().length > 0, text: t("The combo has a name") },
  {
    ok: view.editing.steps.length > 0,
    text: t("At least one step (now {count})", { count: view.editing.steps.length })
  }
];

export const canSave = view => !view.saving && view.checks().every(check => check.ok);

export const move = (list, index, offset) => {
  const to = index + offset;
  if (to >= 0 && to < list.length) {
    [list[index], list[to]] = [list[to], list[index]];
  }
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { address, checks, canSave };
