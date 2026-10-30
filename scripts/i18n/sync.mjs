#!/usr/bin/env node
// Translation workflow.
//   node scripts/i18n/sync.mjs            keeps src/translations/keys.tsv in step with the code (ids are stable; new keys get new ids),
//                                       reports what each src/translations/<lang>.txt still misses, and rebuilds src/public/locales/<lang>.js.
//   node scripts/i18n/sync.mjs --prune    also removes the keys the code no longer uses, from keys.tsv and every <lang>.txt
//                                       (they are never in the built locales anyway, so the site does not change).
// src/translations/keys.tsv      id <TAB> English source text (the key used by t("…"))
// src/translations/<lang>.txt id|translation (same {placeholders}; plural blocks use that language's
// CLDR categories)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LANGUAGES } from "../../src/shared/i18n.js";
import { collectKeys } from "./keys.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DIRECTORY = path.join(ROOT, "src/translations");
mkdirSync(DIRECTORY, { recursive: true });

const readLines = (file, separator) =>
  existsSync(file)
    ? readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => {
          const cut = line.indexOf(separator);
          return [line.slice(0, cut), line.slice(cut + 1)];
        })
    : [];
const readTsv = file => readLines(file, "\t");

const keysFile = path.join(DIRECTORY, "keys.tsv");
const existing = new Map(readTsv(keysFile).map(([id, key]) => [key, id]));
let next = Math.max(0, ...[...existing.values()].map(Number)) + 1;
const used = collectKeys();
const added = [];
for (const key of used.keys()) {
  if (!existing.has(key)) {
    existing.set(key, String(next++).padStart(4, "0"));
    added.push(key);
  }
}
const prune = process.argv.includes("--prune");
const rows = [...existing]
  .filter(([key]) => !prune || used.has(key))
  .map(([key, id]) => [id, key])
  .sort((a, b) => a[0].localeCompare(b[0]));
writeFileSync(keysFile, `${rows.map(([id, key]) => `${id}\t${key}`).join("\n")}\n`);
const idOf = new Map(rows.map(([id, key]) => [key, id]));
const keptIds = new Set(rows.map(([id]) => id));
const live = new Set(used.keys());
console.log(
  `keys.tsv: ${rows.length} entries (${added.length} added, ${rows.filter(([, key]) => !live.has(key)).length} no longer used)`
);

for (const { code } of LANGUAGES) {
  if (code === "en") {
    continue;
  }
  const translations = new Map(readLines(path.join(DIRECTORY, `${code}.txt`), "|"));
  if (prune) {
    const kept = [...translations].filter(([id]) => keptIds.has(id));
    writeFileSync(
      path.join(DIRECTORY, `${code}.txt`),
      `${kept.map(([id, text]) => `${id}|${text}`).join("\n")}\n`
    );
  }
  const missing = [...live].filter(key => !translations.has(idOf.get(key)));
  const entries = [...live]
    .filter(key => translations.has(idOf.get(key)))
    .sort()
    .map(key => `  ${JSON.stringify(key)}: ${JSON.stringify(translations.get(idOf.get(key)))}`);
  writeFileSync(
    path.join(ROOT, "src/public/locales", `${code}.js`),
    `// Generated from src/translations/${code}.txt by scripts/i18n/sync.mjs — edit the .txt, not this file.\nexport default {\n${entries.join(",\n")}\n};\n`
  );
  console.log(
    `${code}: ${live.size - missing.length}/${live.size}${missing.length ? `  (missing ${missing.length})` : ""}`
  );
}
