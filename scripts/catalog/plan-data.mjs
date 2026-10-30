// What the three saved pages (see sources.mjs) would change in the catalogue, and how to do it and take it
// back. `planImport` is pure; `applyPlan` and `undoManifest` talk to a store.
//
// The rule is the one of the picture importer: nothing the owner wrote is ever replaced.
//   - an item gets the category of its table, its stats and its effect line ONLY where it has none yet;
//   - an arcana gets its stats only where it has none, and only if the colour of the page is its colour;
//   - a spell is created only when no spell has that name;
//   - a stat of the game is created only when no stat has that name.
// Everything that is not done is in the plan, with the reason, so that it can be read.
import { processCatalogImage } from "../../src/server/platform/images/catalog-image.js";
import { STAT_WORDS, nameKey } from "./sources.mjs";
export { applyPlan } from "./plan-data-apply.js";
export { undoManifest } from "./plan-data-apply.js";

/**
 * The names of the owner's items that the wiki spells differently (the owner's files carry the typos of
 * their file names). Only spelling differences: two items are never merged by guesswork.
 */
export const ITEM_ALIASES = new Map([
  ["mask of angony", "mask of agony"],
  ["ardent dominion", "ardent dominator"],
  ["downlight", "dawnlight"]
]);

const IMAGE_HOSTS = new Set(["game.gtimg.cn"]);
const MAX_ICON_BYTES = 2 * 1024 * 1024;

/** The bytes of a spell icon, processed like an upload, or null (with the reason said). */
export async function fetchIcon(url, fetchImpl = fetch) {
  let address;
  try {
    address = new URL(url);
  } catch {
    console.log(`  icon ${url}: not an address`);
    return null;
  }
  if (address.protocol !== "https:" || !IMAGE_HOSTS.has(address.hostname)) {
    console.log(`  icon ${url}: not from the official image host, not downloaded`);
    return null;
  }
  try {
    const response = await fetchImpl(address, {
      redirect: "error",
      signal: AbortSignal.timeout(15_000)
    });
    const type = (response.headers.get("content-type") ?? "").split(";")[0];
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok || bytes.length > MAX_ICON_BYTES || !/^image\//.test(type)) {
      console.log(
        `  icon ${url}: refused (status ${response.status}, ${type}, ${bytes.length} bytes)`
      );
      return null;
    }
    return await processCatalogImage(bytes, type, { kind: "item" });
  } catch (error) {
    console.log(`  icon ${url}: ${error.message}`);
    return null;
  }
}

/** The name a stat has on the pages → the other names the owner may have given it in their catalogue. */
const STAT_SYNONYMS = new Map([["Attack Speed", ["Attack Speed Bonus"]]]);

const unitOf = percent => (percent ? "percent" : "flat");

/** The items of the wiki table against the items of the catalogue: what to complete, what to leave. */
function planItems({ plan, catalog, linesFor }, wiki) {
  const rows = new Map(wiki.items.map(row => [nameKey(row.name), row]));
  const matched = new Set();
  for (const item of catalog.items) {
    const key = nameKey(item.name);
    const row = rows.get(key) ?? rows.get(ITEM_ALIASES.get(key));
    if (!row) {
      plan.notes.items.push({
        name: item.name,
        why: "not on the wiki page (or under another name)"
      });
      continue;
    }
    matched.add(nameKey(row.name));
    const changes = {};
    const kept = [];
    if (item.shopCategory === null || item.shopCategory === undefined) {
      changes.shopCategory = row.shopCategory;
    } else if (item.shopCategory !== row.shopCategory) {
      kept.push(`category: yours is ${item.shopCategory}, the wiki table is ${row.shopCategory}`);
    }
    if (!item.stats.length) {
      const lines = linesFor(row.lines, `the wiki for ${item.name}`);
      if (lines) {
        changes.stats = lines;
      }
    } else {
      kept.push("stats: already written");
    }
    if (!item.description && row.effect) {
      changes.description = row.effect;
    }
    if (ITEM_ALIASES.has(key)) {
      kept.push(`matched by spelling: the wiki writes “${row.name}”`);
    }
    if (Object.keys(changes).length) {
      plan.items.push({ id: item.id, name: item.name, changes, kept });
    } else {
      plan.notes.items.push({
        name: item.name,
        why: `nothing to add (${kept.join("; ") || "complete"})`
      });
    }
  }
  for (const row of wiki.items) {
    if (!matched.has(nameKey(row.name))) {
      plan.notes.items.push({
        wiki: row.name,
        why: "on the wiki page, no item of that name in the catalogue"
      });
    }
  }
  for (const row of wiki.skipped) {
    plan.notes.items.push({ wiki: row.name, why: `not read: ${row.reason}` });
  }
}

/** The arcana of the guide page against the arcana of the catalogue. */
function planArcana({ plan, catalog, linesFor }, arcana) {
  const rows = new Map(arcana.arcana.map(row => [nameKey(row.name), row]));
  const matched = new Set();
  for (const piece of catalog.arcana) {
    const row = rows.get(nameKey(piece.name));
    if (!row) {
      plan.notes.arcana.push({ name: piece.name, why: "not on the guide page" });
      continue;
    }
    matched.add(nameKey(row.name));
    // The guide calls the survival arcana "green" and the utility ones "blue"; the pictures of the game
    // (which the colours of the catalogue come from) have it the other way round. Between those two
    // colours only, the stats (tied to the NAME) are written and the colour of the catalogue is kept;
    // any other disagreement (a red one that is not red) leaves the arcana alone.
    const swapped =
      row.color !== piece.color &&
      ["blue", "green"].includes(row.color) &&
      ["blue", "green"].includes(piece.color);
    if (row.color !== piece.color && !swapped) {
      plan.notes.arcana.push({
        name: piece.name,
        why: `the guide lists it as ${row.color}, the catalogue has it ${piece.color}: left alone`
      });
    } else if (piece.stats.length) {
      plan.notes.arcana.push({ name: piece.name, why: "stats already written" });
    } else {
      const lines = linesFor(row.lines, `the guide for ${piece.name}`);
      if (lines) {
        plan.arcana.push({
          id: piece.id,
          name: piece.name,
          changes: { stats: lines },
          kept: swapped
            ? [
                `colour: the guide says ${row.color}, the picture and the catalogue say ${piece.color} (kept)`
              ]
            : []
        });
      }
    }
  }
  for (const row of arcana.arcana) {
    if (!matched.has(nameKey(row.name))) {
      plan.notes.arcana.push({
        guide: row.name,
        why: "on the guide page, no arcana of that name"
      });
    }
  }
  for (const row of arcana.skipped) {
    plan.notes.arcana.push({ guide: row.name, why: `not read: ${row.reason}` });
  }
}

/** The spells of the page against the spells of the catalogue: only the missing ones are created. */
function planSpells({ plan, catalog }, spells) {
  const existing = new Set((catalog.spells ?? []).map(spell => nameKey(spell.name)));
  for (const spell of spells.spells) {
    if (existing.has(nameKey(spell.name))) {
      plan.notes.spells.push({
        name: spell.name,
        why: "a spell of that name exists: left alone"
      });
    } else {
      plan.spells.push({ ...spell });
    }
  }
  for (const row of spells.skipped) {
    plan.notes.spells.push({ name: row.name, why: `not read: ${row.reason}` });
  }
}

/** @returns the plan: what to create and update, and what was left alone with the reason. */
export function planImport({ catalog, wiki = null, arcana = null, spells = null }) {
  const plan = {
    stats: [], // [{ name, unit, sortOrder }] to create
    items: [], // [{ id, name, changes: { shopCategory?, stats?, description? }, kept: [] }]
    arcana: [],
    spells: [], // [{ ...spell }] to create
    notes: { items: [], arcana: [], spells: [], stats: [] }
  };
  const have = new Map(catalog.stats.map(stat => [nameKey(stat.name), stat]));
  const wanted = new Map(); // stat name → percent
  /** A stat of the catalogue by name, or by the name the owner gives it ("Attack Speed" is their "Attack Speed Bonus"). */
  const findStat = name =>
    have.get(nameKey(name)) ??
    (STAT_SYNONYMS.get(name) ?? []).map(other => have.get(nameKey(other))).find(Boolean);

  const linesFor = (lines, owner) => {
    const usable = [];
    for (const line of lines) {
      // the stat of the catalogue the line is for: the owner's own name first (their stats are theirs)
      let name = line.stat;
      let stat = findStat(name);
      if (stat && (stat.unit === "percent") !== line.percent) {
        if (line.percent && stat.unit === "flat") {
          // "7.5% Movement Speed" next to a flat "Movement Speed": the percentage is a stat of its own,
          // named like the owner names "Attack Speed Bonus"
          name = `${stat.name} Bonus`;
          stat = findStat(name);
        } else {
          stat = null;
          name = null;
        }
        if (name && stat && (stat.unit === "percent") !== line.percent) {
          name = null;
        }
        if (!name) {
          plan.notes.stats.push(
            `${line.stat}: the catalogue has it as a different kind of number than ${owner} gives (${line.percent ? "a percentage" : "a whole value"})`
          );
          return null;
        }
      }
      if (!stat) {
        wanted.set(name, line.percent);
      }
      usable.push({ ...line, stat: stat ? stat.name : name });
    }
    return usable;
  };

  const parts = { plan, catalog, linesFor };
  if (wiki) {
    planItems(parts, wiki);
  }

  if (arcana) {
    planArcana(parts, arcana);
  }

  if (spells) {
    planSpells(parts, spells);
  }

  let order = Math.max(0, ...catalog.stats.map(stat => stat.sortOrder ?? 0)) + 1;
  const order_ = new Map(STAT_WORDS.map(([name], index) => [name, index]));
  for (const [name, percent] of [...wanted].sort(
    (a, b) => (order_.get(a[0]) ?? 99) - (order_.get(b[0]) ?? 99)
  )) {
    plan.stats.push({ name, unit: unitOf(percent), sortOrder: order });
    order += 1;
  }
  return plan;
}
