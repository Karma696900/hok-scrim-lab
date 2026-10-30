// The combos of a hero: the pictures of its skills (and passive) in the order they are used, each with
// the hint of the editor under it. The page of the hero, the guides editor and the training sheet all
// draw them this way.
import { BASIC_ATTACK_ID } from "../../shared/combo-model.js";
import { icon } from "../../shared/icons.js";
import { responsive } from "../../shared/media.js";
import { tx } from "./staff-content.js";
import { escapeHtml } from "../lib/dom.js";
import { t } from "../app/browser-i18n.js";
import { progressMarkup } from "./reflex-labels.js";

/** The skills of a hero sheet that a combo can chain, passive and ultimate included. */
export const comboSkills = sheet => (sheet?.details?.skills ?? []).filter(skill => skill.id);

/** The basic attack as a step of a combo: it has no picture of its own, the sword stands for it. */
export const basicAttack = () => ({ id: BASIC_ATTACK_ID, name: t("Basic attack"), basic: true });

/** What a step of a combo can be on this sheet: its skills, then the basic attack. */
export const comboPieces = sheet => [...comboSkills(sheet), basicAttack()];

/** Skill id → skill, for the steps of the combos of a sheet (the basic attack included). */
export const skillsById = sheet => new Map(comboPieces(sheet).map(skill => [skill.id, skill]));

/** The picture of a skill in its round frame; a plain disc when the sheet has none, a sword for the basic attack. */
export function skillPicture(skill, size = 48) {
  const name = escapeHtml(skill?.name ?? "");
  if (skill?.basic) {
    return `<span class="combo-pic combo-pic--basic" role="img" aria-label="${name}" title="${name}">${icon("swords")}</span>`;
  }
  return skill?.icon
    ? `<img class="combo-pic" ${responsive(skill.icon, size)} alt="${name}" width="${size}" height="${size}" loading="lazy" decoding="async">`
    : `<span class="combo-pic image-fallback" role="img" aria-label="${name}"></span>`;
}

/**
 * The steps of a combo. Each picture carries its number, so the order stays clear wherever the line
 * breaks. `compact` makes the pictures smaller (the lists of the editors).
 */
export function comboSteps(steps, skills, { compact = false } = {}) {
  const size = compact ? 36 : 48;
  const items = steps.map(
    (step, index) =>
      `<li class="combo-step"><span class="combo-step__frame">${skillPicture(skills.get(step.skillId), size)}<b class="combo-step__num" aria-hidden="true">${index + 1}</b></span>${step.hint ? `<span class="combo-step__hint">${escapeHtml(tx(step.hint))}</span>` : ""}</li>`
  );
  return `<ol class="combo-steps${compact ? " combo-steps--compact" : ""}">${items.join(`<li class="combo-steps__arrow" aria-hidden="true">${icon("right", "i--sm")}</li>`)}</ol>`;
}

/** The words for what a team asks of a hero's combos: one form, or both. */
export const heroGoalFormLabel = form =>
  ({ normal: t("Normal"), animationCancel: t("Animation cancel"), both: t("Both forms") })[form] ??
  form;

/**
 * A goal about a hero as a line: the hero, the form, and how far a player is when `progress` is given
 * ({ done, target, complete }). `hero` is the entry of the roster (it may be missing); `action` is
 * markup placed at the end.
 */
export function heroGoalRow(goal, { hero = null, progress = null, action = "" } = {}) {
  const plain = hero?.displayName || hero?.name || goal.heroId;
  const name = escapeHtml(plain);
  const picture = hero?.image
    ? `<span class="pt s-32"><img ${responsive(hero.image, 32)} alt="" width="32" height="32" loading="lazy" decoding="async"></span>`
    : "";
  const label = `${plain} · ${heroGoalFormLabel(goal.form)}`; // escaped where it is written
  return `<li class="goal-row${progress?.complete ? " is-done" : ""}"><span class="goal-row__what">${picture}<b>${name}</b><span class="pill pill--blue">${escapeHtml(heroGoalFormLabel(goal.form))}</span></span>${progress ? progressMarkup(progress, label) : ""}${action}</li>`;
}
