// notebook, what happens on a click, a key or a submit: onClick, onChange, onSubmit.
import { COMBO_STEPS_MAX } from "../../../shared/combo-model.js";
import { marksText, parseMarks } from "../../../shared/vod-model.js";
import { t } from "../../app/browser-i18n.js";
import { marksProblem, requestBody } from "./notebook-parts.js";

export async function onClick(page, event) {
  const target = event.target.closest("button");
  if (!target) {
    return;
  }
  if ("new" in target.dataset) {
    await page.openEditor(page.blank());
  } else if (target.dataset.newKind) {
    await page.openEditor(page.blank(target.dataset.newKind));
  } else if (target.dataset.newHero) {
    await page.openEditor(page.blank("goal", target.dataset.newHero));
  } else if (target.dataset.filterHero) {
    page.filter.heroId =
      page.filter.heroId === target.dataset.filterHero ? "" : target.dataset.filterHero;
    await page.paintList();
  } else if ("cancel" in target.dataset) {
    page.editing = null;
    await page.paintAll();
  } else if (target.dataset.kind) {
    page.filter.kind = target.dataset.kind;
    await page.paintList();
  } else if (target.dataset.edit) {
    const note = page.notes.find(item => item.id === target.dataset.edit);
    await page.openEditor({
      ...note,
      heroId: note.heroId ?? "",
      steps: note.steps.map(step => ({ ...step })),
      url: note.url ?? "",
      marksText: marksText(note.marks)
    });
  } else if (target.dataset.remove) {
    if (!confirm(t("Delete this note?"))) {
      return;
    }
    try {
      await page.view.api(`/api/training/notes/${encodeURIComponent(target.dataset.remove)}`, {
        method: "DELETE"
      });
      page.notes = page.notes.filter(note => note.id !== target.dataset.remove);
      if (page.editing?.id === target.dataset.remove) {
        page.editing = null;
      }
      page.noteChanged();
      await page.paintAll();
    } catch (error) {
      page.view.tell(error.message);
    }
  } else if (
    page.editing &&
    (target.dataset.addStep ||
      target.dataset.stepUp ||
      target.dataset.stepDown ||
      target.dataset.stepRemove)
  ) {
    page.readForm();
    const steps = page.editing.steps;
    if (target.dataset.addStep && steps.length < COMBO_STEPS_MAX) {
      steps.push({ skillId: target.dataset.addStep, hint: "" });
    }
    const up = target.dataset.stepUp !== undefined ? Number(target.dataset.stepUp) : null;
    const down = target.dataset.stepDown !== undefined ? Number(target.dataset.stepDown) : null;
    if (up !== null && up > 0) {
      [steps[up - 1], steps[up]] = [steps[up], steps[up - 1]];
    }
    if (down !== null && down < steps.length - 1) {
      [steps[down + 1], steps[down]] = [steps[down], steps[down + 1]];
    }
    if (target.dataset.stepRemove !== undefined) {
      steps.splice(Number(target.dataset.stepRemove), 1);
    }
    await page.paintSide();
  }
}

export async function onChange(page, event) {
  const status = event.target.closest("[data-status]");
  if (status) {
    const note = page.notes.find(item => item.id === status.dataset.status);
    try {
      const saved = await page.view.api(`/api/training/notes/${encodeURIComponent(note.id)}`, {
        method: "PUT",
        body: requestBody(note, { status: status.value })
      });
      page.notes = page.notes.map(item => (item.id === saved.id ? saved : item));
      page.noteChanged();
      await page.paintAll();
    } catch (error) {
      page.view.tell(error.message);
    }
    return;
  }
  if (event.target.id === "note-filter-hero") {
    page.filter.heroId = event.target.value;
    await page.paintList();
  } else if (page.editing && (event.target.id === "note-kind" || event.target.id === "note-hero")) {
    const before = page.editing.heroId;
    page.readForm();
    if (page.editing.kind !== "combo") {
      page.editing.steps = [];
    }
    if (page.editing.heroId !== before) {
      page.editing.steps = [];
    } // the skills of another hero do not fit
    await page.paintSide();
  }
}

export async function onSubmit(page, event) {
  event.preventDefault();
  if (!page.editing) {
    return;
  }
  page.readForm();
  const error = page.root.querySelector("#note-error");
  try {
    const moments =
      page.editing.kind === "vod" ? parseMarks(page.editing.marksText) : { marks: [] };
    if (moments.problem) {
      error.textContent = marksProblem(moments.problem);
      page.root.querySelector("#note-marks")?.focus();
      return;
    }
    const body = requestBody(page.editing, { marks: moments.marks });
    const saved = page.editing.id
      ? await page.view.api(`/api/training/notes/${encodeURIComponent(page.editing.id)}`, {
          method: "PUT",
          body
        })
      : await page.view.api("/api/training/notes", { method: "POST", body });
    page.notes = page.editing.id
      ? page.notes.map(item => (item.id === saved.id ? saved : item))
      : [saved, ...page.notes];
    page.editing = null;
    page.noteChanged();
    await page.paintAll();
  } catch (failure) {
    error.textContent = failure.message;
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onClick, onChange, onSubmit };
