// Reading the form of an entry into a draft, and saying what is missing from it.

export const numberOrNull = value =>
  value === "" || value === null || value === undefined ? null : Number(value);

/** The lines of the form whose names start with `prefix` (stat for the item, effect-0-stat for a passive). */
function readLines(view, data, form, prefix) {
  const lines = [];
  for (let index = 0; data.has(`${prefix}-${index}-id`); index += 1) {
    const key = `${prefix}-${index}`;
    lines.push({
      statId: Number(data.get(`${key}-id`)),
      value: numberOrNull(data.get(`${key}-value`)),
      option: data.has(`${key}-option`) ? Number(data.get(`${key}-option`)) : null,
      temporary: data.get(`${key}-temporary`) === "1",
      durationSeconds: numberOrNull(data.get(`${key}-duration`)),
      note: String(data.get(`${key}-note`) ?? ""),
      when: view.when.read(data, key),
      open: form.querySelector(`[data-extra="${key}"]`)?.open ?? false
    });
  }
  return lines;
}

/**
 * The form as a body for the API, and as the draft to redraw (what was typed is never lost when a
 * row is added).
 */
export function readDraft(view) {
  const form = view.getRoot().querySelector("#catalog-form");
  if (!form) {
    return view.getEditing().draft;
  }
  const data = new FormData(form);
  const draft = { ...view.getEditing().draft, name: String(data.get("name") ?? "") };
  if (view.getTab() === "stats") {
    Object.assign(draft, {
      unit: String(data.get("unit")),
      sortOrder: Number(data.get("sortOrder")) || 0
    });
    const options = [];
    for (let index = 0; data.has(`option-${index}-name`); index += 1) {
      options.push({
        id: numberOrNull(data.get(`option-${index}-id`)),
        name: String(data.get(`option-${index}-name`) ?? "")
      });
    }
    // a stat that has just become a choice starts with two empty options to write
    draft.options =
      draft.unit === "choice" && !options.length
        ? [
            { id: null, name: "" },
            { id: null, name: "" }
          ]
        : options;
  } else if (view.getTab() === "spells") {
    Object.assign(draft, {
      description: String(data.get("description") ?? ""),
      cooldownSeconds: numberOrNull(data.get("cooldownSeconds")),
      unlockLevel: numberOrNull(data.get("unlockLevel"))
    });
  } else if (view.getTab() === "tags") {
    Object.assign(draft, {
      color: String(data.get("color")),
      description: String(data.get("description") ?? ""),
      // the form has no list of conflicts: what the tag had is kept as it was
      conflicts: data.has("conflicts") ? data.getAll("conflicts").map(Number) : draft.conflicts
    });
  } else {
    Object.assign(draft, {
      description: String(data.get("description") ?? ""),
      tags: data.getAll("tags").map(Number)
    });
    draft.stats = readLines(view, data, form, "stat");
    if (view.getTab() === "items") {
      draft.category = String(data.get("category"));
      draft.shopCategory = String(data.get("shopCategory") ?? "") || null;
      draft.price = numberOrNull(data.get("price"));
      draft.tier = String(data.get("tier") ?? "") || null;
      draft.components = [...data.keys()]
        .filter(key => key.startsWith("component-"))
        .map(key => Number(data.get(key)))
        .filter(id => id > 0);
      draft.effects = [];
      for (let index = 0; data.has(`effect-${index}-kind`); index += 1) {
        draft.effects.push({
          kind: String(data.get(`effect-${index}-kind`)),
          name: String(data.get(`effect-${index}-name`) ?? ""),
          text: String(data.get(`effect-${index}-text`) ?? ""),
          cooldownSeconds: numberOrNull(data.get(`effect-${index}-cooldown`)),
          when: view.when.read(data, `effect-${index}`),
          open: form.querySelector(`[data-effect-extra="${index}"]`)?.open ?? false,
          stats: readLines(view, data, form, `effect-${index}-stat`)
        });
      }
    } else {
      draft.color = String(data.get("color"));
    }
  }
  view.getEditing().draft = draft;
  return draft;
}

/** Whether a condition of the draft was left half written. */
export const unfinished = (view, draft) =>
  [
    ...(draft.stats ?? []),
    ...(draft.effects ?? []),
    ...(draft.effects ?? []).flatMap(effect => effect.stats ?? [])
  ].some(entry => !view.when.isComplete(entry.when));

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { readDraft, unfinished };
