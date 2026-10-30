#!/usr/bin/env node
// Layout shifts of one page on a phone-sized viewport: which element moved, when
// and how much.
//   node scripts/performance/cls-probe.mjs /heroes/116 [base]
import { chromium } from "playwright";
const [path = "/", base = "http://localhost:3111"] = process.argv.slice(2);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 2,
  isMobile: true
});
const page = await context.newPage();
await page.addInitScript(() => {
  window.__shifts = [];
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) {
        continue;
      }
      window.__shifts.push({
        t: Math.round(entry.startTime),
        value: Number(entry.value.toFixed(4)),
        sources: entry.sources.map(
          source =>
            `${source.node?.nodeName?.toLowerCase()}${source.node?.className ? "." + String(source.node.className).split(" ")[0] : ""} ${Math.round(source.previousRect.y)}→${Math.round(source.currentRect.y)} h${Math.round(source.previousRect.height)}→${Math.round(source.currentRect.height)}`
        )
      });
    }
  }).observe({ type: "layout-shift", buffered: true });
});
await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const shifts = await page.evaluate(() => window.__shifts);
console.log(
  shifts.length
    ? shifts.map(shift => `${shift.t} ms  ${shift.value}  ${shift.sources.join(" | ")}`).join("\n")
    : "no layout shift"
);
console.log("total", shifts.reduce((sum, shift) => sum + shift.value, 0).toFixed(4));
await browser.close();
