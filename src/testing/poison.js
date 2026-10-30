// Fills every free-text field of a database with markup, to see whether any page writes stored text into the page
// as markup instead of as text (src/client/xss-crawl.e2e.mjs). The markup is written straight into the tables, past the
// validation of the API: the point is that a page must not rely on that validation to stay safe.

/** One payload per room: the first that fits the column. They all start with `"` to break out of an attribute. */
const PAYLOADS = [
  `"><img src=x onerror=window.__xss=1><u id=__xss>`,
  `"><img src=x><u id=__xss>`,
  `"><u id=__xss>`,
  `"><u>`
];
const fit = length => PAYLOADS.find(payload => payload.length <= length) ?? null;

/** Columns that hold words people (or the staff) wrote, by name. */
const TEXT_COLUMN =
  /^(name|title|note|notes|body|bio|reason|description|label|brief|username|guild_name|channel_name|event|stage|team_a|team_b|team_a_name|team_b_name|blue_team|red_team|winner|text|detail|attribution)$/;
/** Columns that are looked up or compared by value (a route, a key, an id): poisoning them only breaks the lookup. */
const LOOKED_UP = new Set(["users.tag", "teams.name_key", "teams.tag"]);
/** JSON columns: the strings under these keys are words; the other strings (ids, enums, urls) stay as they are. */
const JSON_COLUMNS = [
  "series.data_json",
  "tier_lists.data_json",
  "official_tier_lists.data_json",
  "training_notes.steps_json",
  "training_notes.marks_json",
  "training_scenarios.pins_json",
  "hero_combos.steps_json",
  "notifications.payload_json",
  "competitive_games.draft_json",
  "user_profiles.main_heroes_json"
];
const WORD_KEY =
  /name|label|note|title|text|body|comment|description|team|bio|reason|message|detail/i;

function poisonJson(value, key = "") {
  if (typeof value === "string") {
    return WORD_KEY.test(key) ? PAYLOADS[0] : value;
  }
  if (Array.isArray(value)) {
    return value.map(item => poisonJson(item, key));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, poisonJson(item, name)])
    );
  }
  return value;
}

/**
 * Puts a payload in every free-text column of `database` and in the words of the JSON columns.
 * Returns what was poisoned, for the report: [{ column, rows }].
 */
export async function poisonDatabase(pool, database) {
  const [columns] = await pool.query(
    "SELECT table_name AS t, column_name AS c, data_type AS d, character_maximum_length AS n FROM information_schema.columns WHERE table_schema = ? AND data_type IN ('varchar','char','text','tinytext','mediumtext','longtext') ORDER BY table_name, ordinal_position",
    [database]
  );
  const poisoned = [];
  for (const { t, c, d, n } of columns) {
    const name = `${t}.${c}`;
    if (JSON_COLUMNS.includes(name) || LOOKED_UP.has(name) || !TEXT_COLUMN.test(c)) {
      continue;
    }
    const payload = fit(d === "varchar" || d === "char" ? Number(n) : 1_000_000);
    if (!payload) {
      continue;
    }
    const [result] = await pool.query(
      `UPDATE \`${t}\` SET \`${c}\` = ? WHERE \`${c}\` IS NOT NULL AND \`${c}\` <> ''`,
      [payload]
    );
    if (result.affectedRows) {
      poisoned.push({ column: name, rows: result.affectedRows });
    }
  }
  for (const name of JSON_COLUMNS) {
    const [table, column] = name.split(".");
    const [rows] = await pool.query(`SELECT * FROM \`${table}\` WHERE \`${column}\` IS NOT NULL`);
    let count = 0;
    for (const row of rows) {
      let parsed;
      try {
        parsed = JSON.parse(row[column]);
      } catch {
        continue;
      }
      const keys = await primaryKeyOf(pool, database, table);
      if (!keys.length) {
        continue;
      }
      await pool.query(
        `UPDATE \`${table}\` SET \`${column}\` = ? WHERE ${keys.map(key => `\`${key}\` = ?`).join(" AND ")}`,
        [JSON.stringify(poisonJson(parsed)), ...keys.map(key => row[key])]
      );
      count += 1;
    }
    if (count) {
      poisoned.push({ column: name, rows: count });
    }
  }
  return poisoned;
}

const keyCache = new Map();
async function primaryKeyOf(pool, database, table) {
  if (!keyCache.has(table)) {
    const [rows] = await pool.query(
      "SELECT column_name AS c FROM information_schema.key_column_usage WHERE table_schema = ? AND table_name = ? AND constraint_name = 'PRIMARY' ORDER BY ordinal_position",
      [database, table]
    );
    keyCache.set(
      table,
      rows.map(row => row.c)
    );
  }
  return keyCache.get(table);
}
