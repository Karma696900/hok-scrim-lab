// Google sign-in, end to end, with Google's endpoints stubbed: state, PKCE, return path, guest
// merge, rotation, logout.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, describe, test } from "node:test";
import { hotp, stepAt } from "../../platform/security/totp.js";
import { CREATE_BODY, startTestServer } from "../../../testing/test-app.js";

const GOOGLE_ENV = {
  GOOGLE_CLIENT_ID: "client-123",
  GOOGLE_CLIENT_SECRET: "secret-xyz",
  GOOGLE_REDIRECT_URI: "http://localhost:3000/auth/google/callback",
  ADMIN_EMAILS: "boss@example.test"
};
const app = await startTestServer({ env: GOOGLE_ENV });
const production = await startTestServer({
  env: {
    ...GOOGLE_ENV,
    NODE_ENV: "production",
    TRUST_PROXY: "1", // the test plays the proxy: it says the request came in over https
    GOOGLE_REDIRECT_URI: "https://scrims.example.test/auth/google/callback"
  },
  seedHeroes: false
});
after(async () => {
  await app?.close();
  await production?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const realFetch = globalThis.fetch;
/** Replaces fetch for Google only; everything else (the test client) goes to the real network stack. */
function stubGoogle(handler) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (
      target.startsWith("https://oauth2.googleapis.com/") ||
      target.startsWith("https://openidconnect.googleapis.com/")
    ) {
      calls.push({ url: target, options });
      return handler(target, options);
    }
    return realFetch(url, options);
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = realFetch;
    }
  };
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function finishEnrolment(browser) {
  const start = await browser.post("/api/auth/mfa/enrol/start");
  assert.equal(start.status, 200, start.text);
  const confirmed = await browser.post("/api/auth/mfa/enrol/confirm", {
    code: hotp(start.body.secret.replace(/s/g, ""), stepAt())
  });
  assert.equal(confirmed.status, 200, confirmed.text);
  return confirmed.body;
}

const PASSWORD = "a long winding passphrase 7";
/**
 * The step Google accounts go through first: their own pseudo and password (their Google name is
 * never used).
 */
async function chooseProfile(browser, name = "Boss Pseudo", password = PASSWORD) {
  const response = await browser.post("/api/auth/profile/complete", {
    name,
    password,
    confirm: password
  });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.step, "enroll");
  return response.body;
}

async function beginLogin(browser, returnTo = "/scrims?x=1") {
  const response = await browser.get(`/auth/google?returnTo=${encodeURIComponent(returnTo)}`);
  assert.equal(response.status, 302);
  return { response, authorization: new URL(response.headers.get("location")) };
}

describe("Google sign-in", { skip }, () => {
  test("the authorization request carries state and a PKCE S256 challenge; cookies are httpOnly", async () => {
    const browser = app.browser();
    const { response, authorization } = await beginLogin(browser);
    assert.equal(
      authorization.origin + authorization.pathname,
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    const query = authorization.searchParams;
    assert.equal(query.get("client_id"), "client-123");
    assert.equal(query.get("redirect_uri"), GOOGLE_ENV.GOOGLE_REDIRECT_URI);
    assert.equal(query.get("response_type"), "code");
    assert.equal(query.get("code_challenge_method"), "S256");
    assert.match(query.get("code_challenge"), /^[A-Za-z0-9_-]{43}$/);
    assert.ok(query.get("state").length >= 32);
    const cookies = (
      await fetch(`${app.baseUrl}/auth/google`, { redirect: "manual" })
    ).headers.getSetCookie();
    assert.equal(cookies.length, 3);
    for (const cookie of cookies) {
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Lax/);
      assert.match(cookie, /Max-Age=600/);
    }
    assert.ok(response.headers.get("cache-control"));
  });

  test("a callback without a matching state is refused and nothing is created", async () => {
    const stub = stubGoogle(() => json({}));
    try {
      const browser = app.browser();
      const { authorization } = await beginLogin(browser);
      assert.equal(
        (await browser.get("/auth/google/callback?code=abc&state=wrong-state")).status,
        400
      );
      assert.equal(
        (
          await app
            .browser()
            .get(`/auth/google/callback?code=abc&state=${authorization.searchParams.get("state")}`)
        ).status,
        400,
        "no state cookie"
      );
      assert.equal(
        (await browser.get("/auth/google/callback?error=access_denied&state=x")).status,
        400
      );
      assert.equal(
        stub.calls.length,
        0,
        "Google is never contacted when the state does not verify"
      );
    } finally {
      stub.restore();
    }
  });

  test("the full flow: token exchange with the PKCE verifier, guest data merged, session rotated", async () => {
    const browser = app.browser();
    const { body: series } = await browser.post("/api/series", CREATE_BODY);
    const guestCookie = browser.jar.get("hok_session");
    assert.ok(guestCookie);

    const { authorization } = await beginLogin(browser, "/scrims?open=1");
    const stub = stubGoogle(url =>
      url.includes("/token")
        ? json({ access_token: "token-1" })
        : json({
            sub: "google-sub-1",
            email: "boss@example.test",
            email_verified: true,
            name: "The Boss",
            picture: "https://lh3.googleusercontent.com/a"
          })
    );
    try {
      const callback = await browser.get(
        `/auth/google/callback?code=the-code&state=${authorization.searchParams.get("state")}`
      );
      assert.equal(callback.status, 302);
      assert.equal(
        callback.headers.get("location"),
        "/login/profile?next=%2Fscrims%3Fopen%3D1",
        "a new Google account first chooses its pseudo and password, keeping the validated return path"
      );
      assert.equal(
        (await browser.get("/api/auth/me")).body.user,
        null,
        "no session until the authenticator code is verified"
      );

      const tokenCall = stub.calls.find(call => call.url.includes("/token"));
      const form = new URLSearchParams(String(tokenCall.options.body));
      assert.equal(form.get("code"), "the-code");
      assert.equal(form.get("grant_type"), "authorization_code");
      assert.equal(form.get("client_secret"), "secret-xyz");
      assert.equal(
        createHash("sha256").update(form.get("code_verifier")).digest("base64url"),
        authorization.searchParams.get("code_challenge"),
        "the verifier matches the challenge"
      );
      assert.equal(
        stub.calls.find(call => call.url.includes("userinfo")).options.headers.authorization,
        "Bearer token-1"
      );
    } finally {
      stub.restore();
    }

    await chooseProfile(browser);
    assert.equal(
      (await browser.get("/api/auth/me")).body.user,
      null,
      "still no session: the authenticator comes next"
    );
    await finishEnrolment(browser);
    const me = (await browser.get("/api/auth/me")).body;
    assert.equal(me.user.name, "Boss Pseudo", "the pseudo is the player's own choice");
    assert.notEqual(me.user.name, "The Boss", "Google's name is never used");
    assert.equal(
      me.user.picture,
      "https://lh3.googleusercontent.com/a",
      "the Google photo is the default avatar"
    );
    assert.match(me.user.tag, /^[A-Z0-9]{6}$/);
    assert.equal(me.user.email, "boss@example.test");
    assert.equal(me.user.mfa, true);
    assert.equal(me.user.isAdmin, true, "ADMIN_EMAILS applies to verified Google emails");
    assert.equal(me.guest, false);
    assert.notEqual(browser.jar.get("hok_session"), guestCookie, "a new session token is issued");
    assert.equal(
      (await browser.get(`/api/series/${series.id}`)).status,
      200,
      "the guest's series now belongs to the account"
    );

    const stale = app.browser();
    stale.jar.set("hok_session", guestCookie);
    assert.equal(
      (await stale.get(`/api/series/${series.id}`)).status,
      404,
      "the guest cookie no longer works"
    );
    assert.equal((await stale.get("/api/auth/me")).body.user, null);
  });

  test("an unverified email, a failed exchange and a hostile return path are all handled safely", async () => {
    for (const [label, handler, expected] of [
      [
        "unverified",
        url =>
          url.includes("/token")
            ? json({ access_token: "t" })
            : json({ sub: "s2", email: "x@example.test", email_verified: false, name: "X" }),
        502
      ],
      [
        "exchange fails",
        () => json({ error: "invalid_grant", error_description: "secret detail from google" }, 400),
        502
      ]
    ]) {
      const browser = app.browser();
      const { authorization } = await beginLogin(browser, "//evil.example/steal");
      const stub = stubGoogle(handler);
      try {
        const callback = await browser.get(
          `/auth/google/callback?code=c&state=${authorization.searchParams.get("state")}`
        );
        assert.equal(callback.status, expected, label);
        assert.doesNotMatch(callback.text, /secret detail|invalid_grant/);
        assert.equal((await browser.get("/api/auth/me")).body.user, null, `${label}: no session`);
      } finally {
        stub.restore();
      }
    }
    const browser = app.browser();
    const { authorization } = await beginLogin(browser, "//evil.example/steal");
    const stub = stubGoogle(url =>
      url.includes("/token")
        ? json({ access_token: "t" })
        : json({ sub: "s3", email: "ok@example.test", email_verified: true, name: "Ok" })
    );
    try {
      const callback = await browser.get(
        `/auth/google/callback?code=c&state=${authorization.searchParams.get("state")}`
      );
      assert.equal(
        callback.headers.get("location"),
        "/login/profile?next=%2F",
        "an open redirect becomes /"
      );
    } finally {
      stub.restore();
    }
  });

  test("Google's name never reaches the account, whatever it contains; the player's pseudo is validated", async () => {
    const browser = app.browser();
    const { authorization } = await beginLogin(browser);
    const stub = stubGoogle(url =>
      url.includes("/token")
        ? json({ access_token: "t" })
        : json({
            sub: "s4",
            email: "xss@example.test",
            email_verified: true,
            name: "<img src=x onerror=alert(1)>",
            picture: "javascript:alert(1)"
          })
    );
    try {
      await browser.get(
        `/auth/google/callback?code=c&state=${authorization.searchParams.get("state")}`
      );
    } finally {
      stub.restore();
    }
    for (const name of ["<b>x</b>", "", "x".repeat(61), "bad\u0000name"]) {
      assert.equal(
        (
          await browser.post("/api/auth/profile/complete", {
            name,
            password: PASSWORD,
            confirm: PASSWORD
          })
        ).status,
        400,
        JSON.stringify(name)
      );
    }
    assert.equal(
      (
        await browser.post("/api/auth/profile/complete", {
          name: "Ok name",
          password: PASSWORD,
          confirm: "different"
        })
      ).body.code,
      "password_mismatch"
    );
    assert.equal(
      (
        await browser.post("/api/auth/profile/complete", {
          name: "Ok name",
          password: "short",
          confirm: "short"
        })
      ).body.code,
      "weak_password"
    );
    await chooseProfile(browser, "Ok name");
    await finishEnrolment(browser);
    const user = (await browser.get("/api/auth/me")).body.user;
    assert.equal(user.name, "Ok name");
    assert.equal(user.picture, "", "a photo address that is not https is dropped");
    assert.equal(user.avatarKind, "none");
  });

  test("the profile step needs the sign-in in progress, and cannot be replayed once done", async () => {
    assert.equal(
      (
        await app.browser().post("/api/auth/profile/complete", {
          name: "Nobody",
          password: PASSWORD,
          confirm: PASSWORD
        })
      ).status,
      401
    );
    const browser = app.browser();
    const { authorization } = await beginLogin(browser);
    const stub = stubGoogle(url =>
      url.includes("/token")
        ? json({ access_token: "t" })
        : json({ sub: "s5", email: "once@example.test", email_verified: true, name: "Once" })
    );
    try {
      await browser.get(
        `/auth/google/callback?code=c&state=${authorization.searchParams.get("state")}`
      );
    } finally {
      stub.restore();
    }
    await chooseProfile(browser, "Once");
    assert.equal(
      (
        await browser.post("/api/auth/profile/complete", {
          name: "Twice",
          password: PASSWORD,
          confirm: PASSWORD
        })
      ).status,
      401,
      "the challenge is now the authenticator one"
    );
  });

  test("a returning Google user must pass the authenticator step too, with the same account", async () => {
    const sub = `returning-${Date.now()}`;
    const profile = {
      sub,
      email: "returning@example.test",
      email_verified: true,
      name: "Returning"
    };
    const login = async browser => {
      const { authorization } = await beginLogin(browser);
      const stub = stubGoogle(url =>
        url.includes("/token") ? json({ access_token: "t" }) : json(profile)
      );
      try {
        return await browser.get(
          `/auth/google/callback?code=c&state=${authorization.searchParams.get("state")}`
        );
      } finally {
        stub.restore();
      }
    };
    const first = app.browser();
    assert.match((await login(first)).headers.get("location"), /^\/login\/profile/);
    await chooseProfile(first, "Returning");
    const enrol = await first.post("/api/auth/mfa/enrol/start");
    const secret = enrol.body.secret.replace(/s/g, "");
    await first.post("/api/auth/mfa/enrol/confirm", { code: hotp(secret, stepAt()) });
    const second = app.browser();
    assert.match(
      (await login(second)).headers.get("location"),
      /^\/login\/mfa/,
      "enrolled accounts are asked for a code"
    );
    assert.equal((await second.get("/api/auth/me")).body.user, null);
    assert.equal((await second.post("/api/auth/mfa/verify", { code: "000000" })).status, 401);
    assert.equal(
      (await second.post("/api/auth/mfa/verify", { code: hotp(secret, stepAt() + 1) })).status,
      200
    );
    assert.equal(
      (await second.get("/api/auth/me")).body.user.id,
      (await first.get("/api/auth/me")).body.user.id
    );
  });

  test("logout deletes the session on the server and clears the cookie", async () => {
    const signedIn = await app.signIn("Leaver");
    assert.ok((await signedIn.browser.get("/api/auth/me")).body.user);
    const response = await signedIn.browser.post("/auth/logout");
    assert.deepEqual(response.body, { loggedOut: true });
    assert.equal((await signedIn.browser.get("/api/auth/me")).body.user, null);
    const [[row]] = await app.store.pool.query(
      "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?",
      [signedIn.user.id]
    );
    assert.equal(Number(row.n), 0);
  });

  test("when Google is not configured sign-in says so (503) and the app reports it", async () => {
    const plain = await startTestServer({ seedHeroes: false });
    try {
      assert.equal((await plain.browser().get("/auth/google")).status, 503);
      assert.equal((await plain.browser().get("/api/auth/me")).body.enabled, false);
    } finally {
      await plain.close();
    }
  });

  test("in production the OAuth cookies are __Host- prefixed and Secure", async () => {
    const response = await fetch(`${production.baseUrl}/auth/google`, {
      redirect: "manual",
      headers: { "x-forwarded-proto": "https" }
    });
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 3);
    for (const cookie of cookies) {
      assert.match(cookie, /^__Host-hok_oauth_/);
      assert.match(cookie, /; Secure/);
      assert.doesNotMatch(cookie, /Domain=/);
    }
  });
});
