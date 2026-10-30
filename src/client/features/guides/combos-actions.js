// combos, what happens on a click, a key or a submit: open, save, remove, reorder, and 2 more.
import { t } from "../../app/browser-i18n.js";
import { move } from "./combos-parts.js";

// ---- actions ----------------------------------------------------------------------------------

/** Opens the form on a combo (`null`: a new one). Asks first when another one has unsaved changes. */
export function open(view, combo) {
  if (view.dirty && !confirm(t("Leave this combo? What you changed is not saved."))) {
    return;
  }
  view.editing = combo
    ? {
        id: combo.id,
        name: combo.name,
        note: combo.note,
        steps: combo.steps.map(step => ({ ...step }))
      }
    : blank();
  view.dirty = false;
  view.error = "";
  view.repaint(["#cb-name"]);
  document.querySelector("#cb-form")?.scrollIntoView({ block: "nearest" });
}

export async function save(view) {
  if (!view.canSave()) {
    return;
  }
  view.saving = true;
  view.error = "";
  view.repaint();
  const body = {
    name: view.editing.name.trim(),
    note: view.editing.note.trim(),
    steps: view.editing.steps.map(step => ({ skillId: step.skillId, hint: step.hint.trim() }))
  };
  try {
    if (view.editing.id) {
      const saved = await view.api(view.address(view.editing.id), { method: "PUT", body });
      view.combos = view.combos.map(combo => (combo.id === saved.id ? saved : combo));
    } else {
      view.combos = [...view.combos, await view.api(view.address(), { method: "POST", body })];
    }
    view.editing = null;
    view.dirty = false;
    view.counted(view.heroId, view.combos.length);
    view.tell(t("Combo saved"));
  } catch (problem) {
    view.error = problem.message;
  }
  view.saving = false;
  view.repaint();
}

export async function remove(view, id) {
  const combo = view.combos.find(entry => entry.id === id);
  if (!combo || !confirm(t("Delete the combo {name}?", { name: combo.name }))) {
    return;
  }
  try {
    await view.api(view.address(id), { method: "DELETE" });
    view.combos = view.combos.filter(entry => entry.id !== id);
    if (view.editing?.id === id) {
      view.editing = null;
      view.dirty = false;
    }
    view.counted(view.heroId, view.combos.length);
    view.tell(t("Combo deleted"));
  } catch (problem) {
    view.tell(problem.message);
  }
  view.repaint();
}

export async function reorder(view, id, offset) {
  const ids = view.combos.map(combo => combo.id);
  move(ids, ids.indexOf(id), offset);
  try {
    view.combos = (await view.api(view.address("order"), { method: "PUT", body: { ids } })).combos;
  } catch (problem) {
    view.tell(problem.message);
  }
  const [same, other] = offset < 0 ? ["up", "down"] : ["down", "up"];
  view.repaint([
    `[data-cb-${same}="${id}"]:not(:disabled)`,
    `[data-cb-${other}="${id}"]:not(:disabled)`
  ]);
}

/** A step of the form moves up or down, or goes; the focus stays on that step's buttons. */
export function changeStep(view, kind, index) {
  if (kind === "remove") {
    view.editing.steps.splice(index, 1);
  } else {
    move(view.editing.steps, index, kind === "up" ? -1 : 1);
  }
  view.dirty = true;
  const now = kind === "up" ? index - 1 : kind === "down" ? index + 1 : index;
  const opposite = kind === "up" ? "down" : "up";
  view.repaint([
    `[data-cb-step-${kind}="${now}"]:not(:disabled)`,
    `[data-cb-step-${opposite}="${now}"]:not(:disabled)`,
    "[data-cb-add]"
  ]);
}

/** The rules and the save button follow what is typed, without redrawing the field being typed in. */
export function refresh(view) {
  document.querySelector("#cb-checks").innerHTML = view.checksHtml();
  document.querySelector("[data-cb-save]").disabled = !view.canSave();
  document.querySelector("#cb-dirty").textContent = view.dirty ? t("Changes not saved yet") : "";
}

const blank = () => ({ id: null, name: "", note: "", steps: [] });

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { open, save, remove, reorder, changeStep, refresh };
