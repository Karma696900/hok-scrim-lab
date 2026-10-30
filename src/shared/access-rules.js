// Who may do what, where the browser and the server must agree.

/**
 * The label that makes a person an editor besides the administrators: they write what the site itself
 * shows (the recommended builds and the official ratings of the heroes). An administrator gives it by
 * hand, from the player page: nothing is computed or inferred.
 */
export const EDITOR_LABEL = "contributor";

// What the browser and the server both know about the API keys of a person.

/** Every key starts with this (so that a secret scanner can spot a leaked one), then 43 random characters. */
export const API_KEY_PREFIX = "hok_";
export const API_KEY_PATTERN = /^hok_[A-Za-z0-9_-]{43}$/;
/** How much of a key is kept in the clear to recognise it in a list: "hok_" and 6 characters. */
export const API_KEY_HINT_LENGTH = 10;

/**
 * What a key can read, one scope per family of resources. Every scope is read-only: a key never
 * writes, whatever its scopes.
 *   game         heroes, items, arcana, spells, stats of the game, recommended builds, combos, official tiers
 *   competitive  the tournaments, their games, and the popularity of drafts and heroes computed from them
 *   scrims       your series (and the ones your teams shared with you), and the statistics of your scrims
 *   tier-lists   your tier lists
 *   teams        your teams, their agenda
 *   training     your training notebook, your personal space
 *   account      who the key belongs to
 */
export const API_SCOPES = [
  "game",
  "competitive",
  "scrims",
  "tier-lists",
  "teams",
  "training",
  "account"
];

/** Active keys one person can hold at once. */
export const API_KEYS_MAX = 10;
export const API_KEY_NAME_MAX = 60;
/** How long a new key lives, in days; 0 = it never expires (a choice to make on purpose). */
export const API_KEY_LIFETIMES = [30, 90, 365, 0];
export const API_KEY_DEFAULT_LIFETIME = 90;
