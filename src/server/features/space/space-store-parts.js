// space store, small helpers: parse, presentBuild, presentLink, ownedTierLists, and 1 more.

import { jsonColumn as parse } from "../../platform/database/json-column.js";

export { parse };

export const presentBuild = row => ({
  id: row.id,
  heroId: row.hero_id,
  name: row.name,
  level: Number(row.level),
  build: parse(row.build_json, {}),
  savedAt: Number(row.updated_at)
});

export const presentLink = row => ({
  id: row.id,
  label: row.label,
  sections: String(row.sections).split(",").filter(Boolean),
  createdAt: Number(row.created_at),
  expiresAt: row.expires_at === null ? null : Number(row.expires_at),
  openedAt: row.opened_at === null ? null : Number(row.opened_at),
  openedCount: Number(row.opened_count)
});

// ---- what a space shows besides the builds --------------------------------------------------
/** The tier lists a person owns (not the ones shared with them), the latest first. */
export async function ownedTierLists(ctx, userId) {
  const [rows] = await ctx.pool.execute(
    `SELECT data_json FROM tier_lists WHERE owner_user_id = ? ORDER BY updated_at DESC LIMIT ${TIER_LISTS_SHOWN}`,
    [userId]
  );
  return rows.map(row => parse(row.data_json, null)).filter(Boolean);
}

/** The combos of the heroes a player has acquired, in at least one form. */
export async function acquiredCombos(ctx, userId) {
  const [rows] = await ctx.pool.execute(
    "SELECT c.id, c.hero_id, c.name, p.normal_done, p.cancel_done FROM combo_progress p JOIN hero_combos c ON c.id = p.combo_id WHERE p.user_id = ? AND (p.normal_done = 1 OR p.cancel_done = 1) ORDER BY c.hero_id, c.position",
    [userId]
  );
  return rows.map(row => ({
    id: row.id,
    heroId: row.hero_id,
    name: row.name,
    normal: Boolean(row.normal_done),
    animationCancel: Boolean(row.cancel_done)
  }));
}

/** Tier lists shown in a space: the latest ones. */
const TIER_LISTS_SHOWN = 50;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { ownedTierLists, acquiredCombos };
