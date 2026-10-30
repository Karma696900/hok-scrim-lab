// Reading what an administrator writes for a spell, a hero profile (skills, base stats) and a recommended build.
import { ARCANA_COLORS, RECOMMENDED_CORE, checkBuild } from "../../../shared/build-model.js";
import { badRequest } from "../../platform/errors.js";
import { ids, number, numbers, object, text, whole } from "./fields.js";
import { isChoice } from "../../../shared/stat-values.js";
import { valueFor } from "./catalog-domain-stats.js";

const COMPONENT_KINDS = [
  "damage",
  "heal",
  "shield",
  "control",
  "buff",
  "debuff",
  "movement",
  "other"
];

const SKILL_KEY = /^[a-z0-9-]{1,20}$/;

const SPELL_COOLDOWN_MAX = 3600;

/**
 * A spell of the match (Flash, Heal...): its picture, what it does, how many seconds before it can be
 * used again and the level from which it can be taken. The two numbers are left empty until somebody
 * who knows them writes them: nothing is guessed.
 */
export function parseSpell(input, known) {
  const body = object(input, "The spell");
  const imageId = body.imageId ?? null;
  if (imageId !== null && !known.imageIds.has(imageId)) {
    throw badRequest("The picture does not exist (send it again).", "unknown_reference");
  }
  const optional = (value, label, max) =>
    value === undefined || value === null || value === ""
      ? null
      : whole(value, label, { min: 0, max });
  return {
    name: text(body.name, "name", { max: 80, required: true }),
    imageId,
    description: text(body.description, "description", { max: 600 }),
    cooldownSeconds: optional(body.cooldownSeconds, "cooldownSeconds", SPELL_COOLDOWN_MAX),
    unlockLevel: optional(body.unlockLevel, "unlockLevel", 15)
  };
}

function skill(raw, index, statIds) {
  const row = object(raw, `skills[${index}]`);
  if (typeof row.key !== "string" || !SKILL_KEY.test(row.key)) {
    throw badRequest("{label} must be a short lowercase key.", "invalid_body", {
      label: `skills[${index}].key`
    });
  }
  const components = row.components ?? [];
  if (!Array.isArray(components) || components.length > 12) {
    throw badRequest("{label} must be a list of at most {max} items.", "invalid_body", {
      label: `skills[${index}].components`,
      max: 12
    });
  }
  return {
    key: row.key,
    name: text(row.name, `skills[${index}].name`, { max: 80 }),
    cooldown: numbers(row.cooldown, `skills[${index}].cooldown`, 15),
    cost: numbers(row.cost, `skills[${index}].cost`, 15),
    costLabel: text(row.costLabel, `skills[${index}].costLabel`, { max: 30 }),
    range:
      row.range === undefined || row.range === null || row.range === ""
        ? null
        : number(row.range, `skills[${index}].range`, { min: 0, max: 100_000 }),
    castTime:
      row.castTime === undefined || row.castTime === null || row.castTime === ""
        ? null
        : number(row.castTime, `skills[${index}].castTime`, { min: 0, max: 100 }),
    components: components.map((entry, at) => {
      const part = object(entry, `skills[${index}].components[${at}]`);
      const kind = part.kind ?? "other";
      if (!COMPONENT_KINDS.includes(kind)) {
        throw badRequest("{label} must be one of: {options}.", "invalid_body", {
          label: `skills[${index}].components[${at}].kind`,
          options: COMPONENT_KINDS.join(", ")
        });
      }
      const scaling = part.scaling ?? [];
      if (!Array.isArray(scaling) || scaling.length > 4) {
        throw badRequest("{label} must be a list of at most {max} items.", "invalid_body", {
          label: "scaling",
          max: 4
        });
      }
      return {
        label: text(part.label, `skills[${index}].components[${at}].label`, {
          max: 60,
          required: true
        }),
        kind,
        unit: part.unit === "percent" ? "percent" : "flat",
        values: numbers(part.values, `skills[${index}].components[${at}].values`, 15),
        scaling: scaling.map((entry2, n) => {
          const s = object(entry2, "scaling");
          const statId = whole(s.statId, `scaling[${n}].statId`, { min: 1, max: 2_000_000_000 });
          if (!statIds.has(statId)) {
            throw badRequest("{label} contains a stat that does not exist.", "unknown_reference", {
              label: "scaling"
            });
          }
          return {
            statId,
            percent: number(s.percent, `scaling[${n}].percent`, { min: 0, max: 10_000 })
          };
        }),
        text: text(part.text, `skills[${index}].components[${at}].text`, { max: 300 })
      };
    }),
    notes: text(row.notes, `skills[${index}].notes`, { max: 800 })
  };
}

/**
 * The real base stats of a hero (value at level 1 and growth per level), the numbers of each spell,
 * and the hero's tags.
 */
export function parseHeroProfile(input, known) {
  const statIds = new Set(known.stats.keys());
  const body = object(input, "The hero profile");
  const base = body.baseStats ?? [];
  if (!Array.isArray(base) || base.length > 40) {
    throw badRequest("{label} must be a list of at most {max} items.", "invalid_body", {
      label: "baseStats",
      max: 40
    });
  }
  const seen = new Set();
  const baseStats = base.map((entry, index) => {
    const at = `baseStats[${index}]`;
    const row = object(entry, at);
    const statId = whole(row.statId, `${at}.statId`, { min: 1, max: 2_000_000_000 });
    const stat = known.stats.get(statId);
    if (!stat) {
      throw badRequest("{label} contains a stat that does not exist.", "unknown_reference", {
        label: "baseStats"
      });
    }
    if (seen.has(statId)) {
      throw badRequest("{label} lists the same stat twice.", "invalid_body", {
        label: "baseStats"
      });
    }
    seen.add(statId);
    const line = { statId, ...valueFor(row, at, stat) };
    if (isChoice(stat)) {
      return line; // a choice does not grow
    }
    const growth =
      row.growth === undefined || row.growth === null || row.growth === ""
        ? 0
        : number(row.growth, `${at}.growth`);
    if (stat.unit === "whole" && !Number.isInteger(growth)) {
      throw badRequest("{label} must be a whole number.", "invalid_body", {
        label: `${at}.growth`
      });
    }
    return { ...line, growth };
  });
  const rawSkills = body.skills ?? [];
  if (!Array.isArray(rawSkills) || rawSkills.length > 12) {
    throw badRequest("{label} must be a list of at most {max} items.", "invalid_body", {
      label: "skills",
      max: 12
    });
  }
  const skills = rawSkills.map((entry, index) => skill(entry, index, statIds));
  if (new Set(skills.map(entry => entry.key)).size !== skills.length) {
    throw badRequest("{label} lists the same spell twice.", "invalid_body", { label: "skills" });
  }
  return { baseStats, skills, tags: ids(body.tags, "tags", known.tagIds) };
}

/**
 * A recommended build of a hero: the build itself (checked against the catalogue with the same
 * rules as the build lab), a name, a note and a source.
 */
export function parseBuildSet(input, variant, catalog) {
  if (variant !== 1 && variant !== 2) {
    throw badRequest("{label} must be 1 or 2.", "invalid_body", { label: "variant" });
  }
  const body = object(input, "The build");
  const { build, problems } = checkBuild(body.build, catalog);
  if (problems.length) {
    throw badRequest(problems[0].template, "invalid_build", problems[0].params);
  }
  if (build.core.length < RECOMMENDED_CORE.min || build.core.length > RECOMMENDED_CORE.max) {
    throw badRequest("A recommended build marks 2 or 3 core items.", "invalid_build");
  }
  if (
    !build.items.length &&
    !build.utility.length &&
    !build.late.length &&
    !ARCANA_COLORS.some(color => build.arcana[color].length)
  ) {
    throw badRequest("A build needs at least one item or arcana.", "invalid_body");
  }
  let sourceUrl = "";
  if (body.sourceUrl !== undefined && body.sourceUrl !== null && body.sourceUrl !== "") {
    try {
      const url = new URL(String(body.sourceUrl));
      if (url.protocol !== "https:") {
        throw new Error("scheme");
      }
      sourceUrl = url.toString().slice(0, 500);
    } catch {
      throw badRequest("{label} must be an https URL.", "invalid_body", { label: "sourceUrl" });
    }
  }
  return {
    variant,
    name: text(body.name, "name", { max: 60 }),
    build,
    note: text(body.note, "note", { max: 300 }),
    sourceUrl
  };
}
