// The tiers of a tier list and of the official ratings: the same six names, best first. The page
// draws a tier in the colour of its name, so a list and a rating that both have an "S" draw it alike.

export const TIERS = Object.freeze(["SS", "S", "A", "B", "C", "D"]);

// no toUpperCase(): it turns a "ß" into "SS"
const KNOWN = /^(?:ss|[sabcd])$/i;

/** The name of a tier as its colour knows it ("ss " gives "SS"), or "" when it is none of the six. */
export function tierKey(label) {
  const name = typeof label === "string" ? label.trim() : "";
  return KNOWN.test(name) ? name.toUpperCase() : "";
}
