// A small picture for each reflex exercise (160 x 90, drawn by hand, no external file): the tile of the list,
// the page of the exercise and the preview a visitor sees all use them. Colours come from the classes of
// styles/pages/reflex.css, so both themes and the high-contrast cases follow.

/** `count` x `rows` rounded squares of `size`, the ones whose index is in `lit` in the bright class. */
function pads({ columns, rows, size, gap, lit = [], left, top }) {
  let out = "";
  for (let index = 0; index < columns * rows; index += 1) {
    const x = left + (index % columns) * (size + gap);
    const y = top + Math.floor(index / columns) * (size + gap);
    out += `<rect class="${lit.includes(index) ? "k1" : "k2"}" x="${x}" y="${y}" width="${size}" height="${size}" rx="5"/>`;
  }
  return out;
}

/** A digit in the middle of a box. */
const digit = (value, x, y) =>
  `<text class="kt" x="${x}" y="${y}" text-anchor="middle">${value}</text>`;

const DRAWINGS = {
  reaction: () =>
    `<rect class="k4" x="28" y="12" width="104" height="66" rx="10"/><path class="kw" d="M88 20 66 50h13l-5 20 22-31H85z"/>`,
  sequence: () =>
    pads({ columns: 3, rows: 3, size: 21, gap: 7, lit: [0, 4, 8, 5], left: 46, top: 7 }) +
    `<path class="k3" d="M56 17 80 45l24 28M56 17l24 28 24-28" fill="none" stroke-dasharray="3 5"/>`,
  chimp: () =>
    pads({ columns: 4, rows: 3, size: 24, gap: 6, lit: [1, 6, 8, 11], left: 25, top: 7 }) +
    digit(1, 68, 32) +
    digit(2, 98, 51) +
    digit(3, 38, 70) +
    digit(4, 128, 70),
  aim: () =>
    `<circle class="k3" cx="80" cy="45" r="38"/><circle class="k3" cx="80" cy="45" r="25"/><circle class="team-red" cx="80" cy="45" r="11"/><path class="k3" d="M80 2v14M80 74v14M24 45h14M122 45h14" fill="none"/>`,
  tracking: () =>
    `<path class="k3" d="M34 62 58 30 92 52 124 22" fill="none" stroke-dasharray="3 5"/>` +
    [
      [34, 62, 1],
      [58, 30, 1],
      [92, 52, 0],
      [124, 22, 1],
      [112, 66, 0],
      [20, 26, 0],
      [78, 74, 0]
    ]
      .map(
        ([x, y, hot]) =>
          `<circle class="${hot ? "k4" : "k2"}" cx="${x}" cy="${y}" r="${hot ? 9 : 8}"/>${hot ? `<circle class="k3" cx="${x}" cy="${y}" r="14"/>` : ""}`
      )
      .join(""),
  discern: () =>
    `<circle class="team-red" cx="42" cy="34" r="15"/><circle class="team-blue" cx="86" cy="58" r="15"/><circle class="team-red" cx="122" cy="30" r="15"/><circle class="k3" cx="42" cy="34" r="22"/><circle class="k3" cx="122" cy="30" r="22"/>`,
  lasthit: () =>
    `<rect class="k2" x="22" y="38" width="116" height="16" rx="5"/><rect class="k4" x="22" y="38" width="76" height="16" rx="5"/><rect class="kw" x="94" y="30" width="4" height="32" rx="2"/><path class="k1" d="M96 70l-6 10h12z"/>`,
  inputs: () =>
    [0, 1, 2, 3]
      .map(
        index =>
          `<rect class="${index === 1 ? "k1" : "k2"}" x="${15 + index * 34}" y="24" width="28" height="36" rx="6"/>${digit(index + 1, 29 + index * 34, 49)}`
      )
      .join("")
};

/** The picture of an exercise, as markup (decorative: the name is written next to it). */
export const exerciseArt = id =>
  `<svg class="rx-art" viewBox="0 0 160 90" aria-hidden="true" focusable="false">${DRAWINGS[id]?.() ?? ""}</svg>`;
