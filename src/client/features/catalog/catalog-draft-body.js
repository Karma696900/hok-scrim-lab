// Turning a draft into the body of the request, and an entry into a draft.
import { isChoice } from "../../../shared/stat-values.js";

/** The lines of the draft as the API takes them (a line with nothing in it is dropped). */
export function linesOf(view, draft) {
  return linesFrom(view, draft.stats ?? []);
}

/** Lines of the form as the API takes them: those of the item, or those of one of its passives. */
export function linesFrom(view, rows) {
  return rows.flatMap(row => {
    const stat = view.statOf(row.statId);
    if (!stat) {
      return [];
    }
    const choice = isChoice(stat);
    const given = choice ? row.option : row.value;
    if (given === null || Number.isNaN(given)) {
      return [];
    }
    const line = {
      statId: row.statId,
      ...(choice ? { option: row.option } : { value: row.value })
    };
    if (row.temporary) {
      line.temporary = true;
      if (row.durationSeconds !== null && !Number.isNaN(row.durationSeconds)) {
        line.durationSeconds = row.durationSeconds;
      }
    }
    if (row.note.trim()) {
      line.note = row.note.trim();
    }
    const condition = view.when.toApi(row.when);
    if (condition) {
      line.when = condition;
    }
    return [line];
  });
}

/** The API body of a draft (empty rows are dropped). */
export function bodyOf(view, draft) {
  if (view.getTab() === "stats") {
    return {
      name: draft.name,
      unit: draft.unit,
      sortOrder: draft.sortOrder,
      options:
        draft.unit === "choice"
          ? draft.options
              .filter(option => option.name.trim())
              .map(option => ({ ...(option.id ? { id: option.id } : {}), name: option.name }))
          : []
    };
  }
  if (view.getTab() === "tags") {
    return {
      name: draft.name,
      color: draft.color,
      description: draft.description,
      conflicts: draft.conflicts
    };
  }
  if (view.getTab() === "items") {
    return {
      name: draft.name,
      category: draft.category,
      shopCategory: draft.shopCategory ?? null,
      price: draft.price,
      imageId: draft.imageId,
      description: draft.description,
      effects: draft.effects.map(effect => {
        const condition = view.when.toApi(effect.when);
        return {
          kind: effect.kind,
          name: effect.name,
          text: effect.text,
          cooldownSeconds: effect.kind === "active" ? effect.cooldownSeconds : null,
          ...(condition ? { when: condition } : {}),
          stats: linesFrom(view, effect.stats ?? [])
        };
      }),
      stats: view.linesOf(draft),
      tags: draft.tags
    };
  }
  if (view.getTab() === "spells") {
    return {
      name: draft.name,
      imageId: draft.imageId,
      description: draft.description,
      cooldownSeconds: draft.cooldownSeconds ?? null,
      unlockLevel: draft.unlockLevel ?? null
    };
  }
  return {
    name: draft.name,
    color: draft.color,
    imageId: draft.imageId,
    description: draft.description,
    stats: view.linesOf(draft),
    tags: draft.tags
  };
}

/** An entry of the catalogue as a draft: its lines and effects with their conditions as the form holds them. */
export function draftOfEntry(view, entry) {
  const draft = { ...structuredClone(entry), price: entry.price ?? "" };
  const toDraft = line => ({
    statId: line.statId,
    value: line.value ?? null,
    option: line.option ?? null,
    temporary: Boolean(line.temporary),
    durationSeconds: line.durationSeconds ?? null,
    note: line.note ?? "",
    when: view.when.fromApi(line.when),
    open: false
  });
  if (view.getTab() === "items" || view.getTab() === "arcana") {
    draft.stats = (entry.stats ?? []).map(toDraft);
  }
  if (view.getTab() === "items") {
    draft.effects = (entry.effects ?? []).map(effect => ({
      ...effect,
      when: view.when.fromApi(effect.when),
      open: false,
      stats: (effect.stats ?? []).map(toDraft)
    }));
  }
  return draft;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { linesOf, bodyOf, draftOfEntry };
