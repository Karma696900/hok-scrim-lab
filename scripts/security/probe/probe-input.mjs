// The vulnerability probe, what the address can carry and what the API does with hostile input. Each group takes what it needs from the probe (see probe-kit.mjs).

export async function addressGroup({ send, check }) {
  const evil = [
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "///evil.example/x"
  ];
  for (const next of evil) {
    const { status, headers, text } = await send(`/login?next=${encodeURIComponent(next)}`);
    const location = headers.get("location") ?? "";
    const leaks =
      (status >= 300 && status < 400 && /evil\.example|javascript:/.test(location)) ||
      /href="(https?:)?\/\/evil\.example|href="javascript:/i.test(text);
    check(
      "redirect",
      `?next=${next} does not send the person elsewhere`,
      !leaks,
      `HTTP ${status} ${location}`
    );
  }
  const reflected = ["<script>alert(1)</script>", '"><img src=x onerror=alert(1)>', "'-alert(1)-'"];
  for (const payload of reflected) {
    for (const path of [
      `/heroes/${encodeURIComponent(payload)}`,
      `/search?q=${encodeURIComponent(payload)}`,
      `/login?next=${encodeURIComponent(payload)}`,
      `/teams/${encodeURIComponent(payload)}`
    ]) {
      const { text } = await send(path);
      const raw = text.includes(payload) && !text.includes(payload.replace(/</g, "&lt;"));
      check("xss", `${path.slice(0, 40)}… does not echo ${payload.slice(0, 18)} unescaped`, !raw);
    }
  }
}

export async function hostileInputGroup({ base, send, check }) {
  const injections = [
    "' OR '1'='1",
    "1; DROP TABLE users--",
    '" OR ""="',
    "1 UNION SELECT password_hash FROM users--",
    "%00",
    "${7*7}",
    "{{7*7}}"
  ];
  for (const value of injections) {
    for (const path of [
      `/api/heroes/${encodeURIComponent(value)}`,
      `/api/teams?q=${encodeURIComponent(value)}`,
      `/api/popular/heroes?lane=${encodeURIComponent(value)}`,
      `/api/tournaments?query=${encodeURIComponent(value)}`
    ]) {
      const { status, text } = await send(path);
      const leak = /ER_|SQLSTATE|sql syntax|mysql|stack|at .*\.js:\d+/i.test(text);
      check(
        "injection",
        `${path.slice(0, 44)}… answers cleanly`,
        status !== 500 && !leak,
        `HTTP ${status}`
      );
    }
  }
  const bodies = [
    ["invalid JSON", "{not json"],
    [
      "prototype pollution",
      '{"__proto__":{"isAdmin":true},"constructor":{"prototype":{"isAdmin":true}}}'
    ],
    ["a body that is an array", "[1,2,3]"],
    ["very deep nesting", `${"[".repeat(5000)}${"]".repeat(5000)}`]
  ];
  for (const [label, body] of bodies) {
    const { status, text } = await send("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body
    });
    check(
      "injection",
      `${label} in a body gives a clean 4xx`,
      status >= 400 && status < 500 && !/at .*\.js:\d+|node_modules/.test(text),
      `HTTP ${status}`
    );
  }
  const big = await send("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: "a@b.test", password: "x".repeat(3_000_000) })
  });
  check(
    "injection",
    "a 3 MB body is refused (413)",
    big.status === 413 || big.status === 400,
    `HTTP ${big.status}`
  );
  const after = await send("/api/health/live");
  check(
    "injection",
    "the server still answers after all that",
    after.status === 200,
    `HTTP ${after.status}`
  );
}
