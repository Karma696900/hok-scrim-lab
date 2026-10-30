// The stats of a build: hero at its level, items, arcana, and how a stat is written.
import { evaluate, heroFacts } from "./condition-model.js";
import { isChoice, optionOf, statAtLevel } from "./stat-values.js";
import { ARCANA_COLORS } from "./build-model-shared.js";
import { indexCatalog } from "./build-order.js";

/**
 * The stats of a hero wearing a build at a level, and what was left out.
 *
 * `hero` is the line of the roster of the hero ({ id, roles, lanes }), or null when the build has
 * none. What a piece gives counts only when its conditions hold for the hero: a value that does not
 * apply is in `notes.skipped`, one that cannot be checked (no hero, or the data of the hero does not
 * say) in `notes.unknown`; neither is added. A temporary value is in `notes.temporary` and in the
 * `temporary` of its row, never in the total. Only numbers the administrator entered are added;
 * passives and actives are texts and are not computed.
 *
 * One row per stat that appears anywhere:
 *   { statId, base, items, arcana, total, temporary }               a number stat
 *   { statId, choice: true, baseOption, option, temporaryOptions }  a choice stat (an option id, or null)
 * and each note is { kind: "item" | "arcana", id, count, entry }.
 */
export function computeStats(profile, build, level, catalog, hero = null) {
  const index = indexCatalog(catalog);
  const facts = heroFacts(hero, profile, level);
  const rows = new Map();
  const notes = { temporary: [], skipped: [], unknown: [] };
  const row = statId => {
    if (!rows.has(statId)) {
      const choice = isChoice(index.stats.get(statId));
      rows.set(
        statId,
        choice
          ? { statId, choice, baseOption: null, option: null, temporaryOptions: [] }
          : { statId, choice, base: 0, items: 0, arcana: 0, total: 0, temporary: 0 }
      );
    }
    return rows.get(statId);
  };

  for (const entry of profile?.baseStats ?? []) {
    const line = row(entry.statId);
    if (line.choice) {
      line.baseOption = entry.option ?? null;
    } else if (typeof entry.value === "number") {
      line.base += statAtLevel(entry, level);
    }
  }

  const pieces = [
    ...[...build.items, ...build.utility, ...build.late].map(id => ({
      kind: "item",
      id,
      count: 1,
      stats: index.items.get(id)?.stats ?? []
    })),
    ...ARCANA_COLORS.flatMap(color =>
      build.arcana[color].map(({ id, count }) => ({
        kind: "arcana",
        id,
        count,
        stats: index.arcana.get(id)?.stats ?? []
      }))
    )
  ];
  for (const piece of pieces) {
    for (const entry of piece.stats) {
      const note = { kind: piece.kind, id: piece.id, count: piece.count, entry };
      const holds = evaluate(entry.when, facts);
      if (holds === false) {
        notes.skipped.push(note);
        continue;
      }
      if (holds === null) {
        notes.unknown.push(note);
        continue;
      }
      const line = row(entry.statId);
      if (entry.temporary) {
        notes.temporary.push(note);
      }
      if (line.choice) {
        if (entry.temporary) {
          line.temporaryOptions.push(entry.option);
        } else {
          line.option = entry.option;
        }
      } else if (typeof entry.value === "number") {
        line[entry.temporary ? "temporary" : piece.kind === "item" ? "items" : "arcana"] +=
          entry.value * piece.count;
      }
    }
  }

  const ordered = [...rows.values()]
    .filter(entry => index.stats.has(entry.statId))
    .sort(
      (a, b) =>
        index.stats.get(a.statId).sortOrder - index.stats.get(b.statId).sortOrder ||
        a.statId - b.statId
    );
  const result = ordered.map(entry => {
    if (entry.choice) {
      // what a piece sets wins over what the hero has
      return { ...entry, fromPieces: entry.option, option: entry.option ?? entry.baseOption };
    }
    return {
      ...entry,
      base: round(entry.base),
      items: round(entry.items),
      arcana: round(entry.arcana),
      total: round(entry.base + entry.items + entry.arcana),
      temporary: round(entry.temporary)
    };
  });
  return { rows: result, notes };
}

/** The rows of `computeStats`: the stats of a hero wearing a build at a level. */
export const totalStats = (profile, build, level, catalog, hero = null) =>
  computeStats(profile, build, level, catalog, hero).rows;

/** What a stat value looks like: +400, +15%. */
const formatStat = (stat, value) =>
  `${value > 0 ? "+" : ""}${Number(value.toFixed(2))}${stat?.unit === "percent" ? "%" : ""}`;

/**
 * What a value of an item, an arcana or a hero looks like for its stat: +400, +15%, Melee. `name`
 * gives the words of an option (the page passes the translation of the staff's text).
 */
export const formatEntry = (stat, entry, name = text => text) =>
  isChoice(stat) ? name(optionOf(stat, entry.option)?.name ?? "") : formatStat(stat, entry.value);

const round = value => Math.round(value * 100) / 100;
