// What happens when a person clicks, changes, types or submits.
import { buildAddress } from "../../../shared/build-model.js";
import { removeSaved, writeSaved } from "./saved.js";
import { t } from "../../app/browser-i18n.js";
import { storage } from "./build-lab-shared.js";

/**
 * What is not about the build itself: the recommended builds, the kept ones, the link. "paint" when
 * the page has to be drawn again, "done" when it is already, nothing when the click is not for it.
 */
export async function ownClick(view, target) {
  if (target.dataset.load) {
    const set = view.sheet.builds.find(entry => String(entry.variant) === target.dataset.load);
    if (set) {
      view.workbench.set(set.build);
      view.workbench.closeInfo();
      view.activeId = null;
    }
    return "paint";
  }
  if (target.dataset.sheet) {
    view.sheetOpen = target.dataset.sheet === "open";
    view.paint();
    (view.sheetOpen
      ? view.root.querySelector('[data-sheet="close"]')
      : view.root.querySelector('[data-sheet="open"]')
    )?.focus({ preventScroll: true });
    return "done";
  }
  if (target.matches("[data-reset]")) {
    view.workbench.clear();
    view.activeId = null;
    view.keepError = "";
    return "paint";
  }
  if (target.matches("[data-copy]")) {
    await view.copy(`${location.origin}${view.addressOf()}`);
    return "done";
  }
  if (target.dataset.savedScope) {
    view.scope = target.dataset.savedScope;
    return "paint";
  }
  const item = view.kept.find(entry =>
    [
      target.dataset.savedLoad,
      target.dataset.savedCopy,
      target.dataset.savedDelete,
      target.dataset.savedSpace
    ].includes(entry.id)
  );
  if (target.dataset.savedSpace && item) {
    // a copy goes to the account: the one of this browser stays where it is
    try {
      await view.api("/api/space/builds", {
        method: "POST",
        body: { heroId: item.heroId, name: item.name, level: item.level, build: item.build }
      });
      view.tell(t("Kept in your space"));
    } catch (error) {
      view.tell(error.message);
    }
    return "done";
  }
  if (target.dataset.savedLoad && item) {
    await view.loadKept(item);
    return "done";
  }
  if (target.dataset.savedCopy && item) {
    const address = buildAddress(location.pathname, {
      build: item.build,
      heroId: item.heroId,
      level: item.level
    });
    await view.copy(`${location.origin}${address}`);
    return "done";
  }
  if (target.dataset.savedDelete && item) {
    if (!confirm(t("Delete this build?"))) {
      return "done";
    }
    const next = removeSaved(view.kept, item.id);
    if (writeSaved(storage(), next)) {
      view.kept = next;
      view.activeId = view.activeId === item.id ? null : view.activeId;
      view.tell(t("Build deleted"));
    } else {
      view.keepError = t("This browser would not keep the build (private window or full storage).");
    }
    return "paint";
  }
  return undefined;
}

export async function onClick(view, event) {
  const target = event.target.closest("button");
  if (!target) {
    return;
  }
  view.hideTip();
  view.resetGrid = target.dataset.tab !== undefined || target.dataset.shop !== undefined;
  // a piece added or taken out leaves a loaded build as it was loaded: still the one to update
  if (!view.workbench.onClick(target) && (await view.ownClick(target)) !== "paint") {
    return;
  }
  view.remember();
  view.paint();
}

export async function onChange(view, event) {
  if (event.target.id === "lab-hero") {
    view.activeId = null;
    view.keepError = "";
    await view.chooseHero(event.target.value);
  } else if (event.target.id === "lab-level") {
    view.level = Number(event.target.value);
    view.remember();
    view.paint();
  }
}

export function onInput(view, event) {
  if (event.target.id === "lab-keep-name") {
    view.keepName = event.target.value;
  } else if (event.target.id === "lab-level") {
    // the label follows the slider while it moves; the stats are added up when it is let go
    view.root.querySelector(".lvl-line b").textContent = t("Level {level}", {
      level: Number(event.target.value)
    });
  } else {
    // the search redraws the pieces only (the box keeps its focus); they start from the top again
    if (view.workbench.onInput(event, view.root)) {
      view.root.querySelector("#lab-grid").scrollTop = 0;
    }
  }
}

export function onSubmit(view, event) {
  if (event.target.id !== "lab-keep") {
    return;
  }
  event.preventDefault();
  view.keep(event.submitter?.value ?? "new");
  view.paint();
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { ownClick, onClick, onChange, onInput, onSubmit };
