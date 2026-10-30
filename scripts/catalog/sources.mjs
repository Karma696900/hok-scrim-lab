// Reads the three saved pages the owner gave (items.html, arcana.html, spells.html) and turns them into
// plain data. Pure: no file, no network, no database, so that it is tested on small excerpts.
//
//  - items.html  : the Equipment page of the Honor of Kings wiki on Fandom. Six tables, one per category
//    of the shop (Physical, Magical, Defense, Movement, Jungling, Roaming): name, a short effect line and
//    a sentence for the bonuses ("80 Physical Attack, 10% Cooldown Reduction, and 500 Max Health").
//  - arcana.html : the arcana guide of hokstats.gg. Level 5 of each arcana, by colour, with its stats.
//  - spells.html : the battle spells page of hokstats.gg: name, cooldown, what it does, an icon address.
//
// Nothing is guessed. A row that cannot be read with certainty is returned in `skipped` with the reason,
// and is not imported: the owner reads that list. The words and numbers are those of the pages, which are
// community and fan sites (the wiki's text is CC BY-SA): they are a starting point to check, not a source
// of truth, and the importer says where each value came from.

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&nbsp;": " " };
const decode = text =>
  text
    .replace(/&(amp|lt|gt|quot|nbsp);/g, entity => ENTITIES[entity])
    .replace(/&#0*39;|&#x27;|&rsquo;|&lsquo;/g, "’")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
const strip = html =>
  html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
const textOf = html =>
  decode(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/** The key two spellings of a name share: no case, no apostrophe, no punctuation. */
export const nameKey = name =>
  decode(String(name))
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// ---- the stats ---------------------------------------------------------------------------------------------

/**
 * The stats the pages talk about: the name the catalogue gets, the spellings the pages use, and whether the
 * number is a percentage. A number written the other way (210% of Magical Attack) is not read.
 */
export const STAT_WORDS = [
  ["Physical Attack", ["physical attack"], false],
  ["Magical Attack", ["magical attack", "magic attack"], false],
  ["Max Health", ["max health", "max hp"], false],
  ["Max Mana", ["max mana"], false],
  ["Physical Defense", ["physical defense", "physical defence"], false],
  ["Magical Defense", ["magical defense", "magical defence", "magic defense"], false],
  ["Cooldown Reduction", ["cooldown reduction", "cool down reduction"], true],
  ["Attack Speed", ["attack speed"], true],
  ["Critical Rate", ["critical rate", "crit rate"], true],
  ["Critical Damage", ["critical damage", "crit damage"], true],
  ["Movement Speed", ["movement speed"], true],
  ["Physical Lifesteal", ["physical lifesteal"], true],
  ["Magical Lifesteal", ["magical lifesteal", "magic lifesteal"], true],
  ["Physical Pierce", ["physical pierce"], null],
  ["Magical Pierce", ["magical pierce", "magic pierce"], null],
  ["Health Recovery", ["health recovery"], false]
];
const STAT_BY_WORDS = new Map(
  STAT_WORDS.flatMap(([name, words, percent]) => words.map(word => [word, { name, percent }]))
);

/** One "<number>[%] <stat>" piece; null when it is not exactly that. */
function readPiece(piece) {
  const match = /^\+?\s*(\d+(?:\.\d+)?)\s*(%?)\s+([A-Za-z][A-Za-z ]*)$/.exec(piece.trim());
  if (!match) {
    return { problem: `cannot read “${piece.trim()}”` };
  }
  const stat = STAT_BY_WORDS.get(match[3].trim().toLowerCase().replace(/\s+/g, " "));
  if (!stat) {
    return { problem: `unknown stat “${match[3].trim()}”` };
  }
  const percent = match[2] === "%";
  if (stat.percent !== null && stat.percent !== percent) {
    return {
      problem: `${match[1]}${match[2]} ${stat.name}: ${stat.percent ? "a percentage" : "a whole value"} is expected, the page wrote the other`
    };
  }
  return { stat: stat.name, value: Number(match[1]), percent };
}

/**
 * The bonuses of an item written as a sentence. `{ lines }` when every piece is read, else `{ problem }`
 * (one unreadable piece makes the whole row unreadable: half an item is worse than none).
 */
export function parseBonuses(sentence) {
  // "140 Physical and Magical Defense" is two stats written once: said twice before cutting at "and"
  const pieces = decode(sentence)
    .replace(/\s+/g, " ")
    .replace(
      /(\d+(?:\.\d+)?)\s+Physical and Magical (Defen[sc]e)/gi,
      "$1 Physical $2, $1 Magical $2"
    )
    .split(/,\s*(?:and\s+)?|\s+and\s+/i)
    .map(piece => piece.trim())
    .filter(Boolean);
  if (!pieces.length) {
    return { problem: "no bonus written" };
  }
  const expanded = pieces;
  const lines = [];
  for (const piece of expanded) {
    const read = readPiece(piece);
    if (read.problem) {
      return { problem: read.problem };
    }
    if (lines.some(line => line.stat === read.stat)) {
      return { problem: `${read.stat} is written twice` };
    }
    lines.push(read);
  }
  return { lines };
}

// ---- items -------------------------------------------------------------------------------------------------

const SHOP_TABLES = ["physical", "magical", "defense", "movement", "jungling", "roaming"];
/** A name that says the row is not a current item. */
const NOT_CURRENT = /removed|reworked|under maintenance/i;
/** Two items in one row ("Pure Sky and Sky Dome"): the bonuses cannot be given to one of them. */
const TWO_ITEMS = /\s+and\s+/i;

/**
 * The rows of the six tables of the Equipment page: { name, shopCategory, effect, bonus, lines } for what
 * is read, and `skipped` for the rest, each with its reason.
 */
export function parseWikiItems(html) {
  const tables = [...strip(html).matchAll(/<table[\s\S]*?<\/table>/gi)].map(match => match[0]);
  const items = [];
  const skipped = [];
  tables.slice(0, SHOP_TABLES.length).forEach((table, tableIndex) => {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(match => match[0]).slice(1);
    for (const row of rows) {
      const cells = [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(match =>
        textOf(match[1])
      );
      if (cells.length < 3 || !cells[0]) {
        continue;
      }
      const [name, effect, bonus] = cells;
      const base = { name, shopCategory: SHOP_TABLES[tableIndex] };
      if (NOT_CURRENT.test(name)) {
        skipped.push({
          ...base,
          reason: "the page says it is removed, reworked or under maintenance"
        });
        continue;
      }
      if (TWO_ITEMS.test(name)) {
        skipped.push({
          ...base,
          reason: "two items share this row: their bonuses cannot be told apart"
        });
        continue;
      }
      const read = parseBonuses(bonus);
      if (read.problem) {
        skipped.push({ ...base, reason: read.problem, bonus });
        continue;
      }
      items.push({ ...base, effect, bonus, lines: read.lines });
    }
  });
  return { items, skipped };
}

// ---- arcana ------------------------------------------------------------------------------------------------

const ARCANA_SECTION = /(Red|Green|Blue) Arcana\s+—/;
const SECTION_COLOUR = { Red: "red", Green: "green", Blue: "blue" };

/**
 * The level-5 arcana of the guide, by colour, with their stats: { name, color, lines }. A stat the
 * guide writes that is not known is a `skipped` arcana, not a half-read one.
 */
export function parseArcanaPage(html) {
  const text = textOf(strip(html).replace(/<img[^>]*alt="Lvl 5: ([^"]*)"[^>]*>/gi, " ⟦$1⟧ "));
  const start = text.search(ARCANA_SECTION);
  const arcana = [];
  const skipped = [];
  if (start < 0) {
    return { arcana, skipped };
  }
  const sections = text
    .slice(start)
    .split(/(?=(?:Red|Green|Blue) Arcana\s+—)/)
    .filter(section => ARCANA_SECTION.test(section));
  for (const section of sections) {
    const color = SECTION_COLOUR[ARCANA_SECTION.exec(section)[1]];
    for (const entry of section.matchAll(/⟦([^⟧]+)⟧\s+(.+?)(?=⟦|$)/g)) {
      const name = entry[1].trim();
      // "Calamity Critical Rate +1.6%" : the name, then the stats; the last arcana is followed by prose
      // the colour dot of the next section is glued to the last arcana of this one
      let rest = entry[2]
        .split(/Stat values shown/i)[0]
        .replace(/[^ -~]+/g, " ")
        .trim();
      if (rest.toLowerCase().startsWith(name.toLowerCase())) {
        rest = rest.slice(name.length).trim();
      }
      const stats = [...rest.matchAll(/([A-Za-z][A-Za-z ]*?)\s+\+(\d+(?:\.\d+)?)(%?)/g)];
      // the whole stat line must be those stats and nothing else (an unknown word is not skipped over)
      if (
        !stats.length ||
        stats
          .map(stat => stat[0])
          .join(" ")
          .replace(/s+/g, " ") !== rest.replace(/s+/g, " ")
      ) {
        skipped.push({ name, color, reason: "no stat line could be read" });
        continue;
      }
      const lines = [];
      let problem = "";
      for (const stat of stats) {
        const read = readPiece(`${stat[2]}${stat[3]} ${stat[1].trim()}`);
        if (read.problem) {
          problem = read.problem;
          break;
        }
        lines.push(read);
      }
      if (problem) {
        skipped.push({ name, color, reason: problem });
      } else {
        arcana.push({ name, color, lines });
      }
    }
  }
  return { arcana, skipped };
}

// ---- spells ------------------------------------------------------------------------------------------------

/** The battle spells of the page: { name, cooldownSeconds, description, iconUrl }. */
export function parseSpellsPage(html) {
  const cleaned = strip(html);
  const spells = [];
  const skipped = [];
  const blocks = cleaned.split(/(?=<img[^>]*battle spell icon)/i).slice(1);
  for (const block of blocks) {
    const icon = /<img[^>]*src="([^"]+)"[^>]*alt="([^"]*?) battle spell icon"/i.exec(block);
    const text = textOf(block);
    const name = icon?.[2]?.trim();
    const match = name
      ? new RegExp(
          `${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+Cooldown\\s+(\\d+)\\s+seconds?\\s+(.+?)\\s+Best for`,
          "i"
        ).exec(text)
      : null;
    if (!name || !match) {
      skipped.push({ name: name ?? "?", reason: "name, cooldown or description not found" });
      continue;
    }
    spells.push({
      name,
      cooldownSeconds: Number(match[1]),
      description: match[2].trim(),
      iconUrl: icon[1]
    });
  }
  return { spells, skipped };
}
