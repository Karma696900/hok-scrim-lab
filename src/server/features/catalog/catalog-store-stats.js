// catalog store, stats: createStat, usageData, checkStatChange, updateStat, and 2 more.
import { conflict } from "../../platform/errors.js";
import { fractionalUsage, optionUsage, statUsage as statUsageIn } from "./usage.js";
import { duplicate, parse } from "./catalog-store-parts.js";

// ---- stats ----------------------------------------------------------------------------------
export async function createStat(ctx, stat) {
  try {
    const [result] = await ctx.pool.execute(
      "INSERT INTO game_stats (name, unit, sort_order, options_json) VALUES (?, ?, ?, ?)",
      [stat.name, stat.unit, stat.sortOrder, JSON.stringify(stat.options)]
    );
    ctx.forget();
    return result.insertId;
  } catch (error) {
    duplicate(error, () => conflict("A stat with this name already exists.", "duplicate_name"));
  }
}

/**
 * What the catalogue and the heroes hold, read fresh (the cache is not trusted to decide whether
 * something is still used).
 */
export async function usageData(ctx) {
  ctx.forget();
  const [catalog, [profiles]] = await Promise.all([
    ctx.store.readCatalog(),
    ctx.pool.query("SELECT hero_id, base_stats_json, skills_json FROM hero_profiles")
  ]);
  return {
    catalog,
    profiles: profiles.map(row => ({
      heroId: row.hero_id,
      baseStats: parse(row.base_stats_json, []),
      skills: parse(row.skills_json, [])
    }))
  };
}

/**
 * Refuses a change of a stat that would leave what uses it meaningless: from a number to a
 * choice (or back) while it is used, an option that is still used taken away, a stat turned into
 * a whole number while some of its values are not.
 */
export async function checkStatChange(ctx, previous, next) {
  const data = await ctx.store.usageData();
  const kind = unit => (unit === "choice" ? "choice" : "number");
  if (kind(previous.unit) !== kind(next.unit) && statUsageIn(data, previous.id)) {
    throw conflict(
      "This stat is used by {count} items, arcana or heroes: it cannot change from a number to a choice (or back) until they stop using it.",
      "in_use",
      { count: statUsageIn(data, previous.id) }
    );
  }
  for (const option of previous.options ?? []) {
    if (next.options.some(entry => entry.id === option.id)) {
      continue;
    }
    const used = optionUsage(data, previous.id, option.id);
    if (used) {
      throw conflict(
        "The option “{name}” is used by {count} items, arcana or heroes: remove it from them first.",
        "in_use",
        { name: option.name, count: used }
      );
    }
  }
  if (next.unit === "whole" && previous.unit !== "whole") {
    const count = fractionalUsage(data, previous.id);
    if (count) {
      throw conflict(
        "{count} values of this stat are not whole numbers: change them first.",
        "in_use",
        { count }
      );
    }
  }
}

export async function updateStat(ctx, id, stat) {
  const previous = (await ctx.store.usageData()).catalog.stats.find(entry => entry.id === id);
  if (!previous) {
    return false;
  }
  await ctx.store.checkStatChange(previous, stat);
  try {
    const [result] = await ctx.pool.execute(
      "UPDATE game_stats SET name = ?, unit = ?, sort_order = ?, options_json = ? WHERE id = ?",
      [stat.name, stat.unit, stat.sortOrder, JSON.stringify(stat.options), id]
    );
    ctx.forget();
    return result.affectedRows > 0;
  } catch (error) {
    duplicate(error, () => conflict("A stat with this name already exists.", "duplicate_name"));
  }
}

/**
 * How many things write with this stat or have a condition on it (items, arcana, hero profiles).
 * Deleting one that is used is refused.
 */
export async function statUsage(ctx, id) {
  return statUsageIn(await ctx.store.usageData(), id);
}

export async function deleteStat(ctx, id) {
  const used = await ctx.store.statUsage(id);
  if (used) {
    throw conflict(
      "This stat is used by {count} items, arcana or heroes: remove it from them first.",
      "in_use",
      { count: used }
    );
  }
  const [result] = await ctx.pool.execute("DELETE FROM game_stats WHERE id = ?", [id]);
  ctx.forget();
  return result.affectedRows > 0;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { createStat, usageData, checkStatChange, updateStat, statUsage, deleteStat };
