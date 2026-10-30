// Profiles: unique immutable tag, pseudo change, photo upload / Google photo / none, served
// avatars.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import sharp from "sharp";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer({ seedHeroes: false });
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";
const png = (width = 600, height = 300) =>
  sharp({ create: { width, height, channels: 3, background: "#2d6bff" } })
    .png()
    .toBuffer();
const upload = async (browser, body, type = "image/png") => {
  const response = await fetch(`${app.baseUrl}/api/profile/avatar`, {
    method: "POST",
    headers: {
      "content-type": type,
      cookie: [...browser.jar].map(([key, value]) => `${key}=${value}`).join("; ")
    },
    body
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

describe("tag", { skip }, () => {
  test("every account has a unique 6-character tag from an unambiguous alphabet, and it never changes", async () => {
    const users = await Promise.all(
      Array.from({ length: 12 }, (_, index) => app.signIn(`Player${index}`))
    );
    const tags = users.map(item => item.user.tag);
    assert.equal(new Set(tags).size, tags.length);
    for (const tag of tags) {
      assert.match(tag, /^[A-HJKMNP-Z2-9]{6}$/);
    }
    const me = (await users[0].browser.get("/api/auth/me")).body.user;
    assert.equal(me.tag, tags[0]);
    await users[0].browser.patch("/api/profile", { name: "Renamed", tag: "HACKED" });
    assert.equal(
      (await users[0].browser.get("/api/auth/me")).body.user.tag,
      tags[0],
      "a tag sent by the client is ignored"
    );
  });

  test("a local account gets a tag too", async () => {
    const browser = app.browser();
    const response = await browser.post("/api/auth/register", {
      name: "Local One",
      email: `local-${Date.now()}@example.test`,
      password: "a long winding passphrase 7"
    });
    assert.equal(response.status, 200, response.text);
    const [[row]] = await app.store.pool.query(
      "SELECT tag FROM users WHERE name = 'Local One' ORDER BY created_at DESC LIMIT 1"
    );
    assert.match(row.tag, /^[A-Z0-9]{6}$/);
  });
});

describe("pseudo", { skip }, () => {
  test("it can be changed, is validated, and several players may share one (the tag tells them apart)", async () => {
    const a = await app.signIn("Same");
    const b = await app.signIn("Same");
    assert.notEqual(a.user.tag, b.user.tag);
    const renamed = await a.browser.patch("/api/profile", { name: "  Brand   New  " });
    assert.equal(renamed.status, 200, renamed.text);
    assert.equal(renamed.body.name, "Brand New", "trimmed and single-spaced");
    assert.equal((await a.browser.get("/api/auth/me")).body.user.name, "Brand New");
    for (const name of ["", "<img onerror=x>", "x".repeat(61), "bad\u0007name", 5, null]) {
      assert.equal(
        (await a.browser.patch("/api/profile", { name })).status,
        400,
        JSON.stringify(name)
      );
    }
  });

  test("it needs a signed-in account (a guest has no profile)", async () => {
    assert.equal((await app.browser().patch("/api/profile", { name: "Guest" })).status, 401);
    assert.equal((await app.browser().get("/api/profile")).status, 401);
  });
});

describe("photo", { skip }, () => {
  test("an upload is cropped to a 256 px square WebP, served by tag with a long cache, and shown as the avatar everywhere", async () => {
    const player = await app.signIn("Photo");
    const result = await upload(player.browser, await png());
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.avatarKind, "custom");
    assert.match(result.body.picture, new RegExp(`^/avatars/${player.user.tag}\\?v=\\d+$`));
    const served = await fetch(`${app.baseUrl}/avatars/${player.user.tag}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), "image/webp");
    assert.match(served.headers.get("cache-control"), /max-age=31536000, immutable/);
    const meta = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ["webp", 256, 256]);
    const etag = served.headers.get("etag");
    assert.equal(
      (
        await fetch(`${app.baseUrl}/avatars/${player.user.tag}`, {
          headers: { "if-none-match": etag }
        })
      ).status,
      304
    );
    assert.equal((await player.browser.get("/api/auth/me")).body.user.picture, result.body.picture);
  });

  test("what is not a picture is refused: wrong type, lying type, SVG, too large, empty, anonymous", async () => {
    const player = await app.signIn("Refused");
    assert.equal(
      (await upload(player.browser, Buffer.from("hello"), "text/plain")).body.code,
      "invalid_image"
    );
    assert.equal(
      (await upload(player.browser, Buffer.from("not an image"), "image/png")).body.code,
      "invalid_image"
    );
    assert.equal(
      (
        await upload(
          player.browser,
          Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='9' height='9'/>"),
          "image/png"
        )
      ).body.code,
      "invalid_image",
      "an SVG sent as a PNG is not decoded"
    );
    assert.equal((await upload(player.browser, Buffer.alloc(0), "image/png")).status >= 400, true);
    const huge = await sharp({
      create: {
        width: 4000,
        height: 4000,
        channels: 3,
        noise: { type: "gaussian", mean: 128, sigma: 60 }
      }
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    assert.ok(
      [400, 413].includes((await upload(player.browser, huge)).status),
      "over the size limit"
    );
    assert.equal((await upload(app.browser(), await png())).status, 401);
    assert.equal(
      (await fetch(`${app.baseUrl}/avatars/${player.user.tag}`)).status,
      404,
      "nothing was stored"
    );
  });

  test("avatars are served only for a well-formed tag that has one", async () => {
    for (const tag of ["nope", "ABCDE", "ABCDEFG", "abcdef", "../etc", "ZZZZZZ"]) {
      assert.equal(
        (await fetch(`${app.baseUrl}/avatars/${encodeURIComponent(tag)}`)).status,
        404,
        tag
      );
    }
  });

  test("the Google photo can be chosen back, and 'none' removes the uploaded one for good", async () => {
    const created = await app.store.upsertGoogleUser({
      googleSubject: `sub-photo-${Date.now()}`,
      email: `g-${Date.now()}@example.test`,
      picture: "https://lh3.googleusercontent.com/photo"
    });
    await app.store.completeProfile(created.id, {
      name: "Gee",
      passwordHash: null,
      loginEmail: null
    });
    const { randomBytes, createHash } = await import("node:crypto");
    const token = randomBytes(32).toString("base64url");
    await app.store.createSession(
      createHash("sha256").update(token).digest("hex"),
      created.id,
      Date.now() + 3600_000
    );
    const browser = app.browser(`hok_session=${token}`);
    assert.equal(
      (await browser.get("/api/auth/me")).body.user.picture,
      "https://lh3.googleusercontent.com/photo",
      "the Google photo is the starting avatar"
    );
    assert.equal((await upload(browser, await png())).body.avatarKind, "custom");
    const back = await browser.put("/api/profile/avatar", { kind: "google" });
    assert.deepEqual(
      [back.body.avatarKind, back.body.picture],
      ["google", "https://lh3.googleusercontent.com/photo"]
    );
    assert.equal(
      (await fetch(`${app.baseUrl}/avatars/${created.tag}`)).status,
      404,
      "the uploaded file is deleted when another choice is made"
    );
    const none = await browser.put("/api/profile/avatar", { kind: "none" });
    assert.deepEqual([none.body.avatarKind, none.body.picture], ["none", ""]);
    assert.equal((await browser.put("/api/profile/avatar", { kind: "weird" })).status, 400);
    // A later Google sign-in refreshes the Google photo only if the player still uses it.
    await app.store.upsertGoogleUser({
      googleSubject:
        created.google_subject ??
        (
          await app.store.pool.query("SELECT google_subject FROM users WHERE id = ?", [created.id])
        )[0][0].google_subject,
      email: created.email,
      picture: "https://lh3.googleusercontent.com/new"
    });
    assert.equal(
      (await browser.get("/api/auth/me")).body.user.picture,
      "",
      "an avatar the player removed stays removed"
    );
  });

  test("someone without a Google photo cannot choose it", async () => {
    const player = await app.signIn("NoGoogle");
    assert.equal(
      (await player.browser.put("/api/profile/avatar", { kind: "google" })).body.code,
      "no_google_photo"
    );
  });
});
