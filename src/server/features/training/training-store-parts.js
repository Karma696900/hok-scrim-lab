// training store, small helpers: parse, presentNote, presentMap, presentScenario, and 8 more.
import { DEFAULT_SETTINGS, MODULES } from "../preferences/preference-domain.js";
import { FOCUS_MAX } from "./training-domain.js";
import { conflict } from "../../platform/errors.js";

import { jsonColumn as parse } from "../../platform/database/json-column.js";

export { parse };

export const presentNote = row => ({
  id: row.id,
  kind: row.kind,
  heroId: row.hero_id,
  title: row.title,
  body: row.body,
  status: row.status,
  steps: parse(row.steps_json, []),
  url: row.url ?? null,
  marks: parse(row.marks_json, []),
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at)
});

export const presentMap = row => ({
  id: row.id,
  name: row.name,
  width: Number(row.width),
  height: Number(row.height),
  createdAt: Number(row.created_at)
});

export const presentScenario = (row, { withPins = true } = {}) => ({
  id: row.id,
  mapId: row.map_id,
  title: row.title,
  brief: row.brief,
  published: Boolean(row.published),
  ...(withPins
    ? { pins: parse(row.pins_json, []) }
    : { pinCount: parse(row.pins_json, []).length }),
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at)
});

// ---- what a person wants in their menu (onboarding) -----------------------------------------
/**
 * Everything is on and every setting is at its default until the person chooses; `onboarded`
 * tells whether they went through the welcome pages.
 */
export async function getPreferences(ctx, userId) {
  const [[row]] = await ctx.pool.query(
    "SELECT modules_json, settings_json, onboarded_at FROM user_preferences WHERE user_id = ?",
    [userId]
  );
  const stored = parse(row?.modules_json, MODULES);
  return {
    modules: MODULES.filter(module => stored.includes(module)),
    onboarded: Boolean(row?.onboarded_at),
    settings: { ...DEFAULT_SETTINGS, ...parse(row?.settings_json, {}) }
  };
}

// ---- the heroes a player works on -----------------------------------------------------------
export async function getTrainingFocus(ctx, userId) {
  const [rows] = await ctx.pool.query(
    "SELECT hero_id FROM training_focus WHERE user_id = ? ORDER BY position, added_at",
    [userId]
  );
  return rows.map(row => row.hero_id);
}

export async function setTrainingFocus(ctx, userId, heroIds) {
  if (heroIds.length > FOCUS_MAX) {
    throw conflict("Choose at most {max} heroes.", "focus_full", { max: FOCUS_MAX });
  }
  await ctx.inTransaction(async connection => {
    await connection.execute("DELETE FROM training_focus WHERE user_id = ?", [userId]);
    const now = Date.now();
    for (const [position, heroId] of heroIds.entries()) {
      await connection.execute(
        "INSERT INTO training_focus (user_id, hero_id, position, added_at) VALUES (?, ?, ?, ?)",
        [userId, heroId, position, now]
      );
    }
  });
  return heroIds;
}

// ---- prepared situations --------------------------------------------------------------------
export async function listTrainingScenarios(ctx, { includeDrafts = false } = {}) {
  const [rows] = await ctx.pool.query(
    `SELECT * FROM training_scenarios ${includeDrafts ? "" : "WHERE published = 1"} ORDER BY updated_at DESC`
  );
  return rows.map(row => presentScenario(row, { withPins: false }));
}

export async function getTrainingScenario(ctx, id, { includeDrafts = false } = {}) {
  const [[row]] = await ctx.pool.query(
    `SELECT * FROM training_scenarios WHERE id = ? ${includeDrafts ? "" : "AND published = 1"}`,
    [id]
  );
  return row ? presentScenario(row) : null;
}

export async function deleteTrainingScenario(ctx, id) {
  const [result] = await ctx.pool.execute("DELETE FROM training_scenarios WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

// ---- a player's answer to a situation -------------------------------------------------------
export async function getTrainingAnswer(ctx, userId, scenarioId) {
  const [[row]] = await ctx.pool.query(
    "SELECT answer, updated_at FROM training_attempts WHERE user_id = ? AND scenario_id = ?",
    [userId, scenarioId]
  );
  return row ? { answer: row.answer, updatedAt: Number(row.updated_at) } : null;
}

export async function saveTrainingAnswer(ctx, userId, scenarioId, answer) {
  const now = Date.now();
  await ctx.pool.execute(
    "INSERT INTO training_attempts (user_id, scenario_id, answer, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE answer = VALUES(answer), updated_at = VALUES(updated_at)",
    [userId, scenarioId, answer, now]
  );
  return { answer, updatedAt: now };
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  getPreferences,
  getTrainingFocus,
  setTrainingFocus,
  listTrainingScenarios,
  getTrainingScenario,
  deleteTrainingScenario,
  getTrainingAnswer,
  saveTrainingAnswer
};
