// The link with the bots server (private repository hok-bots): the shared secret, the ticket of a live game.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { botsLinkFrom } from "./bots-link.js";

const SECRET = "a-shared-secret-that-is-long-enough-0123456789";

describe("the link with the bots server", () => {
  test("off without an address or with a short secret; the secret may come from a file", () => {
    assert.equal(botsLinkFrom({}), null);
    assert.equal(
      botsLinkFrom({ BOTS_URL: "https://bots.test", BOTS_SHARED_SECRET: "short" }),
      null
    );
    const dir = mkdtempSync(join(tmpdir(), "bots-link-"));
    try {
      writeFileSync(join(dir, "secret"), `${SECRET}\n`);
      const link = botsLinkFrom({
        BOTS_URL: "https://bots.test/",
        BOTS_SHARED_SECRET_FILE: join(dir, "secret")
      });
      assert.equal(link.url, "https://bots.test");
      assert.equal(link.socketOrigin, "wss://bots.test");
      assert.ok(link.secretMatches(SECRET));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a wrong or missing secret never matches", () => {
    const link = botsLinkFrom({ BOTS_URL: "http://127.0.0.1:8090", BOTS_SHARED_SECRET: SECRET });
    assert.equal(link.socketOrigin, "ws://127.0.0.1:8090");
    assert.equal(link.secretMatches(undefined), false);
    assert.equal(link.secretMatches(""), false);
    assert.equal(link.secretMatches(`${SECRET}x`), false);
    assert.equal(link.secretMatches(SECRET.replace("a", "b")), false);
  });

  test("a ticket is the payload and its HMAC-SHA256, as the bots server reads it", () => {
    const link = botsLinkFrom({ BOTS_URL: "https://bots.test", BOTS_SHARED_SECRET: SECRET });
    const token = link.ticketFor({ userId: "u-1", choice: { side: "blue" } }, 1000);
    const [body, signature] = token.split(".");
    assert.equal(signature, createHmac("sha256", SECRET).update(body).digest("base64url"));
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    assert.equal(payload.userId, "u-1");
    assert.equal(payload.exp, 61_000);
    assert.match(payload.nonce, /^[0-9a-f-]{36}$/);
    assert.notEqual(link.ticketFor({}, 1000), link.ticketFor({}, 1000));
  });
});
