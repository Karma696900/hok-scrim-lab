// The vulnerability probe, the doors of an account, and a forged Host header. Each group takes what it needs from the probe (see probe-kit.mjs).

export async function accountGroup({ base, send, check, codeOf, rateLimitDisabled }) {
  const answers = [];
  for (let attempt = 0; attempt < 14; attempt += 1) {
    answers.push(
      (
        await send("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({ email: "nobody@example.test", password: "wrong-password-1" })
        })
      ).status
    );
  }
  check(
    "account",
    "a wrong password never gives a session or a server error",
    answers.every(status => [400, 401, 403, 429].includes(status)),
    answers.join(" ")
  );
  check(
    "account",
    "repeated tries end in a 429 (rate limit), or the limit is switched off on purpose",
    answers.includes(429) || rateLimitDisabled,
    answers.join(" ")
  );
  const a = await send("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: "nobody@example.test", password: "wrong-password-1" })
  });
  const b = await send("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: "admin@example.test", password: "wrong-password-1" })
  });
  check(
    "account",
    "the answer does not tell whether an email has an account",
    a.status === b.status && codeOf(a.text) === codeOf(b.text),
    `${a.status}/${b.status}`
  );
  const cookie = (await send("/")).headers.get("set-cookie") ?? "";
  check(
    "account",
    "a visitor is not given a session cookie by the home page",
    !/session/i.test(cookie),
    cookie.slice(0, 60)
  );
}

export async function hostGroup({ send, check }) {
  const home = await send("/", {
    headers: { host: "evil.example", "x-forwarded-host": "evil.example" }
  });
  const robots = await send("/robots.txt", { headers: { "x-forwarded-host": "evil.example" } });
  const sitemap = await send("/sitemap.xml", { headers: { "x-forwarded-host": "evil.example" } });
  check(
    "host",
    "the home page does not build its links from a forged Host",
    !/evil\.example/.test(home.text),
    `HTTP ${home.status}`
  );
  check(
    "host",
    "robots.txt and the sitemap do not name a forged host",
    !/evil\.example/.test(robots.text + sitemap.text)
  );
}
