// What the guide page asks about the heroes and the builds: counts, checks, whether a build can be saved.
import { RECOMMENDED_CORE } from "../../../shared/build-model.js";
import { sceneHero } from "../../domain/scene-art.js";
import { t } from "../../app/browser-i18n.js";

export const rise = (view, depth = "") => (view.entered ? "" : ` rise${depth}`);

export const heroName = hero => hero.displayName || hero.name;

export const heroes = view =>
  view.state.heroes
    .filter(hero => hero.availableGlobal !== false)
    .sort((a, b) => heroName(a).localeCompare(heroName(b)));

export const heroOf = (view, id) => view.state.heroes.find(hero => hero.id === id) ?? null;

export const buildsOf = (view, id) => view.summaries.get(id)?.length ?? 0;

export const combosOf = (view, id) => view.comboCounts.get(id) ?? 0;

/** How much is written for a hero in the section that is open. */
export const countOf = (view, id) =>
  view.section === "combos" ? view.combosOf(id) : view.buildsOf(id);

export const stageHero = view => view.heroOf(view.heroId) ?? sceneHero(6);

// ---- what the build needs -----------------------------------------------------------------------

/** The rules of a recommended build, as the list the person can follow while building. */
export function checks(view) {
  const { build } = view.workbench;
  const core = build.core.length;
  const pieces =
    ["items", "utility", "late"].some(group => build[group].length) ||
    Object.values(build.arcana).some(entries => entries.length);
  const source = view.fields.sourceUrl.trim();
  return [
    {
      ok: core >= RECOMMENDED_CORE.min && core <= RECOMMENDED_CORE.max,
      text: t("Mark {min} or {max} core items (now {count})", {
        min: RECOMMENDED_CORE.min,
        max: RECOMMENDED_CORE.max,
        count: core
      })
    },
    { ok: pieces, text: t("At least one item or arcana") },
    ...(source
      ? [{ ok: isHttps(source), text: t("The source is a link that starts with https://") }]
      : [])
  ];
}

export const canSave = view =>
  !view.saving && !view.workbench.error && view.checks().every(check => check.ok);

const isHttps = text => {
  try {
    return new URL(text).protocol === "https:";
  } catch {
    return false;
  }
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  rise,
  heroes,
  heroOf,
  buildsOf,
  combosOf,
  countOf,
  stageHero,
  checks,
  canSave
};
