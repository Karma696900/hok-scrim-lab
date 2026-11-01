import { badRequest } from "../../platform/errors.js";
import {
  ARCANA_COLORS,
  ITEM_CATEGORIES,
  ITEM_TIERS,
  RECIPE_MAX,
  SHOP_CATEGORIES
} from "../../../shared/build-model.js";
import { parseWhen } from "./conditions.js";
import { ids, number, object, text, whole } from "./fields.js";
import { statLines } from "./catalog-domain-stats.js";
export { TAG_COLORS } from "./catalog-domain-stats.js";
export { valueFor } from "./catalog-domain-stats.js";
export { parseStat } from "./catalog-domain-stats.js";
export { parseTag } from "./catalog-domain-stats.js";
export { parseTagGroups } from "./catalog-domain-stats.js";
export { parseSpell } from "./catalog-domain-hero.js";
export { parseHeroProfile } from "./catalog-domain-hero.js";
export { parseBuildSet } from "./catalog-domain-hero.js";

// Validation of what an administrator enters in the catalogue. Pure. Everything is normalised (NFC,
// single spaces) and bounded.

/** The most lines (stats) of one item, and of one arcana. */
const ITEM_STATS_MAX = 20;
const ARCANA_STATS_MAX = 4;
/** The most passives and actives of one item (variants for the other heroes count). */
const EFFECTS_MAX = 12;

const EFFECT_KINDS = ["passive", "active"];

/** The most stat lines of one passive or active. */
export const EFFECT_STATS_MAX = 8;

function effects(value, known) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > EFFECTS_MAX) {
    throw badRequest("{label} must be a list of at most {max} items.", "invalid_body", {
      label: "effects",
      max: EFFECTS_MAX
    });
  }
  return value.map((entry, index) => {
    const row = object(entry, `effects[${index}]`);
    if (!EFFECT_KINDS.includes(row.kind)) {
      throw badRequest("{label} must be one of: {options}.", "invalid_body", {
        label: `effects[${index}].kind`,
        options: EFFECT_KINDS.join(", ")
      });
    }
    const cooldown =
      row.cooldownSeconds === undefined ||
      row.cooldownSeconds === null ||
      row.cooldownSeconds === ""
        ? null
        : number(row.cooldownSeconds, `effects[${index}].cooldownSeconds`, { min: 0, max: 3600 });
    const when = parseWhen(row.when, `effects[${index}].when`, known);
    // the stats the effect gives, written like the lines of the item
    const lines = statLines(row.stats ?? [], `effects[${index}].stats`, known, {
      min: 0,
      max: EFFECT_STATS_MAX
    });
    return {
      kind: row.kind,
      name: text(row.name, `effects[${index}].name`, { max: 60 }),
      text: text(row.text, `effects[${index}].text`, { max: 600, required: true }),
      cooldownSeconds: row.kind === "active" ? cooldown : null,
      ...(when ? { when } : {}),
      ...(lines.length ? { stats: lines } : {})
    };
  });
}

/** The slot an item goes in: one of ITEM_CATEGORIES (the `category` of an item). */
function slotOf(value, label = "category") {
  if (!ITEM_CATEGORIES.includes(value)) {
    throw badRequest("{label} must be one of: {options}.", "invalid_body", {
      label,
      options: ITEM_CATEGORIES.join(", ")
    });
  }
  return value;
}

/**
 * The shop category of an item: one of SHOP_CATEGORIES, null when the body says there is none, and
 * undefined when the body does not say (an update then keeps what is there).
 */
function shopCategoryOf(body, label = "shopCategory") {
  const value = body?.[label];
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  if (!SHOP_CATEGORIES.includes(value)) {
    throw badRequest("{label} must be one of: {options}.", "invalid_body", {
      label,
      options: SHOP_CATEGORIES.join(", ")
    });
  }
  return value;
}

/** The level of an item: one of ITEM_TIERS, null for none, undefined when the body does not say (kept). */
function tierOf(body) {
  const value = body.tier;
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  if (!ITEM_TIERS.includes(value)) {
    throw badRequest("{label} must be one of: {options}.", "invalid_body", {
      label: "tier",
      options: ITEM_TIERS.join(", ")
    });
  }
  return value;
}

/** The items an item is built from, in order (the same one possibly twice); undefined when not said (kept). */
function componentsOf(body, itemIds) {
  const value = body.components;
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length > RECIPE_MAX) {
    throw badRequest("{label} must list between 0 and {max} items.", "invalid_body", {
      label: "components",
      max: RECIPE_MAX
    });
  }
  return value.map(entry => {
    const id = whole(entry, "components", { min: 1, max: 2_000_000_000 });
    if (!itemIds?.has(id)) {
      throw badRequest("A component of the recipe is not in the catalogue.", "unknown_reference");
    }
    return id;
  });
}

/** The most items one bulk request can sort. */
const SORT_MAX = 300;

/**
 * A list of items to sort at once: { ids, category?, shopCategory? } becomes { ids, changes } where
 * changes holds only what the body says (the slot, the shop category, or both).
 */
export function parseItemSort(input) {
  const body = object(input, "The request");
  if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > SORT_MAX) {
    throw badRequest("{label} must list between 1 and {max} items.", "invalid_body", {
      label: "ids",
      max: SORT_MAX
    });
  }
  const ids = body.ids.map(id => whole(id, "ids", { min: 1, max: 2_000_000_000 }));
  if (new Set(ids).size !== ids.length) {
    throw badRequest("{label} lists the same item twice.", "invalid_body", { label: "ids" });
  }
  const changes = {};
  if (Object.hasOwn(body, "category")) {
    changes.category = slotOf(body.category);
  }
  const shop = shopCategoryOf(body);
  if (shop !== undefined) {
    changes.shopCategory = shop;
  }
  if (!Object.keys(changes).length) {
    throw badRequest("Say what to change: the slot, the category, or both.", "invalid_body");
  }
  return { ids, changes };
}

/**
 * An item: where it goes (category), what it gives (stats, some temporary, some only for certain
 * heroes), what it does (effects: several passives and/or actives, some only for certain heroes),
 * its tags and its picture. `known` is what the references can point to: { stats: Map(id → stat),
 * tagIds, imageIds, heroIds, roles }.
 */
export function parseItem(input, known) {
  const body = object(input, "The item");
  const category = slotOf(body.category);
  const imageId = body.imageId ?? null;
  if (imageId !== null && !known.imageIds.has(imageId)) {
    throw badRequest("The picture does not exist (send it again).", "unknown_reference");
  }
  return {
    name: text(body.name, "name", { max: 80, required: true }),
    category,
    shopCategory: shopCategoryOf(body),
    price:
      body.price === undefined || body.price === null || body.price === ""
        ? null
        : whole(body.price, "price", { min: 0, max: 100_000 }),
    imageId,
    description: text(body.description, "description", { max: 600 }),
    effects: effects(body.effects, known),
    stats: statLines(body.stats ?? [], "stats", known, { min: 0, max: ITEM_STATS_MAX }),
    tags: ids(body.tags, "tags", known.tagIds),
    tier: tierOf(body),
    components: componentsOf(body, known.itemIds)
  };
}

/** An arcana: its colour, picture, and up to 4 stats (the value given by one arcana). */
export function parseArcana(input, known) {
  const body = object(input, "The arcana");
  if (!ARCANA_COLORS.includes(body.color)) {
    throw badRequest("{label} must be one of: {options}.", "invalid_body", {
      label: "color",
      options: ARCANA_COLORS.join(", ")
    });
  }
  const imageId = body.imageId ?? null;
  if (imageId !== null && !known.imageIds.has(imageId)) {
    throw badRequest("The picture does not exist (send it again).", "unknown_reference");
  }
  return {
    name: text(body.name, "name", { max: 80, required: true }),
    color: body.color,
    imageId,
    description: text(body.description, "description", { max: 300 }),
    // an arcana can exist before its stats are written: the build lab then counts nothing for it
    stats: statLines(body.stats ?? [], "stats", known, { min: 0, max: ARCANA_STATS_MAX }),
    tags: ids(body.tags, "tags", known.tagIds)
  };
}
