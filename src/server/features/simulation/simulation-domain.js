// The rules of the end of a game simulation the site keeps for a signed-in player. Nothing is repaired
// silently.
import { badRequest } from "../../platform/errors.js";
import { plainObject } from "../../platform/validation.js";
import { PICK_LANES } from "../series/series-draft.js";

export const GRADES = ["SSS", "SS", "S", "A", "B", "C", "D"];
export const DIFFICULTIES = ["easy", "normal", "hard"];
export const SIDES = ["blue", "red"];
/** Games kept per player and day, and listed back. */
export const GAMES_PER_DAY = 200;
export const HISTORY_SIZE = 20;

const oneOf = (value, list, label) => {
  if (!list.includes(value)) {
    throw badRequest("{label} is not valid.", "invalid_body", { label });
  }
  return value;
};

/** The end of a game, as the page sends it. */
export function parseGame(body, knownHeroIds) {
  const input = plainObject(body);
  const heroId = String(input.heroId ?? "");
  if (!knownHeroIds.has(heroId)) {
    throw badRequest("{label} is not valid.", "invalid_body", { label: "heroId" });
  }
  const score = Number(input.score);
  const duration = Number(input.duration);
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw badRequest("{label} is not valid.", "invalid_body", { label: "score" });
  }
  if (!Number.isInteger(duration) || duration < 0 || duration > 4 * 3600) {
    throw badRequest("{label} is not valid.", "invalid_body", { label: "duration" });
  }
  if (input.won !== null && typeof input.won !== "boolean") {
    throw badRequest("{label} is not valid.", "invalid_body", { label: "won" });
  }
  return {
    heroId,
    side: oneOf(input.side, SIDES, "side"),
    lane: oneOf(input.lane, PICK_LANES, "lane"),
    difficulty: oneOf(input.difficulty, DIFFICULTIES, "difficulty"),
    grade: oneOf(input.grade, GRADES, "grade"),
    score,
    paused: input.paused === true,
    won: input.won,
    duration
  };
}

/** Shortest and longest game a ticket may ask for, in seconds (the page's `?limit=` test hook). */
const LIMITS = { min: 60, max: 3600 };

/** The heroes chosen by hand, `{ "blue:Jungle": heroId }` as the page keeps them, as `[{ side, lane, heroId }]`. */
function parseFixed(value, knownHeroIds) {
  if (value === undefined || value === null) {
    return [];
  }
  const entries = Object.entries(plainObject(value, "fixed")).filter(([, heroId]) => heroId);
  if (entries.length > 10) {
    throw badRequest("{label} is not valid.", "invalid_body", { label: "fixed" });
  }
  const seen = new Set();
  return entries.map(([slot, heroId]) => {
    const [side, lane] = slot.split(":");
    const id = String(heroId);
    if (
      !SIDES.includes(side) ||
      !PICK_LANES.includes(lane) ||
      !knownHeroIds.has(id) ||
      seen.has(id)
    ) {
      throw badRequest("{label} is not valid.", "invalid_body", { label: "fixed" });
    }
    seen.add(id);
    return { side, lane, heroId: id };
  });
}

/**
 * What the player chose before a live game: side, lane, difficulty, and the heroes chosen by hand. With
 * `mode: "watch"` (ten bots, nobody plays) only the heroes chosen by hand are kept.
 */
export function parseChoice(body, knownHeroIds) {
  const input = plainObject(body);
  const watch = oneOf(input.mode ?? "play", ["play", "watch"], "mode") === "watch";
  const choice = watch
    ? { mode: "watch", fixed: parseFixed(input.fixed, knownHeroIds) }
    : {
        side: oneOf(input.side, SIDES, "side"),
        lane: oneOf(input.lane, PICK_LANES, "lane"),
        difficulty: oneOf(input.difficulty, DIFFICULTIES, "difficulty"),
        fixed: parseFixed(input.fixed, knownHeroIds)
      };
  const limit = input.limit === undefined ? null : Number(input.limit);
  if (limit !== null && (!Number.isInteger(limit) || limit < LIMITS.min || limit > LIMITS.max)) {
    throw badRequest("{label} is not valid.", "invalid_body", { label: "limit" });
  }
  return { choice, limit };
}
