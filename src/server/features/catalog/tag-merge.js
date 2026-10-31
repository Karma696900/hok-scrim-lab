// What changes when a tag is merged into another one (two tags that say the same thing, "Attack speed"
// and "Attack Speed"): every condition "the hero has the tag" names the one that stays, and so do the
// lists of tags that clash. Pure: the store reads the rows, asks these what they become and writes back
// only those that changed. The labels themselves (items, arcana and heroes that carry the tag) move in
// SQL.

/** The conditions of a value (lines of stats, effects, sets inside sets) with `from` replaced by `to`. */
export function retag(value, from, to) {
  if (Array.isArray(value)) {
    return value.map(entry => retag(entry, from, to));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const copy = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, retag(entry, from, to)])
  );
  if (copy.kind === "tag" && copy.tagId === from) {
    copy.tagId = to;
  }
  return copy;
}

/**
 * The clash list of the tag `owner` once `from` is merged into `to`: `from` becomes `to`, the list of
 * `from` joins the one of `to`, and no tag clashes with itself or twice with the same tag.
 */
export function mergedClashes(owner, list, from, to, fromList = []) {
  const joined = owner === to ? [...list, ...fromList] : list;
  return [...new Set(joined.map(id => (id === from ? to : id)))].filter(id => id !== owner);
}
