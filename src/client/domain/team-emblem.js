import { escapeHtml } from "../lib/dom.js";

// The mark of a team: its uploaded logo, or a small mark and a hue taken from its name (the same
// name always gives the same mark, so a team is recognised everywhere).

const SHAPES = [
  "M4 18l5-12 3 6 3-6 5 12-5-3-3 4-3-4z",
  "M13 2L5 13h6l-1 9 8-12h-6z",
  "M12 4l8 15H4zM12 10l3.5 6h-7z",
  "M12 2l2 6 6-2-3 6 6 2-6 2 3 6-6-2-2 6-2-6-6 2 3-6-6-2 6-2-3-6 6 2z",
  "M12 3l9 16H3zM12 9l4 7H8z",
  "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM12 8l4 2v3c0 2.5-1.8 4.3-4 5-2.2-.7-4-2.5-4-5v-3z",
  "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  "M12 3l8 9-8 9-8-9z"
];
const HUES = 12;

function hashOf(text) {
  let hash = 0;
  for (const character of String(text ?? "")) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }
  return hash;
}

/** The hue (0 to 11, the `hue-N` classes) of a team, taken from its name. */
export function teamHue(team) {
  return hashOf(typeof team === "string" ? team : team.name) % HUES;
}

/**
 * The emblem of a team, `size` pixels wide (a size of components/sizes.css). `team` has a name and,
 * when the team uploaded a logo, an id and a logoVersion.
 */
export function teamEmblem(team, size = 40) {
  const name = typeof team === "string" ? team : team.name;
  if (team.logoVersion && team.id) {
    return `<span class="emblem s-${size}"><img src="/team-logos/${encodeURIComponent(team.id)}?v=${team.logoVersion}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async"></span>`;
  }
  const hash = hashOf(name);
  return `<span class="emblem s-${size} hue-${hash % HUES}" title="${escapeHtml(name)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${SHAPES[(hash >>> 4) % SHAPES.length]}"/></svg></span>`;
}
