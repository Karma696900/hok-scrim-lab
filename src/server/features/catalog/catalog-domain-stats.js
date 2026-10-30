// Reading what an administrator writes for a stat (its unit and options), a value, a line of stats, a tag.
import { OPTIONS_MAX, STAT_UNITS, isChoice } from "../../../shared/stat-values.js";
import { badRequest } from "../../platform/errors.js";
import { flag, ids, number, object, text, whole } from "./fields.js";
import { keyOf } from "../../../shared/condition-model.js";
import { parseWhen } from "./conditions.js";

const NOTE_MAX = 200;

const TEMPORARY_MAX_SECONDS = 3600;

export const TAG_COLORS = [
  "gray",
  "red",
  "orange",
  "gold",
  "green",
  "cyan",
  "blue",
  "violet",
  "pink"
];

/**
 * The value of a line for its stat: a number (a whole one when the stat is a whole number), or the id
 * of one of the options of a choice stat. Returns { value } or { option }.
 */
export function valueFor(row, label, stat) {
  if (isChoice(stat)) {
    const option = whole(row.option, `${label}.option`, { min: 1, max: 100_000 });
    if (!stat.options.some(entry => entry.id === option)) {
      throw badRequest("{label} refers to something that does not exist.", "unknown_reference", {
        label: `${label}.option`
      });
    }
    return { option };
  }
  const value = number(row.value, `${label}.value`);
  if (stat.unit === "whole" && !Number.isInteger(value)) {
    throw badRequest("{label} must be a whole number.", "invalid_body", {
      label: `${label}.value`
    });
  }
  return { value };
}

/**
 * The lines of an item or of an arcana: each is a stat with its value (or option), that can be
 * temporary (with how long it lasts and a note on when) and can depend on conditions about the hero.
 * The same stat can have several lines (one for melee heroes, one for ranged ones; a permanent one and
 * a temporary one), but not two that are the same in everything but the number.
 */
export function statLines(value, label, known, { min, max }) {
  if (!Array.isArray(value)) {
    throw badRequest("{label} must be a list of at most {max} items.", "invalid_body", {
      label,
      max
    });
  }
  if (value.length < min || value.length > max) {
    throw badRequest("{label} needs between {min} and {max} stats.", "invalid_body", {
      label,
      min,
      max
    });
  }
  const seen = new Set();
  return value.map((entry, index) => {
    const at = `${label}[${index}]`;
    const row = object(entry, at);
    const statId = whole(row.statId, `${at}.statId`, { min: 1, max: 2_000_000_000 });
    const stat = known.stats.get(statId);
    if (!stat) {
      throw badRequest("{label} contains a stat that does not exist.", "unknown_reference", {
        label
      });
    }
    const line = { statId, ...valueFor(row, at, stat) };
    const temporary = flag(row.temporary, `${at}.temporary`);
    const given =
      row.durationSeconds !== undefined &&
      row.durationSeconds !== null &&
      row.durationSeconds !== "";
    if (temporary) {
      line.temporary = true;
      if (given) {
        line.durationSeconds = number(row.durationSeconds, `${at}.durationSeconds`, {
          min: 0.1,
          max: TEMPORARY_MAX_SECONDS
        });
      }
    } else if (given) {
      throw badRequest("Only a temporary value has a duration.", "invalid_body");
    }
    const note = text(row.note, `${at}.note`, { max: NOTE_MAX });
    if (note) {
      line.note = note;
    }
    const when = parseWhen(row.when, `${at}.when`, known);
    if (when) {
      line.when = when;
    }
    const key = `${statId}|${Boolean(line.temporary)}|${keyOf(line.when)}`;
    if (seen.has(key)) {
      throw badRequest(
        "{label} lists the same stat twice with the same conditions.",
        "invalid_body",
        {
          label
        }
      );
    }
    seen.add(key);
    return line;
  });
}

/**
 * The options of a choice stat: [{ id, name }]. An option sent with its id keeps it (what refers to
 * it keeps meaning the same when it is renamed); a new one gets an id above every id the stat has
 * had (`previous` are the options it had until now), so an id taken away is not given again to
 * something else while anything could still refer to it.
 */
function statOptions(value, unit, previous = []) {
  if (unit !== "choice") {
    return [];
  }
  if (!Array.isArray(value) || value.length < 2 || value.length > OPTIONS_MAX) {
    throw badRequest("A choice needs between {min} and {max} options.", "invalid_body", {
      min: 2,
      max: OPTIONS_MAX
    });
  }
  let next =
    Math.max(
      0,
      ...previous.map(option => option.id),
      ...value.map(entry => entry?.id).filter(Number.isInteger)
    ) + 1;
  const names = new Set();
  const taken = new Set();
  return value.map((entry, index) => {
    const row = object(entry, `options[${index}]`);
    const name = text(row.name, `options[${index}].name`, { max: 40, required: true });
    if (names.has(name.toLocaleLowerCase())) {
      throw badRequest("{label} lists the same option twice.", "invalid_body", {
        label: "options"
      });
    }
    names.add(name.toLocaleLowerCase());
    let id = row.id;
    if (id === undefined || id === null || id === "") {
      id = next;
      next += 1;
    } else {
      id = whole(id, `options[${index}].id`, { min: 1, max: 100_000 });
    }
    if (taken.has(id)) {
      throw badRequest("{label} lists the same option twice.", "invalid_body", {
        label: "options"
      });
    }
    taken.add(id);
    return { id, name };
  });
}

export function parseStat(input, previousOptions = []) {
  const body = object(input, "The stat");
  const unit = body.unit ?? "flat";
  if (!STAT_UNITS.includes(unit)) {
    throw badRequest("{label} must be one of: {options}.", "invalid_body", {
      label: "unit",
      options: STAT_UNITS.join(", ")
    });
  }
  return {
    name: text(body.name, "name", { max: 60, required: true }),
    unit,
    sortOrder:
      body.sortOrder === undefined
        ? 0
        : whole(body.sortOrder, "sortOrder", { min: 0, max: 100_000 }),
    options: statOptions(body.options, unit, previousOptions)
  };
}

/** `tagIds` are the tags that exist; the tag being edited (if any) cannot clash with itself. */
export function parseTag(input, tagIds, selfId = null) {
  const body = object(input, "The tag");
  const color = body.color ?? "gray";
  if (!TAG_COLORS.includes(color)) {
    throw badRequest("{label} must be one of: {options}.", "invalid_body", {
      label: "color",
      options: TAG_COLORS.join(", ")
    });
  }
  const conflicts = ids(body.conflicts, "conflicts", tagIds, 30);
  if (selfId !== null && conflicts.includes(selfId)) {
    throw badRequest("A tag cannot clash with itself.", "invalid_body");
  }
  return {
    name: text(body.name, "name", { max: 40, required: true }),
    color,
    description: text(body.description, "description", { max: 200 }),
    conflicts
  };
}
