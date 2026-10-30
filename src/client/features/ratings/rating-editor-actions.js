// rating editor, what happens on a click, a key or a submit: load, save, leave, onClick, and 4 more.
import { t } from "../../app/browser-i18n.js";

// ---- actions ----------------------------------------------------------------------------------

export async function load(view) {
  const loaded = await view.api("/api/official-tiers");
  view.tiers = loaded.tiers;
  view.saved = new Map(loaded.lanes.map(list => [list.lane, list]));
}

export async function save(view) {
  if (!view.dirty || view.saving) {
    return;
  }
  view.saving = true;
  view.problem = "";
  view.paint();
  try {
    const result = await view.api(`/api/official-tiers/${encodeURIComponent(view.lane)}`, {
      method: "PUT",
      body: {
        tiers: view.tiers.map(label => ({ label, heroes: view.draft.rows.get(label) })),
        expectedVersion: view.saved.get(view.lane).version
      }
    });
    view.saved.set(view.lane, result);
    view.open(view.lane);
    view.tell(t("Ratings saved"));
  } catch (error) {
    view.problem = error.message;
  }
  view.saving = false;
  view.paint();
}

export const leave = view =>
  !view.dirty || confirm(t("Leave this lane? What you changed is not saved."));

export async function onClick(view, event) {
  const target = event.target.closest("button");
  if (!target || !view.root.contains(target)) {
    return;
  }
  if (target.dataset.lane) {
    if (target.dataset.lane !== view.lane && view.leave()) {
      view.open(target.dataset.lane);
      view.paint();
    }
  } else if (target.dataset.hero) {
    view.picked = view.picked === target.dataset.hero ? null : target.dataset.hero;
    view.paint();
  } else if (target.dataset.send) {
    view.move(view.picked, target.dataset.send);
    view.picked = null;
    view.paint();
  } else if (target.matches("[data-save]")) {
    await view.save();
  } else if (target.matches("[data-undo]")) {
    view.undo();
    view.paint();
  } else if (target.matches("[data-reset]")) {
    view.open(view.lane);
    view.paint();
  }
}

/** The box of the heroes that wait: only that row is drawn again, so the box keeps its focus. */
export function onInput(view, event) {
  if (event.target.id !== "rt-search") {
    return;
  }
  view.reserveSearch = event.target.value;
  view.root.querySelector("#rt-reserve").innerHTML = view.reserveHeroes();
}

// dragging: the hero travels as its id
export function onDragStart(event) {
  const hero = event.target.closest("[data-hero]");
  if (hero) {
    event.dataTransfer.setData("text/plain", hero.dataset.hero);
    event.dataTransfer.effectAllowed = "move";
  }
}

export function onDragOver(view, event) {
  const drop = event.target.closest("[data-drop]");
  if (drop) {
    event.preventDefault();
    for (const other of view.root.querySelectorAll(".tier-drop.over")) {
      if (other !== drop) {
        other.classList.remove("over");
      }
    }
    drop.classList.add("over");
  }
}

export function onDrop(view, event) {
  const drop = event.target.closest("[data-drop]");
  if (!drop) {
    return;
  }
  event.preventDefault();
  const heroId = event.dataTransfer.getData("text/plain");
  if (heroId && view.heroOf(heroId)) {
    view.move(heroId, drop.dataset.drop);
    view.picked = null;
    view.paint();
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { load, save, leave, onClick, onInput, onDragOver, onDrop };
