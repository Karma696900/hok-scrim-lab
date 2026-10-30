#!/usr/bin/env node
// Adds translations in bulk.
//   node scripts/i18n/add.mjs <file.json>
// The file maps an English text (the key used by t("…")) to its translations by language code:
//   { "Sign out": { "fr": "Se déconnecter", "es": "Cerrar sesión", … } }
// Run `node scripts/i18n/sync.mjs` first so that every key has its id; this tool then appends
// `id|translation` to src/translations/<code>.txt for each language that gives one (an existing
// translation is never replaced) and checks that the {placeholders} are the same as in English.
// Run the sync again afterwards to rebuild src/public/locales/.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LANGUAGES } from "../../src/shared/i18n.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DIRECTORY = path.join(ROOT, "src/translations");
const input = JSON.parse(readFileSync(path.resolve(process.argv[2]), "utf8"));

const ids = new Map(
  readFileSync(path.join(DIRECTORY, "keys.tsv"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const cut = line.indexOf("\t");
      return [line.slice(cut + 1), line.slice(0, cut)];
    })
);
const placeholders = text =>
  [...text.matchAll(/\{(\w+)\}/g)]
    .map(match => match[1])
    .sort()
    .join(",");

const problems = [];
const added = new Map();
for (const [key, translations] of Object.entries(input)) {
  const id = ids.get(key);
  if (!id) {
    problems.push(`not a key of keys.tsv (run the sync first): ${key}`);
    continue;
  }
  for (const [code, text] of Object.entries(translations)) {
    if (!LANGUAGES.some(language => language.code === code && code !== "en")) {
      problems.push(`${key}: unknown language ${code}`);
    } else if (placeholders(text) !== placeholders(key)) {
      problems.push(`${key} [${code}]: the placeholders differ from the English text`);
    } else {
      added.set(code, [...(added.get(code) ?? []), [id, text]]);
    }
  }
}

let count = 0;
for (const [code, rows] of added) {
  const file = path.join(DIRECTORY, `${code}.txt`);
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const known = new Set(
    text
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => line.slice(0, line.indexOf("|")))
  );
  const fresh = rows.filter(([id]) => !known.has(id));
  if (fresh.length) {
    const separator = text === "" || text.endsWith("\n") ? "" : "\n";
    writeFileSync(
      file,
      `${text}${separator}${fresh.map(([id, value]) => `${id}|${value}`).join("\n")}\n`
    );
    count += fresh.length;
  }
}
console.log(`${count} translations added`);
if (problems.length) {
  console.error(`${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
