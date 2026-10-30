#!/usr/bin/env node
// Lighthouse (mobile and desktop) on EVERY page of the application, the ones that need a session
// included. It starts the demonstration instance of scripts/performance/demo-instance.mjs
// on the built bundle (the pages of visitors drawn by the server, like production), then runs Lighthouse
// on each page in a Chrome whose profile holds the session cookie of the account that opens it.
//   npm run build
//   HOK_TEST_BUILT=true node scripts/performance/lighthouse-pages.mjs <folder> [--only=<regex on the page name>] [--presets=mobile,desktop]
// The reports are written in <folder> as <page>-<preset>.report.json and summed up in a table at the end.
// The session is a real cookie of the browser: the cookie sent as an extra header (--extra-headers) does
// not reach the requests the page preloads, which then answer 401 and cost "best practices" points that
// no visitor would lose. The browser cache is emptied before every run.
// Needs Google Chrome (CHROME_PATH), MySQL (docker compose up -d mysql) and internet for the first
// `npx lighthouse` download. Run it alone: anything else using the machine moves the scores. Not part
// of `npm test`.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const folder = process.argv[2];
if (!folder || folder.startsWith("--")) {
  console.error("usage: node scripts/performance/lighthouse-pages.mjs <folder> [--only=<regex>]");
  process.exit(2);
}
const option = name =>
  process.argv
    .slice(3)
    .find(item => item.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const only = option("only") ? new RegExp(option("only")) : null;
const presets = (option("presets") ?? "mobile,desktop").split(",");
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DEBUGGING_PORT = 9333;
const world = path.join(folder, "world");
mkdirSync(world, { recursive: true });

// ---- the instance, with all its demonstration data
const server = spawn(process.execPath, ["scripts/performance/demo-instance.mjs", world], {
  env: { ...process.env, HOK_TEST_BUILT: "true" },
  stdio: ["pipe", "pipe", "inherit"]
});
const address = await new Promise((resolve, reject) => {
  let output = "";
  server.stdout.on("data", chunk => {
    output += chunk;
    const ready = output.match(/READY (http:\/\/\S+)/);
    if (ready) {
      resolve(ready[1]);
    }
  });
  server.on("exit", code =>
    reject(new Error(`the instance stopped (${code}) before it was ready`))
  );
});
console.log(`instance ready at ${address}`);
const { pages } = JSON.parse(readFileSync(path.join(world, "world.json"), "utf8"));

// ---- the browser Lighthouse drives: started here, its profile keeps the session between two runs
const chromeProcess = spawn(
  chrome,
  [
    "--headless=new",
    `--remote-debugging-port=${DEBUGGING_PORT}`,
    `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "hok-lh-"))}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-default-apps",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-features=Translate,OptimizationHints,MediaRouter",
    "--metrics-recording-only",
    "--mute-audio",
    "--password-store=basic",
    "--use-mock-keychain",
    "about:blank"
  ],
  { stdio: "ignore" }
);
for (let attempt = 0; ; attempt += 1) {
  const answers = await fetch(`http://127.0.0.1:${DEBUGGING_PORT}/json/version`).then(
    response => response.ok,
    () => false
  );
  if (answers) {
    break;
  }
  if (attempt > 100) {
    throw new Error("Chrome did not open its debugging port");
  }
  await new Promise(resolve => setTimeout(resolve, 200));
}

/** Gives the browser the cookies of the visitor or account that opens a page, and an empty cache. */
async function prepareBrowser(page) {
  const connection = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUGGING_PORT}`);
  const [context] = connection.contexts();
  await context.clearCookies();
  // the language and the theme of the capture (otherwise the language of the machine is used), and
  // the session of the account that opens the page, if there is one
  const cookies = [
    ["hok_lang", "en"],
    ["hok_theme", "dark"]
  ];
  if (page.cookie) {
    const separator = page.cookie.indexOf("=");
    cookies.unshift([page.cookie.slice(0, separator), page.cookie.slice(separator + 1)]);
  }
  await context.addCookies(cookies.map(([name, value]) => ({ name, value, url: address })));
  const tab = context.pages()[0] ?? (await context.newPage());
  await (await context.newCDPSession(tab)).send("Network.clearBrowserCache");
  await connection.close(); // disconnects: Chrome keeps running
}

/** Runs a command and waits for it, with a limit (a measurement that hangs is reported, not waited for). */
const run = (command, limitMs) =>
  new Promise(resolve => {
    const child = spawn(command, { shell: true, stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill();
      resolve("timeout");
    }, limitMs);
    child.on("exit", code => {
      clearTimeout(timer);
      resolve(code);
    });
  });

// ---- Lighthouse, page after page
const selected = pages.filter(page => !only || only.test(page.name));
for (const page of selected) {
  for (const preset of presets) {
    await prepareBrowser(page);
    const report = path.join(folder, `${page.name}-${preset}.report.json`);
    const command = [
      "npx --yes lighthouse@12",
      `"${address}${page.path}"`,
      preset === "desktop" ? "--preset=desktop" : "",
      // the page that is not found answers 404 on purpose: it is measured, not refused
      page.name === "not-found" ? "--ignore-status-code" : "",
      `--port=${DEBUGGING_PORT} --hostname=127.0.0.1 --disable-storage-reset`,
      `--output=json --output-path="${report}" --quiet`
    ]
      .filter(Boolean)
      .join(" ");
    const code = await run(command, 240000);
    console.log(`${code === 0 ? "ok  " : `FAIL (${code})`} ${page.name} (${preset}) ${page.path}`);
  }
}
chromeProcess.kill();
// the instance closes itself (it drops its database); killed from outside, it would leave it behind
server.stdin.write("quit\n");
await new Promise(resolve => {
  const late = setTimeout(() => {
    server.kill();
    resolve();
  }, 20_000);
  server.once("exit", () => {
    clearTimeout(late);
    resolve();
  });
});
spawnSync(process.execPath, [path.join(import.meta.dirname, "lighthouse-summary.mjs"), folder], {
  stdio: "inherit"
});
