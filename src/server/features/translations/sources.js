import { isTranslatable } from "./translation-domain.js";

// Where the texts that the staff writes are kept, and what each one is (the kind helps a provider
// choose the right words, and tells the administrator where a text comes from). Everything the
// visitors read that was not written in the code of the site is here: the catalogue, the numbers of
// the heroes, the recommended builds, the combos and the training situations. What the players write
// (names of teams, messages, their own notes) is theirs and is never translated.

const parse = value => {
  try {
    return typeof value === "string" ? JSON.parse(value) : (value ?? null);
  } catch {
    return null;
  }
};

/** Pure: every text worth translating in these rows, as Map(text → kind), the first kind found winning. */
export function gatherTexts(tables) {
  const found = new Map();
  const add = (text, kind) => {
    if (isTranslatable(text) && !found.has(text)) {
      found.set(text, kind);
    }
  };
  const each = (value, work) => {
    for (const entry of Array.isArray(value) ? value : []) {
      if (entry && typeof entry === "object") {
        work(entry);
      }
    }
  };
  for (const row of tables.stats ?? []) {
    add(row.name, "stat");
    each(parse(row.options_json), option => add(option.name, "option"));
  }
  for (const row of tables.tags ?? []) {
    add(row.name, "tag");
    add(row.description, "tag-note");
  }
  for (const row of tables.items ?? []) {
    add(row.name, "item");
    add(row.description, "item-note");
    each(parse(row.effects_json), effect => {
      add(effect.name, "effect");
      add(effect.text, "effect-text");
    });
    each(parse(row.stats_json), line => add(line.note, "line-note"));
  }
  for (const row of tables.arcana ?? []) {
    add(row.name, "arcana");
    add(row.description, "item-note");
    each(parse(row.stats_json), line => add(line.note, "line-note"));
  }
  for (const row of tables.spells ?? []) {
    add(row.name, "item");
    add(row.description, "item-note");
  }
  for (const row of tables.profiles ?? []) {
    each(parse(row.skills_json), skill => {
      add(skill.costLabel, "cost");
      add(skill.notes, "skill-note");
      each(skill.components, part => {
        add(part.label, "detail");
        add(part.text, "detail");
      });
    });
  }
  for (const row of tables.builds ?? []) {
    add(row.name, "build");
    add(row.note, "build-note");
  }
  for (const row of tables.combos ?? []) {
    add(row.name, "combo");
    add(row.note, "combo-note");
    each(parse(row.steps_json), step => add(step.hint, "hint"));
  }
  for (const row of tables.scenarios ?? []) {
    add(row.title, "situation");
    add(row.brief, "situation-text");
    each(parse(row.pins_json), pin => add(pin.label, "pin"));
  }
  for (const row of tables.maps ?? []) {
    add(row.name, "map");
  }
  return found;
}

/** Every text that the staff has written, as it is in the database now. */
export async function collectTexts(pool) {
  const rows = sql => pool.query(sql).then(([result]) => result);
  const [stats, tags, items, arcana, spells, profiles, builds, combos, scenarios, maps] =
    await Promise.all([
      rows("SELECT name, options_json FROM game_stats"),
      rows("SELECT name, description FROM tags"),
      rows("SELECT name, description, effects_json, stats_json FROM catalog_items"),
      rows("SELECT name, description, stats_json FROM catalog_arcana"),
      rows("SELECT name, description FROM catalog_spells"),
      rows("SELECT skills_json FROM hero_profiles"),
      rows("SELECT name, note FROM hero_build_sets"),
      rows("SELECT name, note, steps_json FROM hero_combos"),
      // a situation that is not published is not shown to visitors, and neither are its words
      rows("SELECT title, brief, pins_json FROM training_scenarios WHERE published = 1"),
      rows("SELECT name FROM training_maps")
    ]);
  return gatherTexts({
    stats,
    tags,
    items,
    arcana,
    spells,
    profiles,
    builds,
    combos,
    scenarios,
    maps
  });
}
