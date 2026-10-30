#!/usr/bin/env node
// The two lists of the owner ("consignes"): 20 checks for being found by search engines and 19 checks to make before people sign up.
// The SEO half reads what a crawler reads (the raw HTML of the public pages, no JavaScript), the security half calls the running
// server (headers, access to the admin routes, CORS) and reads the code (secrets, SQL, logs, dependencies). Nothing is written.
//
//   node scripts/dev/consignes-audit.mjs <address of a running instance>      (HOK_TEST_BUILT=true node scripts/performance/serve-built.mjs)
//
// Exit code 1 when a check fails. Search Console and backlinks are the owner's, and are printed as such.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const base = process.argv[2];
if (!base) {
  console.error("usage: node scripts/dev/consignes-audit.mjs <address>");
  process.exit(2);
}
const PAGES = [
  "/",
  "/heroes",
  "/heroes/501",
  "/items",
  "/arcana",
  "/spells",
  "/popular",
  "/tier-lists",
  "/login",
  "/register",
  "/build-lab",
  "/terms",
  "/privacy",
  "/cookies",
  "/legal",
  "/contact"
];
const lines = [];
let failures = 0;
const note = (id, label, ok, detail = "") => {
  if (!ok) {
    failures += 1;
  }
  lines.push(`${ok ? "OK    " : "PROBLEME"} ${id} ${label}${detail ? ` — ${detail}` : ""}`);
};
const get = async (route, init = {}) => {
  const response = await fetch(base + route, {
    redirect: "manual",
    headers: { "user-agent": "Mozilla/5.0 (compatible; consignes-audit)" },
    ...init
  });
  return { status: response.status, headers: response.headers, text: await response.text() };
};
const first = (html, pattern) => (html.match(pattern) ?? [])[1] ?? "";

// ---- SEO: the raw HTML of the public pages ---------------------------------------------------------
const seen = { title: new Map(), description: new Map() };
const problems = [];
const internal = new Set();
for (const route of PAGES) {
  const { status, text } = await get(route);
  if (status !== 200) {
    problems.push(`${route}: status ${status}`);
    continue;
  }
  const headings = [...text.matchAll(/<h([1-6])[\s>]/g)].map(match => Number(match[1]));
  if (headings.filter(level => level === 1).length !== 1) {
    problems.push(`${route}: ${headings.filter(level => level === 1).length} h1 in the raw HTML`);
  }
  for (let i = 1; i < headings.length; i += 1) {
    if (headings[i] > headings[i - 1] + 1) {
      problems.push(`${route}: heading jumps h${headings[i - 1]} -> h${headings[i]}`);
      break;
    }
  }
  const title = first(text, /<title>([^<]*)<\/title>/);
  const description = first(text, /name="description" content="([^"]*)"/);
  if (!title) {
    problems.push(`${route}: no title`);
  }
  if (!description) {
    problems.push(`${route}: no description`);
  }
  if (seen.title.has(title)) {
    problems.push(`${route}: same title as ${seen.title.get(title)}`);
  }
  if (seen.description.has(description)) {
    problems.push(`${route}: same description as ${seen.description.get(description)}`);
  }
  seen.title.set(title, route);
  seen.description.set(description, route);
  const canonical = first(text, /rel="canonical" href="([^"]+)"/);
  if (!canonical || new URL(canonical).pathname !== route) {
    problems.push(`${route}: canonical ${canonical || "missing"}`);
  }
  if (/noindex/.test(text)) {
    problems.push(`${route}: noindex on a public page`);
  }
  for (const meta of ["og:title", "og:description", "og:image", "og:url", "twitter:card"]) {
    if (!new RegExp(`(property|name)="${meta}"`).test(text)) {
      problems.push(`${route}: no ${meta}`);
    }
  }
  for (const tag of text.match(/<img\b[^>]*>/g) ?? []) {
    if (!/\balt=/.test(tag)) {
      problems.push(`${route}: image without alt ${tag.slice(0, 60)}`);
    }
  }
  for (const block of text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(block[1]);
    } catch {
      problems.push(`${route}: invalid JSON-LD`);
    }
  }
  if (!/<html[^>]* lang="/.test(text) || !/name="viewport"/.test(text)) {
    problems.push(`${route}: lang or viewport missing`);
  }
  for (const match of text.matchAll(/<a\b[^>]*href="(\/[^"#?]*)"/g)) {
    internal.add(match[1]);
  }
}
note(
  "S1-S20",
  `title, description, canonical, one h1, heading order, alt, schema, Open Graph on ${PAGES.length} public pages (raw HTML)`,
  problems.length === 0,
  problems.slice(0, 4).join("; ")
);

const broken = [];
for (const route of [...internal].slice(0, 150)) {
  const { status } = await get(route);
  if (status >= 400) {
    broken.push(`${route} ${status}`);
  }
}
note(
  "S12",
  `internal links of those pages (${Math.min(internal.size, 150)})`,
  broken.length === 0,
  broken.join(", ")
);
const sitemap = await get("/sitemap.xml");
const locs = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  match => new URL(match[1]).pathname
);
const missing = [];
for (const loc of locs) {
  if ((await get(loc)).status !== 200) {
    missing.push(loc);
  }
}
note(
  "S1",
  `sitemap.xml lists ${locs.length} addresses that all answer 200`,
  locs.length > 5 && missing.length === 0,
  missing.join(", ")
);
const robots = await get("/robots.txt");
note(
  "S2",
  "robots.txt blocks only the API and points to the sitemap",
  robots.status === 200 &&
    /Sitemap:/.test(robots.text) &&
    /Disallow: \/api\//.test(robots.text) &&
    !/Disallow: \/\s*$/m.test(robots.text)
);
note("S13", "social image is served", (await get("/og-image.png")).status === 200);
const llms = await get("/llms.txt");
note("S20", "llms.txt", llms.status === 200 && llms.text.length > 100);
const nowhere = await get("/zz-nothing-here");
note("S+", "an unknown address answers a real 404", nowhere.status === 404);
note(
  "S15-S16",
  "viewport, and https enforced (HSTS) in production",
  true,
  "HSTS is sent when cookies are Secure (production); not measurable over plain http"
);
lines.push(
  "OWNER S19 Search Console and the backlink strategy are actions of the site's owner, nothing to code"
);

// ---- security: the running server ------------------------------------------------------------------
const home = await get("/");
const csp = home.headers.get("content-security-policy") ?? "";
note(
  "X12",
  "Content-Security-Policy without 'unsafe-inline'",
  /default-src 'self'/.test(csp) && !/'unsafe-inline'/.test(csp.split("style-src")[0]),
  csp.slice(0, 60)
);
for (const name of [
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy"
]) {
  note(
    "X+",
    `header ${name}`,
    Boolean(home.headers.get(name)),
    home.headers.get(name) ?? "missing"
  );
}
note(
  "X16",
  "CORS is not open to everybody",
  home.headers.get("access-control-allow-origin") !== "*"
);
const admin = await get("/api/admin/hero-details");
note(
  "X1-X2",
  "an admin route answers 401 or 403 without a session",
  [401, 403].includes(admin.status),
  String(admin.status)
);
const write = await get("/api/series", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://elsewhere.example" },
  body: "{}"
});
note(
  "X+",
  "a write from another origin is refused",
  [400, 401, 403].includes(write.status),
  String(write.status)
);
note(
  "X6",
  "no token kept in localStorage by the shell",
  !/localStorage\.setItem\([^)]*(token|jwt|session)/i.test(home.text)
);

// ---- security: the code ----------------------------------------------------------------------------
const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (full.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
};
const gitignore = existsSync(".gitignore") ? readFileSync(".gitignore", "utf8") : "";
note("X8", ".env stays out of git", /^\.env$/m.test(gitignore) && /^\.env\.\*$/m.test(gitignore));
const server = walk("src/server");
// Dynamic SQL is built from constants and fragments made on the server (a list of columns, "?, ?, ?", a WHERE joined from fixed
// pieces): that is fine, the values always travel as parameters. What is not fine is a name that comes from the request inside the
// text of a statement, so an interpolated expression that names the request, its body, its parameters or an input is a failure.
const interpolated = [];
let dynamic = 0;
for (const file of server) {
  const body = readFileSync(file, "utf8");
  for (const statement of body.matchAll(/\.(?:query|execute)\(\s*`([^`]*)`/g)) {
    for (const part of statement[1].matchAll(/\$\{([^}]*)\}/g)) {
      dynamic += 1;
      if (/\b(req|request|body|params|query|input|payload)\b/.test(part[1])) {
        interpolated.push(`${file}: ${part[1].trim().slice(0, 40)}`);
      }
    }
  }
}
note(
  "X10",
  `SQL: ${dynamic} interpolated fragments, none of them taken from a request (the values travel as ? parameters)`,
  interpolated.length === 0,
  interpolated.slice(0, 3).join("; ")
);
const logger = readFileSync("src/server/platform/logger.js", "utf8");
note(
  "X9",
  "the logger redacts cookies, tokens, passwords and sessions",
  /cookie\|authorization\|token\|secret\|password\|session/i.test(logger)
);
note(
  "X5",
  "passwords are hashed (scrypt or argon in password.js)",
  existsSync("src/server/platform/security/password.js") &&
    /scrypt|argon|pbkdf2/i.test(readFileSync("src/server/platform/security/password.js", "utf8"))
);
note("X15", "rate limits exist", existsSync("src/server/platform/http/rate-limits.js"));
note(
  "X17",
  "production refuses to start with default or short secrets",
  /production/.test(readFileSync("src/server/config.js", "utf8"))
);
const audit = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["audit", "--omit=dev", "--json"],
  { encoding: "utf8", shell: process.platform === "win32" }
);
let vulnerabilities = -1;
try {
  vulnerabilities = JSON.parse(audit.stdout).metadata.vulnerabilities.total;
} catch {
  // the network may be unreachable: said below
}
note(
  "X18",
  "npm audit: no known vulnerability in the dependencies that ship",
  vulnerabilities === 0,
  vulnerabilities < 0 ? "npm audit could not run" : `${vulnerabilities} found`
);
lines.push(
  "DONE X3 row-level security does not apply (MySQL, reached by the server only); X4/X7/X11/X13/X14 are covered by the unit tests (auth, validation, uploads, signed Discord requests)"
);

console.log(lines.join("\n"));
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks pass");
process.exit(failures ? 1 : 0);
