// The tiles of the field (simulation-terrain.js draws with them), in the game's colours: a light, lively grass, pale
// flagstones for the lanes and the bases, pale grey rock with moss for the walls, a bright turquoise river over its
// sandy bed, stone platforms under the camps, and the blue-flowered woods round the field. Every tile is a pattern in
// the map's own pixels, so it stays sharp at any camera height. Our own drawings only: the site is open source.

// the light of each side's fountain
const FOUNTAIN = { blue: "#8fd0ff", red: "#ffb08f" };

const blades = (list, colour, width) =>
  list
    .map(
      ([x, y, dx, dy]) =>
        `<path d="M${x} ${y}l${dx} ${dy}" stroke="${colour}" stroke-width="${width}" stroke-linecap="round"/>`
    )
    .join("");

const crowns = (list, shade, light) =>
  list
    .map(
      ([x, y, r]) =>
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${shade}"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.55}" fill="${light}"/>`
    )
    .join("");

const slab = ([x, y, w, h, tone]) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.4" fill="${tone}"/>`;

const pattern = (id, size, inner, height = size) =>
  `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${size}" height="${height}">${inner}</pattern>`;

const facets = list => list.map(([d, fill]) => `<path d="${d}" fill="${fill}"/>`).join("");

/** The grass and the woods round the field. */
function groundDefs() {
  return [
    pattern(
      "sim-t-grass",
      40,
      `<rect width="40" height="40" fill="#7cb246"/>${blades(
        [
          [4, 9, 1.5, -4],
          [6, 9, -1, -4.5],
          [17, 22, 1.2, -4],
          [19, 22, -1.4, -3.5],
          [30, 6, 1, -4],
          [33, 33, -1.2, -4],
          [35, 33, 1.4, -4.5],
          [11, 35, 1, -3.5],
          [25, 14, -1, -3.5]
        ],
        "#94c75c",
        1.1
      )}${blades(
        [
          [9, 17, 1, -3],
          [27, 27, -1, -3],
          [37, 18, 1, -3],
          [2, 28, 1, -3]
        ],
        "#679f39",
        1
      )}<circle cx="22" cy="5" r="0.9" fill="#f1ec9a"/><circle cx="8" cy="26" r="0.8" fill="#f6f3e6"/>`
    ),
    pattern(
      "sim-t-tone",
      260,
      `<ellipse cx="60" cy="70" rx="70" ry="45" fill="#4f8a2e" opacity="0.2"/><ellipse cx="190" cy="180" rx="80" ry="55" fill="#b5d878" opacity="0.2"/><ellipse cx="200" cy="40" rx="45" ry="30" fill="#c9c18a" opacity="0.16"/><ellipse cx="70" cy="210" rx="55" ry="35" fill="#b5d878" opacity="0.14"/>`
    ),
    // large soft patches over the grass, wider than the tone's, so no tile repeats to the eye
    pattern(
      "sim-t-patches",
      620,
      `<ellipse cx="150" cy="120" rx="160" ry="90" fill="#c0de86" opacity="0.16"/><ellipse cx="450" cy="380" rx="190" ry="110" fill="#4f8a2e" opacity="0.14"/><ellipse cx="480" cy="90" rx="90" ry="60" fill="#d6cf9a" opacity="0.12"/><ellipse cx="160" cy="470" rx="130" ry="80" fill="#c0de86" opacity="0.12"/>`
    ),
    // the woods beyond the field's wall: green crowns and the blue-flowered trees of the game
    pattern(
      "sim-t-forest",
      120,
      `<rect width="120" height="120" fill="#28432f"/>${crowns(
        [
          [14, 16, 13],
          [52, 10, 11],
          [100, 22, 14],
          [76, 50, 12],
          [20, 62, 12],
          [104, 84, 11],
          [44, 98, 14],
          [86, 112, 10],
          [8, 108, 9]
        ],
        "#365f3f",
        "#4b7b52"
      )}<g class="sim-t-bloom">${crowns(
        [
          [40, 44, 15],
          [74, 88, 13],
          [112, 52, 8]
        ],
        "#5f74c4",
        "#93a6ea"
      )}</g>`
    )
  ];
}

/** The stone: the lanes' flagstones, the platforms, the walls' rock and its cliffs. */
function stoneDefs() {
  return [
    pattern(
      "sim-t-stone",
      24,
      `<rect width="24" height="24" fill="#d6ceae"/>${[
        [0.8, 0.8, 10.6, 10.6, "#e4ddc1"],
        [12.6, 0.8, 10.6, 6, "#ebe5cd"],
        [12.6, 7.8, 10.6, 3.6, "#dcd4b6"],
        [0.8, 12.6, 6, 10.6, "#e0d9bc"],
        [7.8, 12.6, 15.4, 10.6, "#e8e2c8"]
      ]
        .map(slab)
        .join("")}<path d="M3 4l3 2M16 17l4 1" stroke="#c6bd9b" stroke-width="0.6"/>`
    ),
    // the camps' and the pits' platforms: square grey slabs
    pattern(
      "sim-t-platform",
      16,
      `<rect width="16" height="16" fill="#9aa398"/>${[
        [0.7, 0.7, 6.6, 6.6, "#c3cabd"],
        [8.7, 0.7, 6.6, 6.6, "#ced4c8"],
        [0.7, 8.7, 6.6, 6.6, "#cbd1c4"],
        [8.7, 8.7, 6.6, 6.6, "#bcc4b6"]
      ]
        .map(slab)
        .join("")}`
    ),
    // the walls' top: pale grey-green rock in facets, with spots of moss
    pattern(
      "sim-t-rock",
      28,
      `<rect width="28" height="28" fill="#98a89f"/>${facets([
        ["M0 0h12l-3 9h-9z", "#aebbb3"],
        ["M14 2l10 -2v11l-8 2z", "#b7c3bb"],
        ["M2 14l9 -2l3 10l-12 4z", "#a5b3ab"],
        ["M17 15l11 -1v12l-9 1z", "#b2beb6"]
      ])}<path d="M12 0l-3 9M16 13l-2 9M0 10l11 2" stroke="#7f8d86" stroke-width="0.7" fill="none"/><ellipse cx="22" cy="7" rx="2.6" ry="1.6" fill="#6ea64a"/><ellipse cx="7" cy="22" rx="2" ry="1.3" fill="#6ea64a"/>`
    ),
    // the rock of the cliffs, in layers
    pattern(
      "sim-t-cliff",
      16,
      `<rect width="16" height="6" fill="#66746e"/><path d="M0 1.6h16" stroke="#95a39c" stroke-width="1"/><path d="M0 4.4h16" stroke="#5f6c67" stroke-width="0.9"/><path d="M5 1.6l1 2.8M12 4.4l-0.8 1.6" stroke="#5f6c67" stroke-width="0.6"/>`,
      6
    ),
    pattern(
      "sim-t-bush",
      10,
      `<rect width="10" height="10" fill="#5c9a35"/>${blades(
        [
          [2, 9, -0.8, -4.5],
          [4, 9, 0.8, -5],
          [7, 9.5, -1, -4.5],
          [9, 9.5, 0.7, -4]
        ],
        "#7fbd4c",
        0.9
      )}${blades(
        [
          [1, 4.5, 0.7, -3],
          [6, 5, -0.7, -3.5]
        ],
        "#467d2a",
        0.9
      )}`
    ),
    `<radialGradient id="sim-t-pit" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#535b55"/><stop offset="70%" stop-color="#6c756e"/><stop offset="100%" stop-color="#8b948c"/></radialGradient>`
  ];
}

/** The water: the river's bed, its ripples and glints; and the fountains' light. */
function waterDefs() {
  return [
    // the river's bed, seen through its shallow water: pale sand and pebbles
    pattern(
      "sim-t-bed",
      48,
      `<rect width="48" height="48" fill="#8fcbbd"/><ellipse cx="10" cy="12" rx="3" ry="2" fill="#a9dacd"/><ellipse cx="30" cy="8" rx="2.2" ry="1.5" fill="#6fb2a6"/><ellipse cx="38" cy="30" rx="3.4" ry="2.2" fill="#a9dacd"/><ellipse cx="16" cy="36" rx="2" ry="1.4" fill="#6fb2a6"/><ellipse cx="26" cy="22" rx="1.4" ry="1" fill="#bfe5da"/><ellipse cx="44" cy="44" rx="1.6" ry="1.1" fill="#6fb2a6"/>`
    ),
    pattern(
      "sim-t-ripple",
      60,
      `<path d="M4 8q6 -4 12 0t12 0M34 22q5 -3 10 0t10 0M14 26q4 -3 8 0" fill="none" stroke="#e2fbfb" stroke-width="0.9" stroke-linecap="round" opacity="0.4"/>`,
      30
    ),
    // the light the sun leaves on the water
    pattern(
      "sim-t-glint",
      90,
      `<ellipse cx="12" cy="10" rx="4" ry="0.8" fill="#f4fbff" opacity="0.45"/><ellipse cx="58" cy="24" rx="3" ry="0.7" fill="#f4fbff" opacity="0.36"/><ellipse cx="34" cy="48" rx="5" ry="0.9" fill="#f4fbff" opacity="0.3"/><ellipse cx="78" cy="52" rx="2.5" ry="0.6" fill="#f4fbff" opacity="0.4"/>`,
      60
    ),
    ...["blue", "red"].map(
      team =>
        `<radialGradient id="sim-t-fountain-${team}"><stop offset="0%" stop-color="${FOUNTAIN[team]}" stop-opacity="0.85"/><stop offset="55%" stop-color="${FOUNTAIN[team]}" stop-opacity="0.35"/><stop offset="100%" stop-color="${FOUNTAIN[team]}" stop-opacity="0"/></radialGradient>`
    )
  ];
}

/** Every tile of the ground, the water and the relief. */
export function terrainDefs() {
  return [...groundDefs(), ...stoneDefs(), ...waterDefs()].join("");
}
