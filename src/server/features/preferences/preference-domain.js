import { badRequest } from "../../platform/errors.js";
import { DIRECTIONS, THEMES } from "../../../shared/display-options.js";
import { GAME_MODES } from "../series/series.js";

/**
 * The optional parts of the site a person can switch on or off in their menu. The community (teams,
 * find a scrim, agenda, inbox, player page, Discord) is never optional, so it is not in this list.
 * A part that is switched off is only hidden from the menu: its address keeps working.
 */
export const MODULES = ["scrims", "tier-lists", "heroes", "training"];
export const START_PAGES = ["/", "/scrims", "/training", "/find", "/agenda"];
export const BEST_OF = [1, 3, 5, 7];
export const DRAFT_CONTROLS = ["solo", "two-players", "online"];

/**
 * What a person has not changed. The theme and the text direction are not here on purpose: until a
 * person chooses, the page keeps what the visitor's cookies say (light or dark, the direction of
 * the language).
 */
export const DEFAULT_SETTINGS = {
  bestOf: 3,
  gameMode: "global-ban-pick",
  draftMode: "solo",
  startPage: "/",
  reduceMotion: false
};

const oneOf = (value, options, label) => {
  if (!options.includes(value)) {
    throw badRequest("{label} is not a supported choice.", "invalid_body", { label });
  }
  return value;
};

function parseModules(list) {
  if (!Array.isArray(list)) {
    throw badRequest("modules must be a list.", "invalid_body");
  }
  const chosen = new Set();
  for (const module of list) {
    if (!MODULES.includes(module)) {
      throw badRequest("Unknown part of the site.", "invalid_body");
    }
    chosen.add(module);
  }
  return MODULES.filter(module => chosen.has(module)); // always in the same order
}

/**
 * The settings of a person: every field is optional, what is missing keeps the default (or the
 * value already stored).
 */
export function parseSettings(input, base = DEFAULT_SETTINGS) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw badRequest("settings must be an object.", "invalid_body");
  }
  const next = { ...base };
  if (input.bestOf !== undefined) {
    next.bestOf = oneOf(input.bestOf, BEST_OF, "bestOf");
  }
  if (input.gameMode !== undefined) {
    next.gameMode = oneOf(input.gameMode, GAME_MODES, "gameMode");
  }
  if (input.draftMode !== undefined) {
    next.draftMode = oneOf(input.draftMode, DRAFT_CONTROLS, "draftMode");
  }
  if (input.startPage !== undefined) {
    next.startPage = oneOf(input.startPage, START_PAGES, "startPage");
  }
  if (input.theme !== undefined) {
    next.theme = oneOf(input.theme, THEMES, "theme");
  }
  if (input.direction !== undefined) {
    next.direction = oneOf(input.direction, DIRECTIONS, "direction");
  }
  if (input.reduceMotion !== undefined) {
    if (typeof input.reduceMotion !== "boolean") {
      throw badRequest("reduceMotion must be true or false.", "invalid_body");
    }
    next.reduceMotion = input.reduceMotion;
  }
  return next;
}

/** A request may change the parts, the settings, or both. */
export function parsePreferences(body, currentSettings = DEFAULT_SETTINGS) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    (body.modules === undefined && body.settings === undefined)
  ) {
    throw badRequest("modules must be a list.", "invalid_body");
  }
  return {
    modules: body.modules === undefined ? undefined : parseModules(body.modules),
    settings:
      body.settings === undefined ? undefined : parseSettings(body.settings, currentSettings)
  };
}
