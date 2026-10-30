// The vulnerability probe, what a stranger can read: the headers of the pages and the files that must not be served. Each group takes what it needs from the probe (see probe-kit.mjs).

export async function headersGroup({ forwardedProto, send, check }) {
  if (forwardedProto) {
    const plain = await send("/heroes?x=1", { plain: true });
    check(
      "headers",
      "plain http is sent on to https, for good (308), with the same address",
      plain.status === 308 &&
        (plain.headers.get("location") ?? "").startsWith("https://") &&
        (plain.headers.get("location") ?? "").endsWith("/heroes?x=1"),
      `HTTP ${plain.status} ${plain.headers.get("location") ?? ""}`
    );
  }
  const page = await send("/");
  const h = page.headers;
  const csp = h.get("content-security-policy") ?? "";
  check("headers", "a Content-Security-Policy is sent", Boolean(csp));
  check(
    "headers",
    "the policy forbids inline scripts without a hash (no 'unsafe-inline' in script-src)",
    !/script-src[^;]*'unsafe-inline'/.test(csp),
    csp.slice(0, 120)
  );
  check(
    "headers",
    "the policy forbids being framed (frame-ancestors none/self)",
    /frame-ancestors\s+('none'|'self')/.test(csp)
  );
  check(
    "headers",
    "objects and base tags are forbidden (object-src none, base-uri)",
    /object-src\s+'none'/.test(csp) && /base-uri/.test(csp)
  );
  check(
    "headers",
    "X-Content-Type-Options: nosniff",
    (h.get("x-content-type-options") ?? "").toLowerCase() === "nosniff"
  );
  if (forwardedProto) {
    const hsts = h.get("strict-transport-security") ?? "";
    check(
      "headers",
      "HSTS is sent over https, for six months at least",
      Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0) >= 15_552_000,
      hsts
    );
  }
  check("headers", "a Referrer-Policy is sent", Boolean(h.get("referrer-policy")));
  check("headers", "a Permissions-Policy is sent", Boolean(h.get("permissions-policy")));
  check("headers", "the server does not announce Express (X-Powered-By)", !h.get("x-powered-by"));
  check(
    "headers",
    "the server does not announce its version (Server)",
    !/\d/.test(h.get("server") ?? "")
  );
  const api = await send("/api/health/live");
  check(
    "headers",
    "the API is never cached (Cache-Control no-store)",
    /no-store/.test(api.headers.get("cache-control") ?? ""),
    api.headers.get("cache-control") ?? ""
  );
}

export async function filesGroup({ send, check }) {
  const secrets = [
    "/.env",
    "/.env.local",
    "/.git/config",
    "/.git/HEAD",
    "/package.json",
    "/package-lock.json",
    "/docker-compose.yml",
    "/Dockerfile",
    "/src/server/config.js",
    "/src/server/platform/database/store.js",
    "/scripts/accounts/",
    "/node_modules/express/package.json",
    "/backups/",
    "/docs/SECURITY.md",
    "/dist/manifest.json.map",
    "/src/client/main.js.map"
  ];
  for (const path of secrets) {
    const { status, text } = await send(path);
    const looksReal = status === 200 && !/<!doctype html>/i.test(text.slice(0, 300));
    check("files", `${path} is not served`, !looksReal, `HTTP ${status}`);
  }
  const traversals = [
    "/..%2f..%2f.env",
    "/%2e%2e/%2e%2e/.env",
    "/dist/..%2f..%2fpackage.json",
    "/locales/..%2f..%2f..%2fpackage.json",
    "/media/..%5c..%5cpackage.json"
  ];
  for (const path of traversals) {
    const { status, text } = await send(path);
    check(
      "files",
      `path traversal ${path} reads nothing`,
      !(status === 200 && /"dependencies"|DB_PASSWORD|MFA_ENCRYPTION_KEY/.test(text)),
      `HTTP ${status}`
    );
  }
}
