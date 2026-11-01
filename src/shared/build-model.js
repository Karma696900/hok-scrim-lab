// A build, its validation, the stats it gives and what the tags say about it. Pure: used by the
// server (to validate what an administrator
// saves) and by the browser (the build lab and the hero sheet), so both always agree.
//
// A build is { items: [id × 6 at most, one pair of boots at most], utility: [id × 2], late: [id × 2], arcana: { red: [{ id, count }], blue: [...], green: [...] } }
// (at most 10 arcana of each colour in total, counted with the quantities).
//
// What an item or an arcana gives is a list of { statId, value | option, temporary?, durationSeconds?,
// note?, when? }: a number (or the id of an option, for a choice stat), that can be temporary, and
// that can depend on conditions about the hero (see conditions.js). Only what applies to the hero of
// the build is added up.
import { MAX_LEVEL, statAtLevel } from "./stat-values.js";
import { ARCANA_COLORS } from "./build-model-shared.js";
import { indexCatalog, sortArcana } from "./build-order.js";
export { ARCANA_COLORS } from "./build-model-shared.js";
export { compareArcana } from "./build-order.js";
export { itemType } from "./build-order.js";
export { ROAMING_TYPES } from "./build-order.js";
export { compareItems } from "./build-order.js";
export { indexCatalog } from "./build-order.js";
export { sortArcana } from "./build-order.js";
export { computeStats } from "./build-stats.js";
export { totalStats } from "./build-stats.js";
export { formatEntry } from "./build-stats.js";
export { encodeBuild } from "./build-address.js";
export { buildAddress } from "./build-address.js";
export { decodeBuild } from "./build-address.js";

export { MAX_LEVEL, statAtLevel };

/**
 * Marks a text as translatable (the collector in scripts/i18n/keys.mjs finds it); the text itself is
 * the key.
 */
const message = text => text;

export const ARCANA_PER_COLOR = 10;
export const SLOTS = { items: 6, utility: 2, late: 2 };
/**
 * The SLOT an item goes in (what a build has room for): boots and regular items share the six main
 * slots (one pair of boots at most), then the two utility slots and the two late-game slots. It is
 * the `category` of an item.
 */
export const ITEM_CATEGORIES = ["boots", "regular", "utility", "late"];
/** The slot group each item category goes in. */
export const GROUP_OF = { boots: "items", regular: "items", utility: "utility", late: "late" };
/**
 * The SHOP CATEGORY of an item, another thing than its slot: the tab it is found under in the shop
 * of the game. One at most (the `shopCategory` of an item), none until an administrator chooses.
 */
export const SHOP_CATEGORIES = [
  "physical",
  "magical",
  "defense",
  "movement",
  "jungling",
  "roaming"
];

/**
 * The LEVEL of an item in the shop of the game (its `tier`): a small basic item, an intermediate one built
 * from small ones, a final one, an enchanted one (the upgrades of the Roaming family). None until known.
 */
export const ITEM_TIERS = ["basic", "intermediate", "final", "enchanted"];
/** The most items one item is built from (the same one may count twice). */
export const RECIPE_MAX = 3;

/** Whether an item is offered in a build: not a part (basic, intermediate), as in the item slots of the game. */
export const inBuilds = item => item.tier !== "basic" && item.tier !== "intermediate";

/**
 * The core items of a build: the 2 or 3 main items the hero cannot do without (a recommended build
 * marks them; a visitor's build may).
 */
/** The spells a build takes into the match: one or two (a build with none is a build written before them). */
export const SPELLS_MAX = 2;
const MAX_CORE = 3;
/** A recommended build (the ones on the hero pages) marks 2 or 3 core items: the editor and the server agree. */
export const RECOMMENDED_CORE = { min: 2, max: MAX_CORE };

export const emptyBuild = () => ({
  items: [],
  utility: [],
  late: [],
  core: [],
  spells: [],
  arcana: { red: [], blue: [], green: [] }
});

/** Total quantity of one colour. */
const whole = value => Number.isInteger(value) && value > 0;

/** A build as the lab holds it, with only whole ids and at most what a build can hold. */
export function shapeBuild(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const ids = (list, max) => (Array.isArray(list) ? list.filter(whole).slice(0, max) : []);
  const build = emptyBuild();
  for (const group of Object.keys(SLOTS)) {
    build[group] = ids(input[group], SLOTS[group]);
  }
  build.core = ids(input.core, MAX_CORE);
  build.spells = [...new Set(ids(input.spells, 40))].slice(0, SPELLS_MAX);
  for (const color of ARCANA_COLORS) {
    const entries = Array.isArray(input.arcana?.[color]) ? input.arcana[color] : [];
    build.arcana[color] = entries
      .filter(entry => entry && whole(entry.id) && whole(entry.count))
      .slice(0, 40)
      .map(entry => ({ id: entry.id, count: entry.count }));
  }
  return build;
}

export const arcanaTotal = entries => entries.reduce((sum, entry) => sum + entry.count, 0);

/** The items of each group of slots: known, in the right group, once each, one pair of boots at most. */
function checkItems(input, index, build, problems) {
  const seen = new Set();
  for (const group of Object.keys(SLOTS)) {
    const ids = Array.isArray(input[group]) ? input[group] : [];
    if (ids.length > SLOTS[group]) {
      problems.push({
        template: message("A build has at most {max} items in this group."),
        params: { max: SLOTS[group] }
      });
    }
    for (const id of ids.slice(0, SLOTS[group])) {
      const item = index.items.get(id);
      if (!item) {
        problems.push({
          template: message("An item of this build is not in the catalog."),
          params: {}
        });
        continue;
      }
      if (GROUP_OF[item.category] !== group) {
        problems.push({
          template: message("{name} does not go in this group of slots."),
          params: { name: item.name }
        });
      }
      if (seen.has(id)) {
        problems.push({
          template: message("{name} is used twice: an item can only be in a build once."),
          params: { name: item.name }
        });
      }
      seen.add(id);
      build[group].push(id);
    }
  }
  if (build.items.filter(id => index.items.get(id)?.category === "boots").length > 1) {
    problems.push({ template: message("A build has only one pair of boots."), params: {} });
  }
}

/** The core items: at most three, among the main items. */
function checkCore(input, build, problems) {
  const core = Array.isArray(input.core) ? input.core : [];
  if (core.length > MAX_CORE) {
    problems.push({
      template: message("A build has at most {max} core items."),
      params: { max: MAX_CORE }
    });
  }
  for (const id of core.slice(0, MAX_CORE)) {
    if (!build.items.includes(id)) {
      problems.push({
        template: message("Core items must be among the main items of the build."),
        params: {}
      });
    } else if (!build.core.includes(id)) {
      build.core.push(id);
    }
  }
}

/** The spells: at most two, known, once each. */
function checkSpells(input, index, build, problems) {
  const spells = Array.isArray(input.spells) ? input.spells : [];
  if (spells.length > SPELLS_MAX) {
    problems.push({
      template: message("A build has at most {max} spells."),
      params: { max: SPELLS_MAX }
    });
  }
  for (const id of spells.slice(0, SPELLS_MAX)) {
    const spell = index.spells.get(id);
    if (!spell) {
      problems.push({
        template: message("A spell of this build is not in the catalog."),
        params: {}
      });
    } else if (build.spells.includes(id)) {
      problems.push({
        template: message("{name} is used twice: a spell can only be in a build once."),
        params: { name: spell.name }
      });
    } else {
      build.spells.push(id);
    }
  }
}

/** The arcana of each colour: known, of that colour, a whole quantity, once each, ten at most. */
function checkArcana(input, index, build, problems) {
  const arcana = input.arcana && typeof input.arcana === "object" ? input.arcana : {};
  for (const color of ARCANA_COLORS) {
    const entries = Array.isArray(arcana[color]) ? arcana[color] : [];
    const used = new Set();
    for (const entry of entries) {
      const piece = index.arcana.get(entry?.id);
      if (!piece) {
        problems.push({
          template: message("An arcana of this build is not in the catalog."),
          params: {}
        });
        continue;
      }
      if (piece.color !== color) {
        problems.push({
          template: message("{name} is not a {color} arcana."),
          params: { name: piece.name, color }
        });
        continue;
      }
      if (!Number.isInteger(entry.count) || entry.count < 1 || entry.count > ARCANA_PER_COLOR) {
        problems.push({
          template: message("The quantity of {name} must be a whole number from 1 to {max}."),
          params: { name: piece.name, max: ARCANA_PER_COLOR }
        });
        continue;
      }
      if (used.has(piece.id)) {
        problems.push({
          template: message("{name} appears twice: give it one quantity."),
          params: { name: piece.name }
        });
        continue;
      }
      used.add(piece.id);
      build.arcana[color].push({ id: piece.id, count: entry.count });
    }
    if (arcanaTotal(build.arcana[color]) > ARCANA_PER_COLOR) {
      problems.push({
        template: message("A build has at most {max} arcana of one colour."),
        params: { max: ARCANA_PER_COLOR }
      });
    }
    build.arcana[color] = sortArcana(build.arcana[color], index.arcana);
  }
}

/**
 * What a visitor or an administrator sent, as a clean build, plus the problems found. Nothing is
 * repaired silently: a problem means the build is not valid. `problems` are { template, params } so
 * that the page can translate them.
 */
export function checkBuild(raw, catalog) {
  const index = indexCatalog(catalog);
  const problems = [];
  const build = emptyBuild();
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  checkItems(input, index, build, problems);
  checkCore(input, build, problems);
  checkSpells(input, index, build, problems);
  checkArcana(input, index, build, problems);
  return { build, problems };
}
