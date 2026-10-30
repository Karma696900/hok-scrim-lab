// Visual review helper for the PDF template: renders the report HTML in print media and saves PNGs.
//   node scripts/dev/export-preview.mjs <output-directory>
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { renderExportHtml } from "../../src/server/features/export/report-template.js";
import { PIXEL_PNG } from "../../src/testing/test-app.js";

const output = process.argv[2] || "export-preview";
mkdirSync(output, { recursive: true });
const ids = (from, count) =>
  Array.from({ length: count }, (_, index) => `h${String(from + index).padStart(2, "0")}`);
const heroById = new Map(
  ids(1, 30).map((id, index) => [
    id,
    {
      id,
      name: index === 2 ? "Flowborn (Mage)" : `Hero ${id}`,
      displayName: index === 2 ? "Flowborn" : `Hero ${id}`
    }
  ])
);
const game = number => ({
  gameNumber: number,
  blueTeam: number % 2 ? "Nova Esports" : "Orion Five",
  redTeam: number % 2 ? "Orion Five" : "Nova Esports",
  winner: "Nova Esports",
  durationSeconds: 1500 + number * 37,
  draft: {
    bans: { blue: ids(21, 5), red: ids(26, 5) },
    picks: { blue: ids(1, 5), red: ids(11, 5) },
    pickAssignments: {
      blue: ids(1, 5).map((heroId, index) => ({
        heroId,
        lane: ["Mid Lane", "Clash Lane", "Jungle", "Farm Lane", "Roamer"][index]
      })),
      red: []
    }
  }
});
const series = ["Nova Esports", "Zenith"].map((name, index) => ({
  id: `s${index}`,
  teamA: { name },
  teamB: { name: "Orion Five" },
  bestOf: 5,
  winsRequired: 3,
  gameMode: index ? "free-for-all" : "global-ban-pick",
  status: "complete",
  updatedAt: "2026-09-30T10:00:00.000Z",
  createdAt: "2026-09-29T10:00:00.000Z",
  games: [game(1), game(2), game(3)],
  currentGame: null
}));
const html = renderExportHtml({
  generatedAt: "2026-10-01 10:00 UTC",
  ownerName: "Coach",
  filters: { status: "complete", from: "2026-09-01" },
  series,
  heroById,
  portraitPath: id => (Number(id.slice(1)) % 4 ? "/portraits/x" : null)
});

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 794, height: 1123 },
  javaScriptEnabled: false
});
await context.route("http://pdf.local/**", route => {
  const url = new URL(route.request().url());
  if (url.pathname === "/export.html") {
    return route.fulfill({ contentType: "text/html", body: html });
  }
  if (url.pathname.startsWith("/portraits/")) {
    return route.fulfill({ contentType: "image/png", body: PIXEL_PNG });
  }
  if (url.pathname === "/logo.svg") {
    return route.fulfill({
      contentType: "image/svg+xml",
      body: readFileSync("src/public/logo.svg")
    });
  }
  if (url.pathname.startsWith("/fonts/")) {
    return route.fulfill({
      contentType: url.pathname.endsWith(".css") ? "text/css" : "font/woff2",
      body: readFileSync(join("src/public", url.pathname))
    });
  }
  return route.fulfill({ status: 404, body: "" });
});
const page = await context.newPage();
await page.emulateMedia({ media: "print" });
await page.goto("http://pdf.local/export.html", { waitUntil: "networkidle" });
await page.screenshot({ path: join(output, "report.png"), fullPage: true });
await browser.close();
console.log("saved", join(output, "report.png"));
