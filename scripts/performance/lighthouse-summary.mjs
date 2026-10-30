#!/usr/bin/env node
// A folder of Lighthouse reports as one table: the four scores, the largest contentful paint, the
// layout shift and the blocking time of every page and preset, the lowest of each category, and every
// audit that still costs points.
//   node scripts/performance/lighthouse-summary.mjs <folder of *.report.json>
// The report files are named <page>-<mobile|desktop>.report.json (scripts/performance/lighthouse-pages.mjs).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const folder = process.argv[2];
if (!folder) {
  console.error("usage: node scripts/performance/lighthouse-summary.mjs <folder of reports>");
  process.exit(2);
}

const rows = [];
const costly = [];
const withoutResult = [];
for (const file of readdirSync(folder)
  .filter(name => name.endsWith(".report.json"))
  .sort()) {
  const report = JSON.parse(readFileSync(path.join(folder, file), "utf8"));
  if (report.runtimeError || !report.categories?.performance) {
    withoutResult.push(`${file}: ${report.runtimeError?.message ?? "no result"}`);
    continue;
  }
  const score = key => Math.round((report.categories[key]?.score ?? 0) * 100);
  const page = file.replace(/-(mobile|desktop)\.report\.json$/, "");
  const preset = report.configSettings.formFactor;
  rows.push({
    page,
    preset,
    performance: score("performance"),
    accessibility: score("accessibility"),
    best: score("best-practices"),
    seo: score("seo"),
    lcp: Math.round(report.audits["largest-contentful-paint"].numericValue),
    cls: report.audits["cumulative-layout-shift"].numericValue,
    tbt: Math.round(report.audits["total-blocking-time"].numericValue)
  });
  for (const [key, category] of Object.entries(report.categories)) {
    for (const ref of category.auditRefs) {
      const audit = report.audits[ref.id];
      if (ref.weight > 0 && audit.score !== null && audit.score < 1) {
        costly.push(
          `${page} (${preset}) [${key}] ${ref.id} score=${audit.score} weight=${ref.weight} ${audit.displayValue ?? ""}`.trimEnd()
        );
      }
    }
  }
}

if (!rows.length) {
  console.error(`no report with a result in ${folder}`);
  process.exit(1);
}
const width = Math.max(...rows.map(row => row.page.length), 4);
console.log("page".padEnd(width), "preset".padEnd(8), "perf acc best seo   LCP(ms)  CLS    TBT");
for (const row of rows) {
  console.log(
    row.page.padEnd(width),
    row.preset.padEnd(8),
    String(row.performance).padStart(4),
    String(row.accessibility).padStart(3),
    String(row.best).padStart(4),
    String(row.seo).padStart(3),
    String(row.lcp).padStart(9),
    row.cls.toFixed(3).padStart(6),
    String(row.tbt).padStart(4)
  );
}
for (const preset of ["desktop", "mobile"]) {
  const own = rows.filter(row => row.preset === preset);
  if (!own.length) {
    continue;
  }
  const lowest = key => Math.min(...own.map(row => row[key]));
  console.log(
    `\n${preset}: ${own.length} pages, lowest performance ${lowest("performance")}, accessibility ${lowest("accessibility")}, best practices ${lowest("best")}, SEO ${lowest("seo")}; worst LCP ${Math.max(...own.map(row => row.lcp))} ms, worst CLS ${Math.max(...own.map(row => row.cls)).toFixed(3)}, worst TBT ${Math.max(...own.map(row => row.tbt))} ms`
  );
}
if (withoutResult.length) {
  console.log(`\n${withoutResult.length} runs without a result:`);
  for (const line of withoutResult) {
    console.log(`  ${line.slice(0, 200)}`);
  }
}
console.log(`\n${costly.length} audits that cost points:`);
for (const line of costly) {
  console.log(`  ${line}`);
}
