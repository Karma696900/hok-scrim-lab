import { randomUUID } from "node:crypto";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as trainingStoreParts } from "./training-store-parts.js";
import { onView as trainingStoreNotebookPrivate } from "./training-store-notebook-private.js";
import { onView as trainingStoreMapsAdministrators } from "./training-store-maps-administrators.js";

/**
 * Database access for the training area: focus heroes, notebook, maps, prepared situations and
 * answers.
 */
export function createTrainingStore({ pool, inTransaction }) {
  const ctx = { pool, inTransaction };
  bindTo(ctx, trainingStoreParts, trainingStoreNotebookPrivate, trainingStoreMapsAdministrators);

  return {
    getPreferences: ctx.getPreferences,
    /** `modules` and `settings` are optional: what is not given keeps its stored value. */
    async savePreferences(userId, { modules, settings }) {
      const current = await this.getPreferences(userId);
      const next = { modules: modules ?? current.modules, settings: settings ?? current.settings };
      const now = Date.now();
      await ctx.pool.execute(
        "INSERT INTO user_preferences (user_id, modules_json, settings_json, onboarded_at, updated_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE modules_json = VALUES(modules_json), settings_json = VALUES(settings_json), onboarded_at = COALESCE(onboarded_at, VALUES(onboarded_at)), updated_at = VALUES(updated_at)",
        [userId, JSON.stringify(next.modules), JSON.stringify(next.settings), now, now]
      );
      return { ...next, onboarded: true };
    },

    getTrainingFocus: ctx.getTrainingFocus,
    setTrainingFocus: ctx.setTrainingFocus,

    listTrainingNotes: ctx.listTrainingNotes,
    createTrainingNote: ctx.createTrainingNote,
    updateTrainingNote: ctx.updateTrainingNote,
    deleteTrainingNote: ctx.deleteTrainingNote,

    saveTrainingMap: ctx.saveTrainingMap,
    listTrainingMaps: ctx.listTrainingMaps,
    getTrainingMapImage: ctx.getTrainingMapImage,
    deleteTrainingMap: ctx.deleteTrainingMap,

    listTrainingScenarios: ctx.listTrainingScenarios,
    getTrainingScenario: ctx.getTrainingScenario,
    async createTrainingScenario(scenario, createdBy) {
      const id = randomUUID();
      const now = Date.now();
      await ctx.pool.execute(
        "INSERT INTO training_scenarios (id, map_id, title, brief, pins_json, published, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          id,
          scenario.mapId,
          scenario.title,
          scenario.brief,
          JSON.stringify(scenario.pins),
          scenario.published ? 1 : 0,
          createdBy,
          now,
          now
        ]
      );
      return this.getTrainingScenario(id, { includeDrafts: true });
    },
    async updateTrainingScenario(id, scenario) {
      const [result] = await ctx.pool.execute(
        "UPDATE training_scenarios SET map_id = ?, title = ?, brief = ?, pins_json = ?, published = ?, updated_at = ? WHERE id = ?",
        [
          scenario.mapId,
          scenario.title,
          scenario.brief,
          JSON.stringify(scenario.pins),
          scenario.published ? 1 : 0,
          Date.now(),
          id
        ]
      );
      return result.affectedRows ? this.getTrainingScenario(id, { includeDrafts: true }) : null;
    },
    deleteTrainingScenario: ctx.deleteTrainingScenario,

    getTrainingAnswer: ctx.getTrainingAnswer,
    saveTrainingAnswer: ctx.saveTrainingAnswer
  };
}
