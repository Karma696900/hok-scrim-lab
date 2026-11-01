#!/usr/bin/env node
// Runs the browser tests (Playwright) one after the other, keeps going after a failure and ends with
// the list of what failed, so one broken script does not hide the others.
//   node src/testing/run-e2e.mjs                 every browser test (the *.e2e.mjs files, each one next to the code it checks)
//   node src/testing/run-e2e.mjs draft history   only those (the names of the files, without .e2e.mjs)
// Needs MySQL (docker compose up -d mysql) and the Playwright browser. The scripts that only produce
// pictures for a human to look at (scripts/dev: screenshots, export-preview, video-frame) are not tests.
import { spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const TESTS = [
  "app",
  "ready",
  "shell",
  "overview-layout",
  "api",
  "series-teams",
  "tier-lists",
  "heroes",
  "search-typing",
  "skeleton",
  "hero-editor",
  "hero-lanes",
  "hero-aliases",
  "hero-sheet-live",
  "tournaments",
  "tournament-lanes",
  "tournament-suggest",
  "catalog",
  "build-lab",
  "gamedata",
  "gamedata-pages",
  "legal",
  "stat-conditions",
  "translations",
  "item-categories",
  "guides",
  "combos",
  "ratings",
  "tier-list-public",
  "popular",
  "reflex",
  "training-extras",
  "space",
  "draft",
  "draft-settle",
  "edit-draft",
  "history",
  "export",
  "xss",
  "xss-crawl",
  "teams",
  "community",
  "discord-team",
  "auth",
  "onboarding",
  "training",
  "language",
  "i18n-addresses",
  "simulation",
  "ssr",
  "first-paint",
  "contrast",
  "hit-test",
  "layout-lint",
  "frames"
];

const names = process.argv.slice(2).length ? process.argv.slice(2) : TESTS;
const SOURCES = path.resolve(import.meta.dirname, "..");
const found = new Map();
const scan = directory => {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      scan(full);
    } else if (entry.endsWith(".e2e.mjs")) {
      const name = entry.slice(0, -".e2e.mjs".length);
      if (found.has(name)) {
        throw new Error("two browser tests are named " + name);
      }
      found.set(name, full);
    }
  }
};
scan(SOURCES);
const missing = [...found.keys()].filter(name => !TESTS.includes(name));
if (missing.length) {
  console.log("not in the list of run-e2e.mjs, so not run: " + missing.join(", "));
}
const results = [];

for (const name of names) {
  const started = Date.now();
  const code = await new Promise(resolve => {
    const child = spawn(
      process.execPath,
      [found.get(name) ?? path.join(SOURCES, `${name}.e2e.mjs`)],
      {
        stdio: "inherit",
        env: process.env
      }
    );
    child.on("close", resolve);
    child.on("error", () => resolve(1));
  });
  results.push({ name, code, seconds: Math.round((Date.now() - started) / 1000) });
}

console.log("\nBrowser tests");
for (const { name, code, seconds } of results) {
  console.log(`  ${code === 0 ? "ok    " : "FAILED"}  ${name} (${seconds} s)`);
}
const failed = results.filter(result => result.code !== 0);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
