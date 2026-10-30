import { conditionsOf } from "../../../shared/condition-model.js";

// What refers to a stat, to one option of a choice stat, or to a tag: the lines of the items and the
// arcana, the base stats of the heroes, the scaling of their spells and the conditions of lines and
// effects. Pure: the store gives it the catalogue and the profiles, and refuses to delete or change
// what is still used.
//
// `data` is { catalog: { items, arcana }, profiles: [{ heroId, baseStats, skills }] }. Each function
// counts the things that use the reference (an item, an arcana or a hero counts once however many
// times it uses it), which is what the message to the administrator says.

/** Every set of conditions of an item or an arcana: the ones of its lines and of its effects. */
const setsOf = piece => [
  ...(piece.stats ?? []).map(line => line.when),
  ...(piece.effects ?? []).map(effect => effect.when)
];

const conditionsIn = piece => setsOf(piece).flatMap(conditionsOf);

const scaledBy = (skills, statId) =>
  (skills ?? []).some(skill =>
    (skill.components ?? []).some(part =>
      (part.scaling ?? []).some(scale => scale.statId === statId)
    )
  );

/** How many things (items, arcana, heroes) write with this stat, or have a condition on it. */
export function statUsage({ catalog, profiles }, statId) {
  const piece = entry =>
    (entry.stats ?? []).some(line => line.statId === statId) ||
    conditionsIn(entry).some(condition => condition.kind === "stat" && condition.statId === statId);
  return (
    catalog.items.filter(piece).length +
    catalog.arcana.filter(piece).length +
    profiles.filter(
      profile =>
        (profile.baseStats ?? []).some(entry => entry.statId === statId) ||
        scaledBy(profile.skills, statId)
    ).length
  );
}

/** How many things use this option of a choice stat: as a value, or in a condition. */
export function optionUsage({ catalog, profiles }, statId, optionId) {
  const piece = entry =>
    (entry.stats ?? []).some(line => line.statId === statId && line.option === optionId) ||
    conditionsIn(entry).some(
      condition =>
        condition.kind === "stat" &&
        condition.statId === statId &&
        (condition.options ?? []).includes(optionId)
    );
  return (
    catalog.items.filter(piece).length +
    catalog.arcana.filter(piece).length +
    profiles.filter(profile =>
      (profile.baseStats ?? []).some(entry => entry.statId === statId && entry.option === optionId)
    ).length
  );
}

/** How many items and arcana have a condition on this tag (the tag as a label does not count). */
export function tagConditionUsage({ catalog }, tagId) {
  const piece = entry =>
    conditionsIn(entry).some(condition => condition.kind === "tag" && condition.tagId === tagId);
  return catalog.items.filter(piece).length + catalog.arcana.filter(piece).length;
}

/** How many values of a stat (lines of items and arcana, base stats and growths) are not whole numbers. */
export function fractionalUsage({ catalog, profiles }, statId) {
  const lines = [...catalog.items, ...catalog.arcana].flatMap(entry =>
    (entry.stats ?? []).filter(line => line.statId === statId).map(line => [line.value])
  );
  const bases = profiles.flatMap(profile =>
    (profile.baseStats ?? [])
      .filter(entry => entry.statId === statId)
      .map(entry => [entry.value, entry.growth])
  );
  return [...lines, ...bases].filter(values =>
    values.some(value => typeof value === "number" && !Number.isInteger(value))
  ).length;
}
