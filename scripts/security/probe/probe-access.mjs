// The vulnerability probe, who may call what, and requests that come from another site. Each group takes what it needs from the probe (see probe-kit.mjs).

export async function accessGroup({ base, send, check }) {
  const closed = [
    ["GET", "/api/admin/catalog/stats"],
    ["GET", "/api/admin/translations/status"],
    ["POST", "/api/admin/catalog/items"],
    ["PUT", "/api/admin/heroes/501/profile"],
    ["DELETE", "/api/admin/tournaments/1"],
    ["GET", "/api/auth/security"],
    ["POST", "/api/auth/password"],
    ["POST", "/api/auth/export"],
    ["GET", "/api/me/teams"],
    ["GET", "/api/notifications"],
    ["POST", "/api/requests/1/messages"],
    ["GET", "/api/space"],
    ["GET", "/api/me/api-keys"]
  ];
  for (const [method, path] of closed) {
    const { status } = await send(path, {
      method,
      headers: { "content-type": "application/json", origin: base },
      body: method === "GET" ? undefined : "{}"
    });
    check(
      "access",
      `${method} ${path} is closed to a visitor`,
      // not 404: a path that does not exist would pass without proving anything
      [401, 403].includes(status),
      `HTTP ${status}`
    );
  }
}

export async function csrfGroup({ base, send, check }) {
  const attempts = [
    [
      "a write from another origin",
      { origin: "https://evil.example", "content-type": "application/json" }
    ],
    [
      "a write with the origin of a look-alike",
      { origin: `${base}.evil.example`, "content-type": "application/json" }
    ],
    [
      "a write as a form from another origin",
      { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" }
    ]
  ];
  for (const [label, headers] of attempts) {
    const { status } = await send("/api/auth/login", {
      method: "POST",
      headers,
      body: headers["content-type"].includes("json")
        ? '{"email":"a@b.test","password":"x"}'
        : "email=a@b.test&password=x"
    });
    check("csrf", `${label} is refused`, [400, 403, 415].includes(status), `HTTP ${status}`);
  }
  const options = await send("/api/health/live", {
    method: "OPTIONS",
    headers: { origin: "https://evil.example", "access-control-request-method": "POST" }
  });
  const allow = options.headers.get("access-control-allow-origin");
  check(
    "csrf",
    "no site is allowed to read the API from a browser (no CORS allow-origin)",
    !allow || allow === base,
    `allow-origin: ${allow}`
  );
}
