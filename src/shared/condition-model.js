// The conditions under which a value or an effect of an item or an arcana applies. They are about the
// hero that wears the build: its class, its lane, its tags, the value of one of its stats (Attack
// range is Melee, Max HP at least 3000), its level, or the hero itself. Pure: the server checks and
// indexes them, the browser counts only what applies to the hero of the build.
//
// A set of conditions is { match: "all" | "any", of: [condition…] }, and a condition is one of
//   { kind: "stat", statId, options: [optionId…] }   a choice stat of the hero is one of these options
//   { kind: "stat", statId, op, value }              a number stat of the hero, at the level of the
//                                                    build, compared with value
//   { kind: "tag", tagId }                           the hero has this tag
//   { kind: "role", role }                           the class of the hero (Camp's word for it)
//   { kind: "lane", lane }                           one of the lanes of the hero
//   { kind: "hero", heroIds: [id…] }                 the hero is one of these
//   { kind: "level", op, value }                     the level of the hero in the build
//   { kind: "group", match, of: [condition…] }       a set inside the set
// Any of them may carry `negate: true` ("is not", "does not have").
//
// What is evaluated has three answers: true, false, and null when it cannot be known (no hero was
// chosen, or the data of the hero does not say). Only true counts. The pages never read null as
// false: they say that it cannot be checked.

import { statAtLevel } from "./stat-values.js";

export const CONDITION_KINDS = ["stat", "tag", "role", "lane", "hero", "level", "group"];
export const COMPARISONS = [">=", "<=", ">", "<", "="];
export const MATCHES = ["all", "any"];
/** How many sets can be inside each other (the set of conditions itself is the first). */
export const MAX_DEPTH = 3;
/** How many conditions (the groups not counted) one set can hold in all. */
export const MAX_CONDITIONS = 12;
/** How many heroes one "the hero is" condition can list. */
export const MAX_HEROES = 20;

export function compare(left, op, right) {
  switch (op) {
    case ">=":
      return left >= right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case "<":
      return left < right;
    case "=":
      return left === right;
    default:
      return null;
  }
}

/**
 * What the conditions know about a hero: `hero` is its line of the roster ({ id, roles, lanes }),
 * `profile` what an administrator entered about it ({ baseStats, tags, updatedAt }) and `level` the
 * level of the build. Null when there is no hero.
 */
export function heroFacts(hero, profile, level) {
  if (!hero) {
    return null;
  }
  const baseStats = profile?.baseStats ?? [];
  const tags = profile?.tags ?? [];
  return {
    id: hero.id,
    roles: hero.roles ?? [],
    lanes: hero.lanes ?? [],
    level,
    // a hero that nobody described has no tag to look at: "has the tag" cannot be answered for it
    described: Boolean(profile && (profile.updatedAt || baseStats.length || tags.length)),
    tags,
    stats: new Map(baseStats.map(entry => [entry.statId, entry]))
  };
}

const opposite = answer => (answer === null ? null : !answer);
const allOf = answers => {
  if (answers.includes(false)) {
    return false;
  }
  return answers.includes(null) ? null : true;
};
const anyOf = answers => {
  if (answers.includes(true)) {
    return true;
  }
  return answers.includes(null) ? null : false;
};

function evaluateAtom(atom, facts) {
  switch (atom.kind) {
    case "stat": {
      const entry = facts.stats.get(atom.statId);
      if (!entry) {
        return null;
      }
      if (Array.isArray(atom.options)) {
        return entry.option === undefined || entry.option === null
          ? null
          : atom.options.includes(entry.option);
      }
      return typeof entry.value === "number"
        ? compare(statAtLevel(entry, facts.level), atom.op, atom.value)
        : null;
    }
    case "tag":
      return facts.described ? facts.tags.includes(atom.tagId) : null;
    case "role":
      return facts.roles.includes(atom.role);
    case "lane":
      return facts.lanes.includes(atom.lane);
    case "hero":
      return atom.heroIds.includes(facts.id);
    case "level":
      return compare(facts.level, atom.op, atom.value);
    default:
      return null;
  }
}

/**
 * Whether a set (or one condition) holds for a hero: true, false, or null (cannot be known). No
 * condition at all holds for everybody, a hero or not.
 */
export function evaluate(condition, facts) {
  if (!condition) {
    return true;
  }
  const isGroup = condition.kind === "group" || Array.isArray(condition.of);
  if (isGroup && !condition.of.length) {
    return true;
  }
  if (!facts) {
    return null;
  }
  const answer = isGroup
    ? (condition.match === "any" ? anyOf : allOf)(condition.of.map(part => evaluate(part, facts)))
    : evaluateAtom(condition, facts);
  return condition.negate ? opposite(answer) : answer;
}

/** Every condition of a set that is not a group, however deep: the ones that refer to something. */
export function conditionsOf(condition) {
  if (!condition) {
    return [];
  }
  if (Array.isArray(condition.of)) {
    return condition.of.flatMap(conditionsOf);
  }
  return [condition];
}

/** How many sets are inside each other (a set with no group in it is 1). */
export function depthOf(condition) {
  if (!condition || !Array.isArray(condition.of)) {
    return 0;
  }
  return 1 + Math.max(0, ...condition.of.map(depthOf));
}

/** The same set written the same way, to tell whether two are the same. */
export const keyOf = condition => JSON.stringify(condition ?? null);
