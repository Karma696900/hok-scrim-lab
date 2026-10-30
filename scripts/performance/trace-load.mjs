#!/usr/bin/env node
// Why is a page slow to load? Opens pages of the demonstration instance in a phone whose processor is slowed down 4
// times (what Lighthouse's mobile preset does), while Chrome traces the renderer, and says:
//   - the first and the largest contentful paint, and a stand-in for the total blocking time: the part over 50 ms of
//     every task that starts after the first contentful paint (the MINIMUM of several runs: one run varies by a factor
//     of three, the median of three runs is no better);
//   - the biggest tasks, and what each is made of (style, layout, script);
//   - with --why, which function of the page invalidated the style, how often (a write on <html> that changes nothing
//     still restyles the whole page, and shows up here).
//   --init <file> runs that script in the page before any of its own (to switch a behaviour off and see what it costs).
//   --css-extra <file> appends the rules of that file to the stylesheet while measuring: try a CSS change without a rebuild.
//   npm run build
//   HOK_TEST_BUILT=true node scripts/performance/trace-load.mjs <folder> <page>[,<page>…] [--runs 5] [--why] [--css-extra <file>]
// The pages are the names of scripts/dev/demo-data.mjs (`demoPages`): home, heroes, hero-sheet, settings…; <folder> is
// where the instance writes its world. Needs MySQL and Chromium; run it with nothing else on the machine.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [folder, pageList] = process.argv.slice(2);
if (!folder || !pageList || folder.startsWith("--")) {
  console.error(
    "usage: node scripts/performance/trace-load.mjs <folder> <page>[,<page>…] [--runs 5] [--why]"
  );
  process.exit(2);
}
const option = name => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : undefined;
};
const runs = Number(option("runs") ?? 5);
const why = process.argv.includes("--why");
const initFile = option("init");
const cssExtraFile = option("css-extra");
const cssExtra = cssExtraFile ? readFileSync(cssExtraFile, "utf8") : "";

// ---- the instance (the built bundle, a throw-away database with the real roster and the demonstration world)
const instance = spawn(process.execPath, ["scripts/performance/demo-instance.mjs", folder], {
  env: { ...process.env, HOK_TEST_BUILT: "true" },
  stdio: ["pipe", "pipe", "inherit"]
});
let output = "";
await new Promise((resolve, reject) => {
  instance.stdout.on("data", chunk => {
    output += chunk;
    if (/READY /.test(output)) {
      resolve();
    }
  });
  instance.on("exit", code =>
    reject(new Error(`the instance stopped (${code}) before it was ready`))
  );
});
const address = /READY (\S+)/.exec(output)[1];
const { pages } = JSON.parse(readFileSync(path.join(folder, "world.json"), "utf8"));

const browser = await chromium.launch();
const CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "v8.execute",
  "blink.user_timing",
  ...(why
    ? [
        "disabled-by-default-devtools.timeline.invalidationTracking",
        "disabled-by-default-devtools.timeline.stack"
      ]
    : [])
];

/** One load of a page, traced; returns the events of the main thread of the renderer. */
async function trace(entry) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  if (entry.cookie) {
    const [name, ...value] = entry.cookie.split("=");
    await context.addCookies([{ name, value: value.join("="), url: address }]);
  }
  if (cssExtra) {
    await context.route(/\/dist\/styles-[^/]*\.css$/, async route => {
      const response = await route.fetch();
      const headers = Object.fromEntries(
        Object.entries(response.headers()).filter(
          ([name]) => !["content-encoding", "content-length"].includes(name)
        )
      );
      await route.fulfill({
        status: response.status(),
        headers,
        body: `${await response.text()}\n${cssExtra}`
      });
    });
  }
  const page = await context.newPage();
  if (initFile) {
    await page.addInitScript({ path: initFile });
  }
  const client = await context.newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await browser.startTracing(page, { categories: CATEGORIES });
  await page.goto(`${address}${entry.path}`, { waitUntil: "load" });
  await page.waitForSelector("html[data-ready='1']", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3200);
  const events = JSON.parse((await browser.stopTracing()).toString("utf8")).traceEvents;
  await context.close();
  const threads = new Set(
    events
      .filter(event => event.name === "thread_name" && event.args?.name === "CrRendererMain")
      .map(event => `${event.pid}:${event.tid}`)
  );
  return events.filter(event => threads.has(`${event.pid}:${event.tid}`) && event.ts);
}

/** The numbers of one load. */
function measure(events) {
  const complete = events.filter(event => event.ph === "X").sort((a, b) => a.ts - b.ts);
  const start = complete[0].ts;
  const paint = name => events.filter(event => event.name === name).pop();
  const first = paint("firstContentfulPaint")?.ts ?? start;
  const largest = paint("largestContentfulPaint::Candidate")?.ts;
  const tasks = complete.filter(event => event.name === "RunTask" && event.ts >= first);
  const total = name =>
    complete.filter(event => event.name === name).reduce((sum, event) => sum + event.dur / 1000, 0);
  return {
    fcp: Math.round((first - start) / 1000),
    lcp: largest ? Math.round((largest - start) / 1000) : null,
    blocking: Math.round(tasks.reduce((sum, task) => sum + Math.max(0, task.dur / 1000 - 50), 0)),
    long: tasks.filter(task => task.dur > 50000).length,
    layout: Math.round(total("Layout")),
    style: Math.round(total("UpdateLayoutTree"))
  };
}

/** The tasks over 50 ms, with the biggest things inside each. */
function bigTasks(events) {
  const complete = events.filter(event => event.ph === "X").sort((a, b) => a.ts - b.ts);
  const start = complete[0].ts;
  const lines = [];
  for (const task of complete.filter(event => event.name === "RunTask" && event.dur > 50000)) {
    const inside = complete.filter(
      event =>
        event !== task &&
        event.name !== "RunTask" &&
        event.ts >= task.ts &&
        event.ts + event.dur <= task.ts + task.dur
    );
    const top = [];
    let end = -1;
    for (const event of inside) {
      if (event.ts >= end) {
        top.push(event);
        end = event.ts + event.dur;
      }
    }
    const parts = new Map();
    for (const event of top) {
      const script = event.args?.data?.url ? ` ${event.args.data.url.split("/").pop()}` : "";
      const label = `${event.name}${script}`;
      parts.set(label, (parts.get(label) ?? 0) + event.dur / 1000);
    }
    const summary = [...parts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label, ms]) => `${label} ${Math.round(ms)}`)
      .join(" | ");
    lines.push(
      `  ${String(Math.round((task.ts - start) / 1000)).padStart(5)} ms  ${String(Math.round(task.dur / 1000)).padStart(4)} ms  ${summary}`
    );
  }
  return lines;
}

/** Which functions of the page invalidated style, by how many invalidations. */
function invalidators(events) {
  const callers = new Map();
  for (const event of events) {
    if (!/InvalidationTracking|ScheduleStyleRecalculation/.test(event.name)) {
      continue;
    }
    const frame = event.args?.data?.stackTrace?.[0];
    if (frame) {
      const where = `${frame.functionName || "(anonymous)"} ${String(frame.url ?? "")
        .split("/")
        .pop()}:${frame.lineNumber}`;
      callers.set(where, (callers.get(where) ?? 0) + 1);
    }
  }
  return [...callers].sort((a, b) => b[1] - a[1]).slice(0, 8);
}

console.log(
  "page            first  largest  blocking*  long tasks  layout  style    (ms, processor 4x slower; minimum of the runs; * = excess over 50 ms of the tasks after the first paint)"
);
try {
  for (const name of pageList.split(",")) {
    const entry = pages.find(item => item.name === name);
    if (!entry) {
      console.log(`${name}: no such page in the demonstration world`);
      continue;
    }
    const results = [];
    let lastEvents = null;
    for (let run = 0; run < runs; run += 1) {
      lastEvents = await trace(entry);
      results.push(measure(lastEvents));
    }
    const best = key => Math.min(...results.map(result => result[key] ?? Infinity));
    console.log(
      `${name.padEnd(15)} ${String(best("fcp")).padStart(5)} ${String(best("lcp")).padStart(8)} ${String(best("blocking")).padStart(10)} ${String(best("long")).padStart(11)} ${String(best("layout")).padStart(7)} ${String(best("style")).padStart(6)}    blocking of each run: ${results.map(result => result.blocking).join(", ")}`
    );
    if (why) {
      for (const line of bigTasks(lastEvents)) {
        console.log(line);
      }
      for (const [where, count] of invalidators(lastEvents)) {
        console.log(`  style invalidated ${String(count).padStart(5)} times by ${where}`);
      }
    }
  }
} finally {
  await browser.close();
  instance.stdin.write("quit\n");
  await new Promise(resolve => instance.on("exit", resolve));
}
