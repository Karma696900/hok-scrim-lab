// Opening a hero and a build, saving, removing, changing the section.
import { emptyBuild } from "../../../shared/build-model.js";
import { t } from "../../app/browser-i18n.js";
import { VARIANTS } from "./guide-shared.js";

// ---- the hero and the build that are open --------------------------------------------------------

/** Opens a build of the hero: what was saved, or what a link brought (a build from the lab). */
export function loadVariant(view, which, brought = null) {
  view.variant = which;
  const set = view.variants[which];
  view.fields = { name: set?.name ?? "", note: set?.note ?? "", sourceUrl: set?.sourceUrl ?? "" };
  view.workbench.set(brought ?? set?.build ?? emptyBuild());
  view.workbench.closeInfo();
  view.dirty = Boolean(brought);
  view.notice = brought ? t("This build comes from the build lab. Check it, then save it.") : "";
  view.saveError = "";
}

export async function open(view, id, { wantedVariant = null, brought = null } = {}) {
  view.heroId = id;
  view.state.guideHeroId = id;
  view.variants = { 1: null, 2: null };
  view.markOpenHero();
  view.root.querySelector("#bed-main").innerHTML = view.LOADING;
  let sheetOfHero = null;
  try {
    sheetOfHero = await view.api(`/api/heroes/${encodeURIComponent(id)}`);
    for (const set of sheetOfHero.builds ?? []) {
      view.variants[set.variant] = set;
    }
  } catch (problem) {
    view.tell(problem.message);
  }
  if (!view.root.isConnected || view.heroId !== id) {
    return;
  }
  view.comboEditor.load(id, sheetOfHero);
  view.loadVariant(wantedVariant ?? VARIANTS.find(which => view.variants[which]) ?? 1, brought);
  view.paintMain();
  view.root.querySelector(".bed-head")?.scrollIntoView({ block: "nearest" });
}

/** True when nothing is lost by moving on: no unsaved build, no unsaved combo (or they are given up). */
export function leave(view) {
  if (view.comboEditor.isDirty()) {
    return confirm(t("Leave this combo? What you changed is not saved."));
  }
  return !view.dirty || confirm(t("Leave this build? What you changed is not saved."));
}

/** The address of the guide of a hero: the section is part of it, so a link opens the same page. */
export const guideAddress = (view, id) =>
  `/guides/${encodeURIComponent(id)}${view.section === "builds" ? "" : `?tab=${view.section}`}`;

export function rememberCounts(view) {
  view.summaries.set(
    view.heroId,
    VARIANTS.filter(which => view.variants[which]).map(which => ({
      variant: which,
      name: view.variants[which].name
    }))
  );
}

export async function save(view) {
  if (!view.canSave()) {
    return;
  }
  view.saving = true;
  view.saveError = "";
  view.paintMain();
  try {
    const saved = await view.api(`/api/builds/${encodeURIComponent(view.heroId)}/${view.variant}`, {
      method: "PUT",
      body: {
        name: view.fields.name.trim(),
        note: view.fields.note.trim(),
        sourceUrl: view.fields.sourceUrl.trim(),
        build: view.workbench.build
      }
    });
    view.variants[view.variant] = {
      variant: view.variant,
      name: saved.name,
      note: saved.note,
      sourceUrl: saved.sourceUrl,
      build: saved.build,
      updatedAt: Date.now()
    };
    view.rememberCounts();
    view.fields = { name: saved.name, note: saved.note, sourceUrl: saved.sourceUrl };
    view.dirty = false;
    view.notice = "";
    view.tell(t("Build saved"));
  } catch (problem) {
    view.saveError = problem.message;
  }
  view.saving = false;
  view.paintSide();
  view.paintMain();
}

export async function remove(view) {
  if (!confirm(t("Delete build {variant} of this hero?", { variant: view.variant }))) {
    return;
  }
  try {
    await view.api(`/api/builds/${encodeURIComponent(view.heroId)}/${view.variant}`, {
      method: "DELETE"
    });
    view.variants[view.variant] = null;
    view.rememberCounts();
    view.loadVariant(view.variant);
    view.tell(t("Build deleted"));
  } catch (problem) {
    view.saveError = problem.message;
  }
  view.paintSide();
  view.paintMain();
}

/** Goes to another section of the hero that is open (what was typed in each one is kept). */
export function openSection(view, name) {
  view.section = name;
  if (view.heroId) {
    history.replaceState(null, "", view.guideAddress(view.heroId));
  }
  view.paintSide();
  view.paintMain();
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  loadVariant,
  open,
  leave,
  guideAddress,
  rememberCounts,
  save,
  remove,
  openSection
};
