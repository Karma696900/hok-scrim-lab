// What the importer of pictures decides from a file: the name an item or an arcana is given, the slot
// an item is put in, the colour an arcana has. Pure (the colour is read from pixels the caller gives):
// nothing here is invented, each rule is mechanical and listed in the output of the importer so the
// administrator can correct a name in the catalogue.

/** Words that stay in lower case inside a name ("Axe Of Torment" becomes "Axe of Torment"). */
const SMALL_WORDS = new Set(["of", "the", "a", "an", "in", "on", "and", "or", "to", "for"]);

/**
 * The name written on a file: no extension, no "%27" (the address form of an apostrophe), no level of
 * an arcana ("_Lv_V"), no "HoK_" prefix, underscores read as spaces and a spaced dash kept as one.
 * Nothing is added: a word the file lost (an apostrophe in "Overlords_Might") is not guessed.
 */
export function cleanName(file, kind = "item") {
  let name = String(file).replace(/\.[a-z0-9]+$/i, "");
  try {
    name = decodeURIComponent(name);
  } catch {
    // not an address-encoded name: keep it as it is
  }
  if (kind === "arcana") {
    name = name.replace(/[_ ]?Lv[_ ]?[IVX0-9]+$/i, "");
  }
  name = name
    .replace(/^HoK[_ ]/i, "")
    .replace(/_/g, " ")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
  return name
    .split(" ")
    .map((word, index) =>
      index > 0 && SMALL_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word
    )
    .join(" ");
}

/** The slot of an item from its name: boots are the one thing a name says for sure; the rest is "regular". */
export const slotOfName = name => (/^boots\b/i.test(name) ? "boots" : "regular");

/**
 * The colour of an arcana (red, blue or green) from its pixels: the field of the badge is the only
 * large area with a strong colour, the frame is gold. `data` is RGBA, 4 bytes a pixel. Returns
 * { colour, share } where `share` is how much of the coloured pixels agree, or colour null when no
 * colour is clear enough (the caller then asks a person).
 */
export function arcanaColour(data, { minimumShare = 0.9 } = {}) {
  const counts = { red: 0, green: 0, blue: 0 };
  for (let at = 0; at + 3 < data.length; at += 4) {
    if (data[at + 3] < 200) {
      continue;
    }
    const r = data[at];
    const g = data[at + 1];
    const b = data[at + 2];
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    if (max < 60 || delta / (max || 1) < 0.4) {
      continue; // too dark or grey to say
    }
    let hue;
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    hue = (hue * 60 + 360) % 360;
    if (hue < 25 || hue >= 335) {
      counts.red += 1;
    } else if (hue >= 70 && hue < 165) {
      counts.green += 1;
    } else if (hue >= 170 && hue < 260) {
      counts.blue += 1;
    } // orange, gold and purple are the frame and the glow, not the field
  }
  const total = counts.red + counts.green + counts.blue;
  if (!total) {
    return { colour: null, share: 0 };
  }
  const [colour, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const share = count / total;
  return { colour: share >= minimumShare ? colour : null, share };
}
