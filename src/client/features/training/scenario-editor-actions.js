// scenario editor, what happens on a click, a key or a submit: onClick, onChange, onInput, onPointerdown, and 2 more.
import { t } from "../../app/browser-i18n.js";
import { clamp, pointOf } from "./scenario-editor-cards.js";

export async function onClick(page, event) {
  const target = event.target;
  const toolChoice = target.closest("[data-tool]");
  if (toolChoice) {
    page.readForm();
    const [type, side] = toolChoice.dataset.tool.split(":");
    page.tool.type = type;
    page.tool.side = side ?? ""; // a hero tool carries its side; a pin of the game starts neutral
    return page.paint();
  }
  const row = target.closest("[data-select]");
  if (row) {
    page.readForm();
    page.selected = row.dataset.select;
    return page.paint();
  }
  if (target.closest("[data-dead]")) {
    const pin = page.draft.pins.find(item => item.id === page.selected);
    if (pin) {
      pin.dead = !pin.dead;
    }
    page.readForm();
    return page.paint();
  }
  if (target.closest("[data-delete-pin]")) {
    page.draft.pins = page.draft.pins.filter(item => item.id !== page.selected);
    page.selected = null;
    page.readForm();
    return page.paint();
  }
  if (target.closest("[data-leave]")) {
    return page.existing
      ? page.view.go(`/training/scenarios/${page.existing.id}`)
      : page.view.go("/training/scenarios");
  }
  if (target.closest("[data-delete-scenario]")) {
    if (!confirm(t("Delete this situation?"))) {
      return;
    }
    try {
      await page.view.api(`/api/training/scenarios/${encodeURIComponent(page.existing.id)}`, {
        method: "DELETE"
      });
      page.view.go("/training/scenarios");
    } catch (error) {
      page.view.tell(error.message);
    }
    return;
  }
  const board = target.closest(".map-board");
  if (board && !target.closest(".map-pin")) {
    page.place(board, event);
  }
}

export function onChange(page, event) {
  if (event.target.id === "tool-hero") {
    page.tool.heroId = event.target.value;
  }
  if (event.target.id === "tool-side") {
    page.tool.side = event.target.value;
  }
  if (event.target.id === "sc-map") {
    page.readForm();
    page.paint();
  }
}

export function onInput(page, event) {
  if (event.target.id === "tool-label") {
    page.tool.label = event.target.value;
  }
}

// Dragging a pin
export function onPointerdown(page, event) {
  const pin = event.target.closest(".map-pin");
  const board = pin?.closest(".map-board");
  if (!pin || !board) {
    return;
  }
  page.readForm();
  page.selected = pin.dataset.pin;
  const model = page.draft.pins.find(item => item.id === page.selected);
  pin.setPointerCapture(event.pointerId);
  const move = moveEvent => {
    Object.assign(model, pointOf(moveEvent, board));
    pin.style.left = `${model.x * 100}%`;
    pin.style.top = `${model.y * 100}%`;
  };
  const stop = () => {
    pin.removeEventListener("pointermove", move);
    pin.removeEventListener("pointerup", stop);
    pin.removeEventListener("pointercancel", stop);
    page.paint();
    page.root.querySelector(`[data-pin="${page.selected}"]`)?.focus();
  };
  pin.addEventListener("pointermove", move);
  pin.addEventListener("pointerup", stop);
  pin.addEventListener("pointercancel", stop);
  event.preventDefault();
}

export function onKeydown(page, event) {
  const pinElement = event.target.closest?.(".map-pin");
  if (!pinElement) {
    return;
  }
  const model = page.draft.pins.find(item => item.id === pinElement.dataset.pin);
  const step = event.shiftKey ? 0.02 : 0.005;
  const delta = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step]
  }[event.key];
  if (delta) {
    event.preventDefault();
    model.x = clamp(model.x + delta[0]);
    model.y = clamp(model.y + delta[1]);
    page.selected = model.id;
    page.readForm();
    page.paint();
    page.root.querySelector(`[data-pin="${model.id}"]`)?.focus();
  } else if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    page.draft.pins = page.draft.pins.filter(item => item.id !== model.id);
    page.selected = null;
    page.readForm();
    page.paint();
  }
}

export async function onSubmit(page, event) {
  event.preventDefault();
  page.readForm();
  const error = page.root.querySelector("#sc-error");
  try {
    const body = {
      mapId: page.draft.mapId,
      title: page.draft.title,
      brief: page.draft.brief,
      published: page.draft.published,
      pins: page.draft.pins
    };
    const saved = page.existing
      ? await page.view.api(`/api/training/scenarios/${encodeURIComponent(page.existing.id)}`, {
          method: "PUT",
          body
        })
      : await page.view.api("/api/training/scenarios", { method: "POST", body });
    page.view.go(`/training/scenarios/${saved.id}`);
  } catch (failure) {
    error.textContent = failure.message;
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onClick, onChange, onInput, onPointerdown, onKeydown, onSubmit };
