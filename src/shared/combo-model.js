// What the server and the pages both know about combos.

/**
 * The step of a combo that is not a skill of the hero: its basic attack (the "auto attack" that many
 * combos weave between two skills). It belongs to every hero, so it is not in the sheet of a hero.
 */
export const BASIC_ATTACK_ID = "basic";

/** How many skills one combo can chain. */
export const COMBO_STEPS_MAX = 12;

/** The two forms in which a player validates a combo: as it is, and with the animation cancelled. */
export const COMBO_FORMS = ["normal", "animationCancel"];

/**
 * Spaced repetition: a combo that a player has acquired comes back to be checked, a little later each
 * time they still master it. Box 1 is checked after a day, box 5 after a month; a combo that is no
 * longer sharp goes back to box 1.
 */
export const REVIEW_DAYS = [1, 3, 7, 14, 30];
/** How many combos are asked at once, and how many still to learn are suggested. */
export const REVIEW_SHOWN = 10;
export const TO_LEARN_SHOWN = 5;

/** What a team can ask for a hero: its combos acquired in one form, or in both. */
export const HERO_GOAL_FORMS = [...COMBO_FORMS, "both"];
export const MAX_HERO_GOALS_PER_TEAM = 10;
