// Camp artwork goes through the image proxy: allow-list, widths, resize + WebP, caching, failure
// handling, HTTP headers.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import sharp from "sharp";
import { createImageProxy } from "./image-proxy.js";
import { PICTURE_RECIPE, resized, responsive, wide } from "../../../shared/media.js";
import { keyOf, widthFor } from "./image-proxy-parts.js";
import { startTestServer } from "../../../testing/test-app.js";

const CAMP = "https://camp.honorofkings.com/manage_material/p/abc.png";
const big = await sharp({
  create: { width: 2400, height: 1200, channels: 3, background: "#2d6bff" }
})
  .png()
  .toBuffer();
const pngResponse = (body = big, type = "image/png") =>
  new Response(body, {
    status: 200,
    headers: { "content-type": type, "content-length": String(body.length) }
  });
const directory = () => mkdtempSync(path.join(tmpdir(), "hok-img-"));

describe("image proxy service", () => {
  test("resizes to the width asked for and re-encodes as WebP, far smaller than the source", async () => {
    const proxy = createImageProxy({
      directory: directory(),
      fetchImpl: async () => pngResponse()
    });
    const { body } = await proxy.get(CAMP, 480);
    const meta = await sharp(body).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, 480);
    assert.ok(body.length < big.length / 3);
  });

  test("never enlarges a large source", async () => {
    const large = await sharp({
      create: { width: 600, height: 300, channels: 3, background: "#fff" }
    })
      .png()
      .toBuffer();
    const { body } = await createImageProxy({
      directory: directory(),
      fetchImpl: async () => pngResponse(large)
    }).get(CAMP, 960);
    assert.equal((await sharp(body).metadata()).width, 600);
  });

  test("a small icon (Camp's 128 px heroes) is enlarged by the server, at most 2.5 times", async () => {
    const icon = await sharp({
      create: { width: 128, height: 128, channels: 3, background: "#c33" }
    })
      .png()
      .toBuffer();
    const proxy = createImageProxy({
      directory: directory(),
      fetchImpl: async () => pngResponse(icon)
    });
    assert.equal((await sharp((await proxy.get(CAMP, 160)).body).metadata()).width, 160);
    assert.equal((await sharp((await proxy.get(CAMP, 320)).body).metadata()).width, 320);
    assert.equal(
      (await sharp((await proxy.get(CAMP, 960)).body).metadata()).width,
      320,
      "128 x 2.5: past that it would only be a bigger blur"
    );
    assert.equal(widthFor(100, 160), 160);
    assert.equal(widthFor(256, 1280), 640);
    assert.equal(widthFor(257, 1280), 257, "a source over 256 px is never enlarged");
    assert.equal(widthFor(128, 96), 96, "and a smaller width is a plain reduction");
  });

  test("the recipe is part of the key of a copy: a new recipe never serves the old pictures", async () => {
    assert.notEqual(
      keyOf(CAMP, 320),
      createHash("sha256").update(`320|${CAMP}`).digest("hex").slice(0, 40)
    );
  });

  test("only Camp media hosts and the fixed widths are accepted", async () => {
    let calls = 0;
    const proxy = createImageProxy({
      directory: directory(),
      fetchImpl: async () => {
        calls += 1;
        return pngResponse();
      }
    });
    for (const url of [
      "https://evil.example/a.png",
      "http://camp.honorofkings.com/a.png",
      "file:///etc/passwd",
      "https://camp.honorofkings.com.evil.example/a.png",
      "javascript:alert(1)",
      "",
      undefined
    ]) {
      assert.equal((await proxy.get(url, 480)).refused, true, String(url));
    }
    for (const width of [0, 100, 481, 99999, "abc", undefined, -1]) {
      assert.equal((await proxy.get(CAMP, width)).refused, true, String(width));
    }
    assert.equal(calls, 0, "a refused address is never fetched");
  });

  test("one download per image and width, even for simultaneous requests; the result is kept", async () => {
    let calls = 0;
    const proxy = createImageProxy({
      directory: directory(),
      fetchImpl: async () => {
        calls += 1;
        await new Promise(resolve => setTimeout(resolve, 20));
        return pngResponse();
      }
    });
    const [a, b, c] = await Promise.all([
      proxy.get(CAMP, 320),
      proxy.get(CAMP, 320),
      proxy.get(CAMP, 320)
    ]);
    assert.equal(a.key, b.key);
    assert.equal(b.key, c.key);
    await proxy.get(CAMP, 320);
    assert.equal(calls, 1);
    await proxy.get(CAMP, 640);
    assert.equal(calls, 2, "another width is another image");
  });

  test("a second proxy over the same folder reads the disk copy", async () => {
    const folder = directory();
    await createImageProxy({ directory: folder, fetchImpl: async () => pngResponse() }).get(
      CAMP,
      160
    );
    let calls = 0;
    const result = await createImageProxy({
      directory: folder,
      fetchImpl: async () => {
        calls += 1;
        return pngResponse();
      }
    }).get(CAMP, 160);
    assert.ok(result.body.length > 0);
    assert.equal(calls, 0);
  });

  test("failures: wrong type, error status, oversized, corrupt data, redirects — all give null and are remembered", async () => {
    const attempts = [
      () => pngResponse(Buffer.from("<svg/>"), "image/svg+xml"),
      () => new Response("nope", { status: 500 }),
      () =>
        new Response(big, {
          status: 200,
          headers: { "content-type": "image/png", "content-length": String(40 * 1024 * 1024) }
        }),
      () => pngResponse(Buffer.from("not an image at all"), "image/png")
    ];
    for (const attempt of attempts) {
      let calls = 0;
      const proxy = createImageProxy({
        directory: directory(),
        fetchImpl: async () => {
          calls += 1;
          return attempt();
        }
      });
      assert.equal(await proxy.get(CAMP, 480), null);
      assert.equal(await proxy.get(CAMP, 480), null);
      assert.equal(calls, 1, "a failure is not retried at once");
    }
    const redirecting = createImageProxy({
      directory: directory(),
      fetchImpl: async (_url, options) => {
        assert.equal(options.redirect, "error");
        throw new TypeError("redirect");
      }
    });
    assert.equal(await redirecting.get(CAMP, 480), null);
  });

  test("the browser-side helpers build the same addresses", () => {
    assert.equal(
      resized(CAMP, 100),
      `/media/img?w=160&u=${encodeURIComponent(CAMP)}&v=${PICTURE_RECIPE}`
    );
    assert.equal(
      resized(CAMP, 5000),
      `/media/img?w=1280&u=${encodeURIComponent(CAMP)}&v=${PICTURE_RECIPE}`
    );
    assert.equal(resized("/local.png", 100), "/local.png");
    assert.match(responsive(CAMP, 80), /srcset=".*160w, .*160w|srcset="[^"]*w/);
    assert.match(wide(CAMP, [320, 640, 960]), /320w, .* 640w, .* 960w/);
  });
});

const served = new Map();
const app = await startTestServer({
  imageProxy: {
    get: async (url, width) =>
      url === CAMP && Number(width) === 320
        ? { body: Buffer.from("RIFFxxxxWEBP"), key: "k1" }
        : url === "https://camp.honorofkings.com/down.png"
          ? null
          : { refused: true }
  }
});
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("GET /media/img", { skip }, () => {
  test("serves WebP with a one-year immutable cache and an ETag, and answers 304 to a revalidation", async () => {
    const response = await fetch(`${app.baseUrl}/media/img?w=320&u=${encodeURIComponent(CAMP)}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/webp");
    assert.match(response.headers.get("cache-control"), /max-age=31536000, immutable/);
    assert.equal(response.headers.get("etag"), '"k1"');
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const again = await fetch(`${app.baseUrl}/media/img?w=320&u=${encodeURIComponent(CAMP)}`, {
      headers: { "if-none-match": '"k1"' }
    });
    assert.equal(again.status, 304);
    served.set("ok", true);
  });

  test("a refused address or width is a 404; an unreachable image redirects to the original", async () => {
    assert.equal(
      (await fetch(`${app.baseUrl}/media/img?w=320&u=https%3A%2F%2Fevil.example%2Fa.png`)).status,
      404
    );
    assert.equal(
      (await fetch(`${app.baseUrl}/media/img?w=999&u=${encodeURIComponent(CAMP)}`)).status,
      404
    );
    assert.equal((await fetch(`${app.baseUrl}/media/img`)).status, 404);
    const down = await fetch(
      `${app.baseUrl}/media/img?w=320&u=${encodeURIComponent("https://camp.honorofkings.com/down.png")}`,
      { redirect: "manual" }
    );
    assert.equal(down.status, 302);
    assert.equal(down.headers.get("location"), "https://camp.honorofkings.com/down.png");
  });

  test("the proxy needs no sign-in and sets no cookie", async () => {
    const response = await fetch(`${app.baseUrl}/media/img?w=320&u=${encodeURIComponent(CAMP)}`);
    assert.equal(response.headers.get("set-cookie"), null);
  });
});

describe("decoder allow-list", () => {
  test("a file that is not PNG/JPEG/WebP/GIF is refused whatever its Content-Type says", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'
    );
    const tiff = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } })
      .tiff()
      .toBuffer();
    for (const body of [svg, tiff]) {
      const proxy = createImageProxy({
        directory: directory(),
        fetchImpl: async () => pngResponse(body, "image/png")
      });
      assert.equal(await proxy.get(CAMP, 160), null);
    }
  });
});

describe("what the image proxy keeps is bounded", () => {
  const noise = async (side = 400) =>
    sharp(randomBytes(side * side * 3), { raw: { width: side, height: side, channels: 3 } })
      .png()
      .toBuffer();
  const camp = index => `https://camp.honorofkings.com/manage_material/p/${index}.png`;

  test("failed addresses are remembered for a while, but only so many", async () => {
    let calls = 0;
    const proxy = createImageProxy({
      directory: directory(),
      fetchImpl: async () => {
        calls += 1;
        return new Response("no", { status: 404 });
      }
    });
    assert.equal(await proxy.get(camp(0), 160), null);
    assert.equal(await proxy.get(camp(0), 160), null);
    assert.equal(calls, 1, "the second ask does not go out again");
    for (let index = 1; index <= 2100; index += 1) {
      await proxy.get(camp(index), 160);
    }
    calls = 0;
    await proxy.get(camp(0), 160);
    assert.equal(
      calls,
      1,
      "the oldest failure was forgotten: the memory does not grow with the asking"
    );
    calls = 0;
    await proxy.get(camp(2100), 160);
    assert.equal(calls, 0, "the newest is still remembered");
  });

  test("past a few waiting requests the proxy says it is busy at once, and remembers nothing against the address", async () => {
    let release = () => {};
    const gate = new Promise(resolve => (release = resolve));
    let calls = 0;
    const picture = await noise(120);
    const proxy = createImageProxy({
      directory: directory(),
      concurrency: 1,
      fetchImpl: async () => {
        calls += 1;
        await gate;
        return pngResponse(picture);
      }
    });
    const first = proxy.get(camp(1), 160); // takes the one slot
    const waiting = Array.from({ length: 64 }, (_, index) => proxy.get(camp(100 + index), 160));
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(await proxy.get(camp(999), 160), null, "the 66th does not wait");
    release();
    assert.ok((await first).body);
    for (const answer of await Promise.all(waiting)) {
      assert.ok(answer.body);
    }
    calls = 0;
    assert.ok((await proxy.get(camp(999), 160)).body, "it was only load: asked again, it works");
    assert.equal(calls, 1);
  });

  test("the pictures on disk stay under their budget: the oldest go first, other files are never touched", async () => {
    const folder = directory();
    const picture = await noise(400);
    const proxy = createImageProxy({
      directory: folder,
      diskBudgetBytes: 60_000,
      fetchImpl: async () => pngResponse(picture)
    });
    for (let index = 0; index < 6; index += 1) {
      assert.ok((await proxy.get(camp(index), 160)).body);
    }
    const mine = readdirSync(folder).filter(name => /^[0-9a-f]{40}.webp$/.test(name));
    assert.equal(mine.length, 6);
    // the order of their age is set by hand: written within the same millisecond, they would tie
    const aged = mine.map((name, index) => ({ name, time: new Date(2026, 0, 1 + index) }));
    for (const { name, time } of aged) {
      utimesSync(path.join(folder, name), time, time);
    }
    writeFileSync(path.join(folder, "notes.txt"), "keep");
    writeFileSync(path.join(folder, "abc.webp"), "keep");
    const total = () =>
      readdirSync(folder)
        .filter(name => /^[0-9a-f]{40}.webp$/.test(name))
        .reduce((sum, name) => sum + statSync(path.join(folder, name)).size, 0);
    assert.ok(total() > 60_000, "the six pictures are over the budget");
    const removed = await proxy.prune();
    assert.ok(removed >= 1);
    assert.ok(total() <= 60_000 * 0.8, `${total()} bytes left`);
    const left = readdirSync(folder);
    assert.ok(left.includes(aged.at(-1).name), "the newest is kept");
    assert.ok(!left.includes(aged[0].name), "the oldest is gone");
    assert.ok(
      left.includes("notes.txt") && left.includes("abc.webp"),
      "files that are not its own stay"
    );
    assert.equal(await proxy.prune(), 0, "under the budget there is nothing to do");
  });
});
