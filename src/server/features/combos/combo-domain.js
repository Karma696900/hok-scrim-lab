// The combos of a hero (guides written by the editors) and what a player has acquired of them. Pure:
// the caller says which skills the hero has.
import { BASIC_ATTACK_ID, COMBO_STEPS_MAX, REVIEW_DAYS } from "../../../shared/combo-model.js";
import { badRequest } from "../../platform/errors.js";
import { plainObject, text } from "../../platform/validation.js";

/** No limit that a person would meet; this only stops a script from filling the table. */
export const COMBOS_PER_HERO_MAX = 500;
const SKILL_ID = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * A combo: a name, a note and the steps, each one a skill of the hero (or its basic attack) with a short
 * hint.
 */
export function parseCombo(body, skillIds) {
  const input = plainObject(body, "The combo");
  const { steps } = input;
  if (!Array.isArray(steps) || steps.length > COMBO_STEPS_MAX) {
    throw badRequest("A combo has at most {max} steps.", "invalid_body", { max: COMBO_STEPS_MAX });
  }
  if (!steps.length) {
    throw badRequest("A combo needs at least one step.", "invalid_body");
  }
  return {
    name: text(input.name ?? "", "name", { min: 1, max: 80 }),
    note: text(input.note ?? "", "note", { max: 500 }),
    steps: steps.map((entry, index) => {
      const step = plainObject(entry, `steps[${index}]`);
      if (
        typeof step.skillId !== "string" ||
        !SKILL_ID.test(step.skillId) ||
        (step.skillId !== BASIC_ATTACK_ID && !skillIds.has(step.skillId))
      ) {
        throw badRequest("A step needs a skill.", "invalid_body");
      }
      return { skillId: step.skillId, hint: text(step.hint ?? "", "hint", { max: 60 }) };
    })
  };
}

/** The order of the combos of a hero: all of them, each once. */
export function parseOrder(body, currentIds) {
  const input = plainObject(body, "The order");
  const ids = input.ids;
  const known = new Set(currentIds);
  if (
    !Array.isArray(ids) ||
    ids.length !== currentIds.length ||
    new Set(ids).size !== ids.length ||
    ids.some(id => !known.has(id))
  ) {
    throw badRequest("Send every combo of the hero once, in the order wanted.", "invalid_body");
  }
  return ids;
}

const DAY = 86_400_000;

/** The first check of a combo that has just been acquired: box 1, after the first delay. */
export const firstReview = now => ({ box: 1, dueAt: now + REVIEW_DAYS[0] * DAY });

/**
 * Where a combo goes after a check: one box further (the last one stays) when the player still
 * masters it, back to box 1 when not. `dueAt` is when it comes back.
 */
export function nextReview(box, sharp, now) {
  const next = sharp ? Math.min(Math.max(box, 1) + 1, REVIEW_DAYS.length) : 1;
  return { box: next, dueAt: now + REVIEW_DAYS[next - 1] * DAY };
}

/** The answer to a check: the player still masters the combo, or not. */
export function parseReviewAnswer(body) {
  const input = plainObject(body, "The answer");
  if (typeof input.sharp !== "boolean") {
    throw badRequest("Say whether you still master this combo: true or false.", "invalid_body");
  }
  return input.sharp;
}

/** What a player says of a combo: acquired as it is, acquired with the animation cancelled (or both). */
export function parseProgress(body) {
  const input = plainObject(body, "The progress");
  const flag = value => {
    if (value !== undefined && typeof value !== "boolean") {
      throw badRequest("Each form of a combo is acquired or not: true or false.", "invalid_body");
    }
    return value;
  };
  const normal = flag(input.normal);
  const animationCancel = flag(input.animationCancel);
  if (normal === undefined && animationCancel === undefined) {
    throw badRequest("Say which form of the combo is acquired.", "invalid_body");
  }
  return { normal, animationCancel };
}
