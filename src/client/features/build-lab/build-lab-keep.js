// Choosing a hero, keeping a build, loading a kept build, copying the address.
import { MAX_IN_ALL, MAX_PER_HERO, addSaved, nextName, updateSaved, writeSaved } from "./saved.js";
import { t } from "../../app/browser-i18n.js";
import { storage } from "./build-lab-shared.js";

// ---- actions ----------------------------------------------------------------------------------

export async function chooseHero(view, id) {
  view.heroId = id;
  view.sheet = null;
  view.scope = id ? "hero" : "all";
  if (id) {
    try {
      view.sheet = await view.api(`/api/heroes/${encodeURIComponent(id)}`);
    } catch (problem) {
      view.tell(problem.message);
    }
  }
  view.remember();
  view.paint();
}

/** Keeps the build: as a new one, or in place of the one that was loaded. */
export function keep(view, how) {
  view.keepError = "";
  const { build } = view.workbench;
  if (
    !["items", "utility", "late"].some(group => build[group].length) &&
    !Object.values(build.arcana).some(entries => entries.length)
  ) {
    view.keepError = t("A build needs at least one item or arcana.");
    return;
  }
  const typed = view.keepName.trim();
  let next;
  let entry;
  if (how === "update" && view.kept.some(item => item.id === view.activeId)) {
    next = updateSaved(view.kept, view.activeId, {
      name: typed,
      level: view.level,
      build,
      now: Date.now()
    });
    entry = next.find(item => item.id === view.activeId);
  } else {
    const added = addSaved(view.kept, {
      id: crypto.randomUUID(),
      heroId: view.heroId,
      name: typed || nextName(view.kept, view.heroId, t("Build")),
      level: view.level,
      build,
      now: Date.now()
    });
    if (added.error) {
      view.keepError =
        added.error === "per-hero"
          ? t("You can keep {max} builds for one hero: delete one first.", { max: MAX_PER_HERO })
          : t("You can keep {max} builds in all: delete one first.", { max: MAX_IN_ALL });
      return;
    }
    next = added.entries;
    entry = added.entry;
  }
  if (!writeSaved(storage(), next)) {
    view.keepError = t("This browser would not keep the build (private window or full storage).");
    return;
  }
  view.kept = next;
  view.activeId = entry.id;
  view.keepName = "";
  view.tell(t("Build kept: {name}", { name: entry.name }));
}

export async function loadKept(view, item) {
  view.activeId = item.id;
  view.keepName = "";
  view.keepError = "";
  view.level = item.level;
  view.workbench.set(item.build);
  view.workbench.closeInfo();
  if (item.heroId === view.heroId) {
    view.remember();
    view.paint();
  } else {
    await view.chooseHero(item.heroId);
  }
}

export async function copy(view, link) {
  try {
    await navigator.clipboard.writeText(link);
    view.tell(t("Link copied"));
  } catch {
    view.tell(link);
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { chooseHero, keep, loadKept, copy };
