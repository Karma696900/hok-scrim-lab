// A stat of the game can be a choice among named options (Attack range: Melee or Ranged). What a
// stat is written as is `game_stats.unit`, which now also holds "whole" and "choice" next to "flat"
// and "percent" (the column was wide enough already), and the options of a choice stat are kept in
// `options_json`. Everything else this brings (temporary values, values and effects that depend on
// conditions about the hero) is written inside the JSON of the items, the arcana and the hero
// profiles, where a line without the new fields means what it always meant. Additive only.
import { addColumnIfMissing } from "./helpers.js";

export default {
  version: 26,
  name: "stat-kinds",
  async up(connection) {
    await addColumnIfMissing(connection, "game_stats", "options_json", "TEXT NULL");
  }
};
