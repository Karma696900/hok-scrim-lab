// Browser check of series files: export button next to every series (Scrims, Overview, History),
// dialog with comment + file name, PDF and PNG downloads, import back, and the 100-series message.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { extractFromPdf, extractFromPng } from "../../../server/features/series/series-file.js";
import { startTestServer } from "../../../testing/test-app.js";
import { goNav } from "../../../testing/nav.js";

const app = await startTestServer();
const me = await app.signIn("Exporter");
const ids = (from, count) =>
  Array.from({ length: count }, (_, index) => `h${String(from + index).padStart(2, "0")}`);
await me.browser.post("/api/series/import", {
  teamA: { name: "Alpha" },
  teamB: { name: "Bravo" },
  bestOf: 1,
  gameMode: "free-for-all",
  games: [
    {
      blueTeam: "Alpha",
      redTeam: "Bravo",
      winner: "Alpha",
      durationSeconds: 1500,
      draft: {
        bans: { blue: ids(21, 5), red: ids(26, 5) },
        picks: { blue: ids(1, 5), red: ids(11, 5) }
      }
    }
  ]
});

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true
});
await context.addCookies([
  { name: "hok_session", value: me.browser.jar.get("hok_session"), url: app.baseUrl }
]);
const page = await context.newPage();
page.on("console", message => {
  if (message.text().includes("status of 400")) {
    return;
  }
  /* the refused foreign PDF is expected */ if (["error", "warning"].includes(message.type())) {
    problems.push(`console.${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
await page.route("https://camp.honorofkings.com/**", route =>
  route.fulfill({ status: 200, contentType: "image/png", body: pixel })
);

await page.goto(app.baseUrl);
await page.waitForSelector(".nav-link");

// The button exists next to the series on the pages that list them (Scrims, History).
await goNav(page, '.nav-link:has-text("Scrims")');
await page.waitForSelector(".series-item");
check(
  "Scrims: an export button sits next to each series",
  (await page.locator(".series-item .series-export").count()) >= 1
);
await page.goto(`${app.baseUrl}/history`);
await page.waitForSelector(".series-item");
check(
  "History: an export button sits next to each series",
  (await page.locator(".series-item .series-export").count()) >= 1
);

// Dialog: name, comment, format; PDF download.
await page.click(".series-item .series-export");
await page.waitForSelector("#export-dialog[open]");
check(
  "the dialog proposes Team_vs_Team_BOn as file name",
  (await page.inputValue("#export-filename")) === "Alpha_vs_Bravo_BO1"
);
await page.fill("#export-filename", "Finale Nova vs Orion");
await page.fill("#export-comment", "Round 1 – bon draft\nA retravailler: les bans");
check(
  "the comment counter follows",
  /\d+ \/ 500/.test(await page.locator("#export-count").innerText())
);
const [pdfDownload] = await Promise.all([
  page.waitForEvent("download", { timeout: 90000 }),
  page.click('#export-form button[type="submit"]')
]);
check("the PDF is named as asked", pdfDownload.suggestedFilename() === "Finale Nova vs Orion.pdf");
const pdfBytes = readFileSync(await pdfDownload.path());
check("it is a PDF", pdfBytes.subarray(0, 5).toString() === "%PDF-" && pdfBytes.length > 5000);
const pdfEnvelope = await extractFromPdf(pdfBytes);
check(
  "the comment is stored in the file and the series can be restored",
  pdfEnvelope.comment.startsWith("Round 1 – bon draft") && pdfEnvelope.series[0].games.length === 1
);
await page.waitForFunction(() => !document.querySelector("#export-dialog[open]"));
check("the dialog closes after the download", true);

// PNG.
await page.click(".series-item .series-export");
await page.waitForSelector("#export-dialog[open]");
await page.check('input[name="format"][value="png"]');
await page.fill("#export-filename", "recap");
await page.fill("#export-comment", "png note");
const [pngDownload] = await Promise.all([
  page.waitForEvent("download", { timeout: 90000 }),
  page.click('#export-form button[type="submit"]')
]);
check("the PNG is named as asked", pngDownload.suggestedFilename() === "recap.png");
const pngBytes = readFileSync(await pngDownload.path());
check(
  "it is a PNG that carries the series",
  pngBytes.subarray(1, 4).toString() === "PNG" && extractFromPng(pngBytes).comment === "png note"
);

// No JSON downloads anywhere on the series board.
await goNav(page, '.nav-link:has-text("Scrims")');
await page.click(".series-item .series-row");
await page.waitForSelector(".scoreboard");
const board = await page.locator("main").innerText();
check(
  "the series board offers PDF/PNG export and no JSON download",
  /Export PDF \/ PNG/i.test(board) && !/JSON/i.test(board.replace(/\s+/g, " "))
);

// Import back from the generated files.
await goNav(page, '.nav-link:has-text("Scrims")');
await page.waitForSelector('[data-action="import-series"]');
await page.click('[data-action="import-series"]');
await page.waitForSelector("#series-import-file", { state: "attached" });
check(
  "the import picker accepts PDF and PNG only",
  (await page.getAttribute("#series-import-file", "accept")).includes("pdf") &&
    !(await page.getAttribute("#series-import-file", "accept")).includes("json")
);
await page.setInputFiles("#series-import-file", await pdfDownload.path());
await page
  .waitForFunction(
    () => /Alpha/i.test(document.querySelector(".scoreboard")?.innerText ?? ""),
    null,
    { timeout: 15000 }
  )
  .catch(() => {});
await page
  .waitForFunction(
    () => /Alpha/i.test(document.querySelector(".scoreboard")?.innerText ?? ""),
    null,
    { timeout: 15000 }
  )
  .catch(() => {});
check(
  "importing the PDF opens the restored series",
  /Alpha/i.test(await page.locator(".scoreboard").innerText())
);
await page.click('[data-action="back-series"]');
await page.setInputFiles("#series-import-file", await pngDownload.path());
await page.waitForFunction(() =>
  /1 series imported/.test(document.querySelector("#toasts")?.textContent ?? "")
);
check("importing the PNG works too", true);
await goNav(page, '.nav-link:has-text("Scrims")');
await page.setInputFiles("#series-import-file", {
  name: "fake.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4 not ours")
});
await page.waitForFunction(() =>
  /does not contain HOK series data|cannot be read/.test(
    document.querySelector("#toasts")?.textContent ?? ""
  )
);
check("a foreign PDF is refused with a clear message", true);

// History bulk export: > 100 series.
const now = new Date().toISOString();
for (let index = 0; index < 101; index += 1) {
  await app.store.createSeries(
    {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      teamA: { name: `M${index}a` },
      teamB: { name: `M${index}b` },
      bestOf: 1,
      winsRequired: 1,
      gameMode: "free-for-all",
      draftMode: "solo",
      status: "active",
      games: [],
      currentGame: null
    },
    me.user.id
  );
}
await goNav(page, '.nav-link:has-text("Overview")');
await page.goto(`${app.baseUrl}/history`);
await page.waitForSelector(".export-note");
check(
  "over 100 series the message is the exact one",
  (await page.locator(".export-note").innerText()).trim() ===
    "100 series maximum per export. Narrow the date range or filters."
);
check(
  "and the bulk export button is disabled",
  await page.locator('[data-action="export-pdf"]').isDisabled()
);
await page.fill('input[name="q"]', "M5a");
await page.click('.history-filters button[type="submit"]');
await page.waitForFunction(() => !document.querySelector(".export-note"));
check(
  "narrowing the filters re-enables it",
  await page.locator('[data-action="export-pdf"]').isEnabled()
);

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nexport e2e clean");
process.exit(problems.length ? 1 : 0);
