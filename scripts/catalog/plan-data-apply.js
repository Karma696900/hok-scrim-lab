// Doing the plan: writing it to the catalogue, and undoing it from the manifest.
import { nameKey } from "./sources.mjs";
import {
  parseArcana,
  parseItem,
  parseSpell
} from "../../src/server/features/catalog/catalog-domain.js";

// ---- doing it ----------------------------------------------------------------------------------------------

async function known(store) {
  const [catalog, heroes, imageIds] = await Promise.all([
    store.readCatalog(),
    store.readHeroes(),
    store.imageIds()
  ]);
  return {
    catalog,
    stats: new Map(catalog.stats.map(stat => [stat.id, stat])),
    tagIds: new Set(catalog.tags.map(tag => tag.id)),
    imageIds,
    heroIds: new Set(heroes.map(hero => hero.id)),
    roles: new Set(heroes.flatMap(hero => hero.roles ?? []))
  };
}

const itemBody = item => ({
  name: item.name,
  category: item.category,
  shopCategory: item.shopCategory ?? null,
  price: item.price ?? null,
  imageId: item.imageId,
  description: item.description,
  effects: item.effects,
  stats: item.stats,
  tags: item.tags
});

const arcanaBody = piece => ({
  name: piece.name,
  color: piece.color,
  imageId: piece.imageId,
  description: piece.description,
  stats: piece.stats,
  tags: piece.tags
});

/**
 * Does the plan. `fetchImage(url)` gives the bytes of a spell icon as a processed picture, or null.
 * Returns the manifest that `undoManifest` reads: what was created, and what an updated entry held before.
 */
export async function applyPlan({ store, plan, fetchImage = async () => null }) {
  const manifest = {
    createdAt: new Date().toISOString(),
    stats: [],
    items: [],
    arcana: [],
    spells: []
  };
  for (const stat of plan.stats) {
    const catalog = await store.readCatalog();
    if (catalog.stats.some(entry => nameKey(entry.name) === nameKey(stat.name))) {
      continue;
    }
    manifest.stats.push({
      id: await store.createStat({
        name: stat.name,
        unit: stat.unit,
        sortOrder: stat.sortOrder,
        options: []
      }),
      name: stat.name
    });
  }
  let facts = await known(store);
  const idOfStat = name =>
    facts.catalog.stats.find(stat => nameKey(stat.name) === nameKey(name))?.id;
  const lineOf = line => ({ statId: idOfStat(line.stat), value: line.value });

  for (const entry of plan.items) {
    const before = facts.catalog.items.find(item => item.id === entry.id);
    if (!before) {
      continue;
    }
    const body = { ...itemBody(before) };
    if (entry.changes.shopCategory) {
      body.shopCategory = entry.changes.shopCategory;
    }
    if (entry.changes.stats) {
      body.stats = entry.changes.stats.map(lineOf);
    }
    if (entry.changes.description) {
      body.description = entry.changes.description;
    }
    await store.updateItem(entry.id, parseItem(body, facts));
    manifest.items.push({ id: entry.id, name: entry.name, before: itemBody(before) });
  }
  for (const entry of plan.arcana) {
    const before = facts.catalog.arcana.find(piece => piece.id === entry.id);
    if (!before) {
      continue;
    }
    const body = { ...arcanaBody(before), stats: entry.changes.stats.map(lineOf) };
    await store.updateArcana(entry.id, parseArcana(body, facts));
    manifest.arcana.push({ id: entry.id, name: entry.name, before: arcanaBody(before) });
  }
  for (const spell of plan.spells) {
    let imageId = null;
    const picture = spell.iconUrl ? await fetchImage(spell.iconUrl) : null;
    if (picture) {
      imageId = await store.saveImage(picture);
      facts = { ...facts, imageIds: new Set([...facts.imageIds, imageId]) };
    }
    const parsed = parseSpell(
      {
        name: spell.name,
        description: spell.description,
        cooldownSeconds: spell.cooldownSeconds,
        imageId
      },
      facts
    );
    manifest.spells.push({
      id: await store.createSpell(parsed),
      name: spell.name,
      picture: Boolean(imageId)
    });
  }
  return manifest;
}

/**
 * Takes a manifest back: the spells and the stats it created are deleted (a stat or a spell that something
 * uses since is kept, and said), the items and arcana it changed get back what they held before.
 */
export async function undoManifest({ store, manifest }) {
  const report = [];
  const facts = await known(store);
  for (const entry of manifest.items ?? []) {
    const body = { ...entry.before };
    // what the entry held before the import comes back; an edit made since, in this entry, is replaced
    await store.updateItem(entry.id, parseItem(body, facts));
    report.push(`restored item ${entry.name}`);
  }
  for (const entry of manifest.arcana ?? []) {
    await store.updateArcana(entry.id, parseArcana({ ...entry.before }, facts));
    report.push(`restored arcana ${entry.name}`);
  }
  for (const entry of manifest.spells ?? []) {
    try {
      report.push(
        (await store.deleteSpell(entry.id))
          ? `removed spell ${entry.name}`
          : `spell ${entry.name}: already gone`
      );
    } catch (error) {
      report.push(`kept spell ${entry.name}: ${error.message}`);
    }
  }
  for (const entry of manifest.stats ?? []) {
    try {
      report.push(
        (await store.deleteStat(entry.id))
          ? `removed stat ${entry.name}`
          : `stat ${entry.name}: already gone`
      );
    } catch (error) {
      report.push(`kept stat ${entry.name}: ${error.message}`);
    }
  }
  return report;
}
