import { badRequest } from "../../platform/errors.js";
import {
  COMPARISONS,
  CONDITION_KINDS,
  MATCHES,
  MAX_CONDITIONS,
  MAX_DEPTH,
  MAX_HEROES
} from "../../../shared/condition-model.js";
import { MAX_LEVEL, OPTIONS_MAX, isChoice } from "../../../shared/stat-values.js";
import { LANES } from "../heroes/hero-domain.js";
import { flag, number, object, whole } from "./fields.js";

// The conditions under which a value or an effect of an item or an arcana applies (see
// shared/condition-model.js for what they are). Read strictly: every reference must exist, the shape is
// rewritten the same way each time, and what is empty is no condition at all.

const oneOf = (value, options, label) => {
  if (!options.includes(value)) {
    throw badRequest("{label} must be one of: {options}.", "invalid_body", {
      label,
      options: options.join(", ")
    });
  }
  return value;
};

const unknownReference = label =>
  badRequest("{label} refers to something that does not exist.", "unknown_reference", { label });

/** A condition that is not a group. */
function atom(row, label, known) {
  switch (row.kind) {
    case "stat": {
      const stat = known.stats.get(whole(row.statId, `${label}.statId`, { min: 1, max: 2e9 }));
      if (!stat) {
        throw unknownReference(`${label}.statId`);
      }
      if (isChoice(stat)) {
        const options = row.options;
        if (!Array.isArray(options) || !options.length || options.length > OPTIONS_MAX) {
          throw badRequest("{label} must list the options of the stat.", "invalid_body", {
            label: `${label}.options`
          });
        }
        const list = options.map(entry =>
          whole(entry, `${label}.options`, { min: 1, max: 100_000 })
        );
        if (new Set(list).size !== list.length) {
          throw badRequest("{label} lists the same option twice.", "invalid_body", {
            label: `${label}.options`
          });
        }
        if (!list.every(id => stat.options.some(option => option.id === id))) {
          throw unknownReference(`${label}.options`);
        }
        return { kind: "stat", statId: stat.id, options: list };
      }
      return {
        kind: "stat",
        statId: stat.id,
        op: oneOf(row.op, COMPARISONS, `${label}.op`),
        value: number(row.value, `${label}.value`)
      };
    }
    case "tag": {
      const tagId = whole(row.tagId, `${label}.tagId`, { min: 1, max: 2e9 });
      if (!known.tagIds.has(tagId)) {
        throw unknownReference(`${label}.tagId`);
      }
      return { kind: "tag", tagId };
    }
    case "role": {
      if (typeof row.role !== "string" || !known.roles.has(row.role)) {
        throw unknownReference(`${label}.role`);
      }
      return { kind: "role", role: row.role };
    }
    case "lane":
      return { kind: "lane", lane: oneOf(row.lane, LANES, `${label}.lane`) };
    case "hero": {
      const heroIds = row.heroIds;
      if (!Array.isArray(heroIds) || !heroIds.length || heroIds.length > MAX_HEROES) {
        throw badRequest("{label} must list between 1 and {max} heroes.", "invalid_body", {
          label: `${label}.heroIds`,
          max: MAX_HEROES
        });
      }
      if (new Set(heroIds).size !== heroIds.length) {
        throw badRequest("{label} lists the same hero twice.", "invalid_body", {
          label: `${label}.heroIds`
        });
      }
      if (!heroIds.every(id => typeof id === "string" && known.heroIds.has(id))) {
        throw unknownReference(`${label}.heroIds`);
      }
      return { kind: "hero", heroIds: [...heroIds] };
    }
    default:
      return {
        kind: "level",
        op: oneOf(row.op, COMPARISONS, `${label}.op`),
        value: whole(row.value, `${label}.value`, { min: 1, max: MAX_LEVEL })
      };
  }
}

/** One condition: a test about the hero, or a set of conditions inside the set. */
function condition(raw, label, known, depth, count) {
  const row = object(raw, label);
  oneOf(row.kind, CONDITION_KINDS, `${label}.kind`);
  const negate = flag(row.negate, `${label}.negate`);
  let parsed;
  if (row.kind === "group") {
    if (depth >= MAX_DEPTH) {
      throw badRequest(
        "Conditions can be inside each other {max} levels deep at most.",
        "invalid_body",
        {
          max: MAX_DEPTH
        }
      );
    }
    const set = conditionSet(row, label, known, depth + 1, count);
    if (!set.of.length) {
      throw badRequest("A group of conditions cannot be empty.", "invalid_body");
    }
    parsed = { kind: "group", ...set };
  } else {
    count.conditions += 1;
    if (count.conditions > MAX_CONDITIONS) {
      throw badRequest("There are at most {max} conditions in all.", "invalid_body", {
        max: MAX_CONDITIONS
      });
    }
    parsed = atom(row, label, known);
  }
  return negate ? { ...parsed, negate: true } : parsed;
}

function conditionSet(raw, label, known, depth, count) {
  const match = raw.match === undefined || raw.match === null ? "all" : raw.match;
  oneOf(match, MATCHES, `${label}.match`);
  const list = raw.of === undefined || raw.of === null ? [] : raw.of;
  if (!Array.isArray(list) || list.length > MAX_CONDITIONS) {
    throw badRequest("A set of conditions holds at most {max} conditions.", "invalid_body", {
      max: MAX_CONDITIONS
    });
  }
  return {
    match,
    of: list.map((entry, index) => condition(entry, `${label}.of[${index}]`, known, depth, count))
  };
}

/**
 * The conditions of a value or of an effect: { match, of } with every reference checked against
 * `known` ({ stats: Map(id → stat), tagIds, heroIds, roles }), or null when there is none (a missing
 * or an empty set is no condition).
 */
export function parseWhen(input, label, known) {
  if (input === undefined || input === null) {
    return null;
  }
  const root = object(input, label);
  if (root.kind !== undefined && root.kind !== "group") {
    throw badRequest("{label} must be a set of conditions.", "invalid_body", { label });
  }
  const set = conditionSet(root, label, known, 1, { conditions: 0 });
  return set.of.length ? set : null;
}
