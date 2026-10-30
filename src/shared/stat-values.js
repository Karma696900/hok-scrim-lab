// What a stat of the game can hold, and how a stat of a hero grows. Pure: the server uses it to
// check what an administrator enters, the browser to show and add up the values.
//
// A stat is written in one of four ways (its `unit`):
//   flat     a number, decimals allowed            (12.5)
//   whole    a whole number                         (3400)
//   percent  a number shown with a % sign          (15 → 15%)
//   choice   one of a list of named options        (Melee or Ranged)
// A choice stat has `options`: [{ id, name }]; what is stored is the id of the option, so renaming an
// option changes nothing that refers to it.

export const MAX_LEVEL = 15;
export const STAT_UNITS = ["flat", "whole", "percent", "choice"];
/** The most options a choice stat can offer. */
export const OPTIONS_MAX = 12;

export const isChoice = stat => stat?.unit === "choice";

/** The option of a choice stat with this id, or null. */
export const optionOf = (stat, id) =>
  (stat?.options ?? []).find(option => option.id === id) ?? null;

/** The stat of a hero at a level: its base value plus its growth for every level after the first. */
export const statAtLevel = (entry, level) =>
  entry.value + (entry.growth ?? 0) * (Math.max(1, Math.min(MAX_LEVEL, level)) - 1);
