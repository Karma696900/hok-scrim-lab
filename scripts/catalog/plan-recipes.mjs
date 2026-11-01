// The levels, prices and recipes of the items (scripts/catalog/data/game-items-*.json, facts read on fan sites,
// each with its page): what they would change in the catalogue, doing it, and taking it back.
//
// The rule of the other importers: nothing the owner wrote is ever replaced.
//   - an item that is missing (the small and intermediate ones) is created with its level, price, shop category,
//     stats and the address of its official icon;
//   - an existing item gets its level, price, shop category and stats ONLY where it has none (a different value
//     is kept, and said);
//   - a recipe is written only for an item that has none.
// `planRecipes` is pure; `applyRecipes` and `undoRecipes` talk to a store.
import { parseItem } from "../../src/server/features/catalog/catalog-domain.js";
import { ITEM_ALIASES } from "./plan-data.mjs";
import { nameKey } from "./sources.mjs";

/** The official icon of an item, by its id in the game (the host the spell icons come from). */
export const iconUrl = gameId =>
  `https://game.gtimg.cn/images/yxzj/img201606/itemimg/${Number(gameId)}.jpg`;

/** The owner's short names of items the pages name in full (only one item of the game starts so). */
const SHORT_NAMES = new Map([["assassin", "assassins wristbow"]]);
const keyOf = name => {
  const key = nameKey(name);
  return ITEM_ALIASES.get(key) ?? SHORT_NAMES.get(key) ?? key;
};

export function planRecipes({ catalog, data }) {
  const statOf = new Map(catalog.stats.map(stat => [nameKey(stat.name), stat.id]));
  const existing = new Map(catalog.items.map(item => [keyOf(item.name), item]));
  const plan = { create: [], update: [], recipes: [], notes: { unknownStats: [] } };
  for (const entry of data.items) {
    const lines = [];
    for (const line of entry.stats) {
      const statId = statOf.get(nameKey(line.stat));
      if (statId) {
        lines.push({ statId, value: line.value });
      } else {
        plan.notes.unknownStats.push(`${entry.name}: ${line.stat}`);
      }
    }
    const item = existing.get(keyOf(entry.name));
    if (!item) {
      plan.create.push({
        name: entry.name,
        category: entry.name.startsWith("Boots of") ? "boots" : "regular",
        tier: entry.tier,
        price: entry.price,
        shopCategory: entry.shopCategory ?? null,
        stats: lines,
        gameId: entry.gameId ?? null,
        sources: entry.sources
      });
    } else {
      const changes = {};
      const kept = [];
      const fill = (field, value, label) => {
        if (value === null || value === undefined) {
          return;
        }
        if (item[field] === null || item[field] === undefined) {
          changes[field] = value;
        } else if (item[field] !== value) {
          kept.push(`${label} ${item[field]} kept (the page says ${value})`);
        }
      };
      fill("tier", entry.tier, "level");
      fill("price", entry.price, "price");
      fill("shopCategory", entry.shopCategory, "shop category");
      if (!item.stats.length && lines.length) {
        changes.stats = lines;
      }
      if (Object.keys(changes).length || kept.length) {
        plan.update.push({ id: item.id, name: item.name, changes, kept, sources: entry.sources });
      }
    }
    if (entry.components.length && !(item?.components?.length > 0)) {
      plan.recipes.push({
        name: entry.name,
        components: [...entry.components],
        source: entry.sources?.components ?? null
      });
    }
  }
  return plan;
}

// ---- doing it ----------------------------------------------------------------------------------------------

async function facts(store) {
  const [catalog, heroes, imageIds] = await Promise.all([
    store.readCatalog(),
    store.readHeroes(),
    store.imageIds()
  ]);
  return {
    catalog,
    stats: new Map(catalog.stats.map(stat => [stat.id, stat])),
    tagIds: new Set(catalog.tags.map(tag => tag.id)),
    itemIds: new Set(catalog.items.map(item => item.id)),
    imageIds,
    heroIds: new Set(heroes.map(hero => hero.id)),
    roles: new Set(heroes.flatMap(hero => hero.roles ?? []))
  };
}

/** Everything an item holds, as the admin form sends it, with its level, recipe and sources. */
const bodyOf = item => ({
  name: item.name,
  category: item.category,
  shopCategory: item.shopCategory ?? null,
  tier: item.tier ?? null,
  price: item.price ?? null,
  imageId: item.imageId ?? null,
  description: item.description ?? "",
  effects: item.effects ?? [],
  stats: item.stats ?? [],
  tags: item.tags ?? [],
  components: item.components ?? []
});

const save = async (store, id, body, known, sources) =>
  store.updateItem(id, { ...parseItem(body, known), sources });

/**
 * Does the plan. `fetchImage(url)` gives the bytes of an icon as a processed picture, or null. Returns the
 * manifest `undoRecipes` reads: the items created, and what each updated item held before.
 */
export async function applyRecipes({ store, plan, fetchImage = async () => null }) {
  const manifest = { createdAt: new Date().toISOString(), created: [], updated: [] };
  let known = await facts(store);
  const touched = new Map();
  const remember = item => {
    if (!touched.has(item.id)) {
      touched.set(item.id, { id: item.id, name: item.name, before: bodyOf(item) });
      touched.get(item.id).before.sources = item.sources ?? {};
    }
  };
  for (const entry of plan.create) {
    let imageId = null;
    const picture = entry.gameId ? await fetchImage(iconUrl(entry.gameId)) : null;
    if (picture) {
      imageId = await store.saveImage(picture);
      known = { ...known, imageIds: new Set([...known.imageIds, imageId]) };
    }
    const body = { ...bodyOf({ ...entry, components: [] }), imageId };
    const id = await store.createItem({ ...parseItem(body, known), sources: entry.sources });
    manifest.created.push({ id, name: entry.name, picture: Boolean(imageId) });
  }
  known = await facts(store);
  for (const entry of plan.update) {
    const item = known.catalog.items.find(candidate => candidate.id === entry.id);
    if (item) {
      remember(item);
      const sources = { ...item.sources };
      for (const field of Object.keys(entry.changes)) {
        sources[field] = entry.sources?.[field] ?? null;
      }
      await save(store, item.id, { ...bodyOf(item), ...entry.changes }, known, sources);
    }
  }
  known = await facts(store);
  const byKey = new Map(known.catalog.items.map(item => [keyOf(item.name), item]));
  for (const recipe of plan.recipes) {
    const item = byKey.get(keyOf(recipe.name));
    const parts = recipe.components.map(name => byKey.get(keyOf(name))?.id);
    if (item && parts.every(Boolean)) {
      remember(item);
      const fresh = (await store.readCatalog()).items.find(entry => entry.id === item.id);
      const sources = { ...fresh.sources, components: recipe.source };
      await save(store, item.id, { ...bodyOf(fresh), components: parts }, known, sources);
    }
  }
  manifest.updated = [...touched.values()].filter(
    entry => !manifest.created.some(created => created.id === entry.id)
  );
  return manifest;
}

/**
 * Takes a manifest back: the items it changed get back what they held, the items it created are deleted
 * (their recipes first; an item a build or another recipe uses since is kept, and said).
 */
export async function undoRecipes({ store, manifest }) {
  const report = [];
  let known = await facts(store);
  for (const entry of manifest.updated ?? []) {
    const { sources, ...before } = entry.before;
    await save(store, entry.id, before, known, sources);
    report.push(`restored ${entry.name}`);
  }
  known = await facts(store);
  for (const entry of manifest.created ?? []) {
    const item = known.catalog.items.find(candidate => candidate.id === entry.id);
    if (item?.components.length) {
      await save(store, item.id, { ...bodyOf(item), components: [] }, known, item.sources);
    }
  }
  for (const entry of [...(manifest.created ?? [])].reverse()) {
    try {
      report.push(
        (await store.deleteItem(entry.id)) ? `removed ${entry.name}` : `${entry.name}: already gone`
      );
    } catch (error) {
      report.push(`kept ${entry.name}: ${error.message}`);
    }
  }
  return report;
}
