#!/usr/bin/env node
// A picture of a page of a running instance, as a visitor or as one of the people of the demonstration world
// (scripts/dev/demo-data.mjs). Used to look at a page for real: voids, overflow, contrast, the right-to-left
// layout, the phone width.
//   node scripts/dev/shot.mjs <out.png> <path> [--as captain] [--width 1440] [--height 900] [--theme dark|light]
//                           [--lang en] [--url http://localhost:3000] [--sessions <file>] [--viewport-only]
// --as is a key of the sessions file written by `node scripts/dev/demo-data.mjs seed` (captain, admin, …); without
// it the page is opened as a visitor. Console errors and warnings of the page are printed.
// In Git Bash on Windows, start the command with MSYS_NO_PATHCONV=1 (it would turn a path such as / into C:/Program Files/Git/).
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const [out, route] = process.argv.slice(2);
const option = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};
if (!out || !route || out.startsWith("--")) {
  console.error(
    "usage: node scripts/dev/shot.mjs <out.png> <path> [--as <person>] [--width N] [--theme dark|light] [--lang xx]"
  );
  process.exit(2);
}
const base = option("url", "http://localhost:3000");
const person = option("as", null);
const sessionsFile = option("sessions", path.join(tmpdir(), "hok-demo-sessions.json"));

const cookies = [{ name: "hok_theme", value: option("theme", "dark"), url: base }];
if (person) {
  const sessions = JSON.parse(readFileSync(sessionsFile, "utf8"));
  if (!sessions[person]) {
    console.error(
      `no "${person}" in ${sessionsFile} (it has: ${Object.keys(sessions).join(", ")})`
    );
    process.exit(2);
  }
  cookies.push({ name: "hok_session", value: sessions[person].cookie, url: base });
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: Number(option("width", 1440)), height: Number(option("height", 900)) },
    locale: option("lang", "en")
  });
  await context.addCookies(cookies);
  const page = await context.newPage();
  const problems = [];
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) {
      problems.push(message.text().slice(0, 160));
    }
  });
  page.on("pageerror", error => problems.push(`pageerror ${error.message.slice(0, 160)}`));
  await page.goto(base + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500); // the entrance animations
  await page.screenshot({ path: out, fullPage: !process.argv.includes("--viewport-only") });
  if (problems.length) {
    console.log(`console: ${problems.join(" | ")}`);
  }
} finally {
  await browser.close();
}
