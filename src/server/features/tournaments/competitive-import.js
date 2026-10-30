import { DomainError } from "../../platform/errors.js";

export const ALLOWED_LICENSES = ["CC BY-SA 3.0", "CC BY-SA 4.0"];
// Competitive data must be Global. Anything that names the Chinese version or Arena of Valor is
// refused.
const FOREIGN_MARKERS =
  /\b(china|chinese|cn|chn|kpl|tencent|mainland|arena\s+of\s+valor|aov|rov|garena)\b/i;

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      field = "";
      if (row.some(value => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
    } else {
      field += char;
    }
  }
  if (quoted) {
    throw new DomainError("The CSV has an unterminated quoted field.");
  }
  row.push(field);
  if (row.some(value => value.trim() !== "")) {
    rows.push(row);
  }
  return rows;
}

/**
 * CSV with a header row: heroId,picks,bans,wins (extra columns such as heroName are ignored, never
 * used for matching).
 */
export function csvToHeroRows(text) {
  const [header, ...lines] = parseCsv(text);
  if (!header) {
    throw new DomainError("The CSV is empty.");
  }
  const columns = header.map(name => name.trim());
  for (const required of ["heroId", "picks", "bans", "wins"]) {
    if (!columns.includes(required)) {
      throw new DomainError(
        'The CSV needs a "{required}" column (header: heroId,picks,bans,wins).',
        { required }
      );
    }
  }
  return lines.map((cells, lineIndex) => {
    if (cells.length > columns.length) {
      throw new DomainError("CSV line {value} has more cells than the header.", {
        value: lineIndex + 2
      });
    }
    return Object.fromEntries(columns.map((name, index) => [name, (cells[index] ?? "").trim()]));
  });
}

export function assertGlobalRegion(region) {
  if (FOREIGN_MARKERS.test(region)) {
    throw new DomainError(
      "Only Honor of Kings Global data can be imported (no China / Arena of Valor)."
    );
  }
}

/** Counts → rates. Rates are derived on read from raw counts so the sample is always visible. */
export function summariseCompetitive(row, totalGames) {
  return {
    picks: row.picks,
    bans: row.bans,
    wins: row.wins,
    totalGames,
    pickRate: totalGames > 0 ? row.picks / totalGames : null,
    banRate: totalGames > 0 ? row.bans / totalGames : null,
    winRate: row.picks > 0 ? row.wins / row.picks : null
  };
}
