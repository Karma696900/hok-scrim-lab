// The pictures of items and arcana: kept at up to 256 px (they used to be shrunk to 128 px), WebP with
// its transparency, an arcana that was drawn small is made bigger with care, and the page can ask
// for the size it draws (64, 128 or 256 px) so a list of fifty items does not download fifty big
// pictures.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import sharp from "sharp";
import {
  CATALOG_IMAGE_SIZE,
  CATALOG_IMAGE_WIDTHS,
  catalogImageVariant,
  createVariantCache,
  processCatalogImage,
  variantWidth
} from "./catalog-image.js";
import { startTestServer } from "../../../testing/test-app.js";

/** A round badge with a soft edge and a white triangle: the kind of picture an item is, drawn pixel by pixel. */
const badge = async (size, format = "png") => {
  const data = Buffer.alloc(size * size * 4);
  const centre = (size - 1) / 2;
  const radius = size / 2 - 1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - centre, y - centre);
      const at = (y * size + x) * 4;
      const t = Math.min(1, distance / radius);
      const edge = Math.min(1, Math.max(0, radius + 0.5 - distance));
      const u = x / size;
      const v = y / size;
      const triangle = v >= 0.2 && v <= 0.5 && Math.abs(u - 0.5) <= ((v - 0.2) / 0.3) * 0.2;
      data[at] = triangle ? 255 : 255 - 117 * t;
      data[at + 1] = triangle ? 255 : 210 - 151 * t;
      data[at + 2] = triangle ? 255 : 122 - 104 * t;
      data[at + 3] = Math.round(255 * edge);
    }
  }
  const picture = sharp(data, { raw: { width: size, height: size, channels: 4 } });
  return (format === "webp" ? picture.webp() : picture.png()).toBuffer();
};
const dimensions = async bytes => {
  const meta = await sharp(bytes).metadata();
  return [meta.width, meta.height, meta.format, Boolean(meta.hasAlpha)];
};

describe("processing a picture (pure)", () => {
  test("the sizes that exist", () => {
    assert.equal(CATALOG_IMAGE_SIZE, 256);
    assert.deepEqual(CATALOG_IMAGE_WIDTHS, [64, 128, 256]);
  });

  test("an item: fitted inside 256 px, never made bigger, WebP, transparency kept", async () => {
    const big = await processCatalogImage(await badge(600), "image/png");
    assert.deepEqual(await dimensions(big), [256, 256, "webp", true]);
    const wide = await processCatalogImage(
      await sharp({ create: { width: 600, height: 300, channels: 4, background: "#c33" } })
        .png()
        .toBuffer(),
      "image/png"
    );
    assert.deepEqual((await dimensions(wide)).slice(0, 2), [256, 128], "not cropped");
    const small = await processCatalogImage(await badge(100), "image/png");
    assert.deepEqual((await dimensions(small)).slice(0, 2), [100, 100], "an item is not enlarged");
  });

  test("the picture stays close to the original: edges and transparency are not eaten", async () => {
    const source = await badge(256);
    const out = await processCatalogImage(source, "image/png");
    const a = await sharp(source).ensureAlpha().raw().toBuffer();
    const b = await sharp(out).ensureAlpha().raw().toBuffer();
    let sum = 0;
    for (let i = 0; i < a.length; i += 4) {
      const alphaA = a[i + 3] / 255;
      const alphaB = b[i + 3] / 255;
      for (let c = 0; c < 3; c += 1) {
        sum += (a[i + c] * alphaA - b[i + c] * alphaB) ** 2;
      }
      sum += (a[i + 3] - b[i + 3]) ** 2;
    }
    const psnr = 10 * Math.log10((255 * 255) / (sum / ((a.length / 4) * 4)));
    assert.ok(psnr > 38, `the picture lost too much (${psnr.toFixed(1)} dB)`);
    assert.equal(b[3], 0, "the corner is still transparent");
    const middle = (128 * 256 + 128) * 4;
    assert.equal(b[middle + 3], 255, "the middle is still opaque");
  });

  test("an arcana drawn small is made bigger, with care; a big one is left alone", async () => {
    const small = await processCatalogImage(await badge(64), "image/png", { kind: "arcana" });
    assert.deepEqual(await dimensions(small), [128, 128, "webp", true]);
    const same = await processCatalogImage(await badge(200), "image/png", { kind: "arcana" });
    assert.deepEqual((await dimensions(same)).slice(0, 2), [200, 200]);
    const asItem = await processCatalogImage(await badge(64), "image/png", { kind: "item" });
    assert.deepEqual((await dimensions(asItem)).slice(0, 2), [64, 64], "only arcana are enlarged");
  });

  test("the same refusals as before", async () => {
    for (const [bytes, type] of [
      [Buffer.from("nope"), "image/png"],
      [Buffer.alloc(0), "image/png"],
      [await badge(64), "text/plain"]
    ]) {
      await assert.rejects(processCatalogImage(bytes, type), error => error.status === 400);
    }
    await assert.rejects(
      processCatalogImage(Buffer.alloc(3 * 1024 * 1024 + 1), "image/png"),
      error => error.status === 400
    );
  });
});

describe("the sizes a page can ask for (pure)", () => {
  test("a width is one of 64, 128 or 256; anything else is the picture itself", () => {
    assert.equal(variantWidth("64"), 64);
    assert.equal(variantWidth("128"), 128);
    assert.equal(variantWidth("256"), 256);
    for (const odd of [
      undefined,
      "",
      "0",
      "-64",
      "100",
      "1000",
      "abc",
      "64.5",
      "64px",
      ["64"],
      {}
    ]) {
      assert.equal(variantWidth(odd), null, JSON.stringify(odd));
    }
  });

  test("a smaller copy is cut from the picture; a copy as big as the picture is the picture", async () => {
    const master = await processCatalogImage(await badge(600), "image/png");
    const [w64, w128] = await Promise.all([
      catalogImageVariant(master, 64),
      catalogImageVariant(master, 128)
    ]);
    assert.deepEqual((await dimensions(w64)).slice(0, 2), [64, 64]);
    assert.deepEqual((await dimensions(w128)).slice(0, 2), [128, 128]);
    assert.ok(w64.length < w128.length && w128.length < master.length, "smaller to download");
    assert.equal(await catalogImageVariant(master, 256), master);
    const tiny = await processCatalogImage(await badge(50), "image/png");
    assert.equal(await catalogImageVariant(tiny, 128), tiny, "never enlarged");
  });

  test("copies are kept for a while, a few of them", async () => {
    const cache = createVariantCache({ max: 2 });
    let made = 0;
    const make = value => async () => {
      made += 1;
      return Buffer.from(value);
    };
    await cache.get("a", 64, make("a64"));
    await cache.get("a", 64, make("again"));
    assert.equal(made, 1, "the second ask is answered from memory");
    await cache.get("b", 64, make("b64"));
    await cache.get("c", 64, make("c64"));
    await cache.get("a", 64, make("a64 once more"));
    assert.equal(made, 4, "the oldest copy was let go when the cache was full");
    assert.equal(
      (await cache.get("c", 64, make("never"))).toString(),
      "c64",
      "a recent one is still there"
    );
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const upload = async (browser, body, query = "") => {
  const response = await fetch(`${app.baseUrl}/api/admin/catalog/images${query}`, {
    method: "POST",
    headers: {
      "content-type": "image/png",
      cookie: [...browser.jar].map(([key, value]) => `${key}=${value}`).join("; ")
    },
    body
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const fetchImage = async (id, query = "", headers = {}) => {
  const response = await fetch(`${app.baseUrl}/catalog-images/${id}${query}`, { headers });
  return {
    status: response.status,
    type: response.headers.get("content-type"),
    cache: response.headers.get("cache-control"),
    etag: response.headers.get("etag"),
    bytes: Buffer.from(await response.arrayBuffer())
  };
};

describe("pictures through the API", { skip }, () => {
  test("an upload is kept at up to 256 px, and served in the size that is asked for", async () => {
    const admin = await app.signIn("Pictures", { admin: true });
    const sent = await upload(admin.browser, await badge(640));
    assert.equal(sent.status, 200, JSON.stringify(sent.body));

    const full = await fetchImage(sent.body.id);
    assert.equal(full.status, 200);
    assert.equal(full.type, "image/webp");
    assert.match(full.cache, /immutable/);
    assert.deepEqual((await dimensions(full.bytes)).slice(0, 2), [256, 256]);

    const sizes = {};
    for (const width of [64, 128, 256]) {
      const one = await fetchImage(sent.body.id, `?w=${width}`);
      assert.equal(one.status, 200, `w=${width}`);
      assert.equal(one.type, "image/webp");
      assert.match(one.cache, /immutable/);
      sizes[width] = (await dimensions(one.bytes)).slice(0, 2);
    }
    assert.deepEqual(sizes, { 64: [64, 64], 128: [128, 128], 256: [256, 256] });

    for (const odd of ["?w=100", "?w=0", "?w=abc", "?w=99999", "?w="]) {
      const one = await fetchImage(sent.body.id, odd);
      assert.equal(one.status, 200, odd);
      assert.deepEqual(
        (await dimensions(one.bytes)).slice(0, 2),
        [256, 256],
        `${odd}: the picture`
      );
    }
  });

  test("each size has its own validator, and a browser that has it is told nothing changed", async () => {
    const admin = await app.signIn("Pictures", { admin: true });
    const sent = await upload(admin.browser, await badge(300));
    const small = await fetchImage(sent.body.id, "?w=64");
    const big = await fetchImage(sent.body.id);
    assert.ok(small.etag && big.etag && small.etag !== big.etag);
    const again = await fetch(`${app.baseUrl}/catalog-images/${sent.body.id}?w=64`, {
      headers: { "if-none-match": small.etag }
    });
    assert.equal(again.status, 304);
    assert.equal((await fetchImage("not-an-id", "?w=64")).status, 404);
    assert.equal((await fetchImage("00000000-0000-4000-8000-000000000000", "?w=64")).status, 404);
  });

  test("an arcana picture sent small is made bigger when the page says it is an arcana", async () => {
    const admin = await app.signIn("Pictures", { admin: true });
    const asArcana = await upload(admin.browser, await badge(64), "?kind=arcana");
    assert.equal(asArcana.status, 200);
    assert.deepEqual(
      (await dimensions((await fetchImage(asArcana.body.id)).bytes)).slice(0, 2),
      [128, 128]
    );
    const asItem = await upload(admin.browser, await badge(64));
    assert.deepEqual(
      (await dimensions((await fetchImage(asItem.body.id)).bytes)).slice(0, 2),
      [64, 64]
    );
    const odd = await upload(admin.browser, await badge(64), "?kind=whatever");
    assert.equal(odd.status, 200, "an unknown kind is an item");
    assert.deepEqual(
      (await dimensions((await fetchImage(odd.body.id)).bytes)).slice(0, 2),
      [64, 64]
    );
  });

  test("an arcana can exist before its stats are written (up to four, never more)", async () => {
    const admin = await app.signIn("Pictures", { admin: true });
    const none = await admin.browser.post("/api/admin/catalog/arcana", {
      name: "Not yet detailed",
      color: "green",
      stats: []
    });
    assert.equal(none.status, 200, none.text);
    const missing = await admin.browser.post("/api/admin/catalog/arcana", {
      name: "No list at all",
      color: "green"
    });
    assert.equal(missing.status, 200, "no list is an empty list");
    const stats = [];
    for (const name of ["Pic A", "Pic B", "Pic C", "Pic D", "Pic E"]) {
      stats.push((await admin.browser.post("/api/admin/catalog/stats", { name })).body.id);
    }
    const four = await admin.browser.post("/api/admin/catalog/arcana", {
      name: "Four stats",
      color: "red",
      stats: stats.slice(0, 4).map(statId => ({ statId, value: 1 }))
    });
    assert.equal(four.status, 200, four.text);
    const five = await admin.browser.post("/api/admin/catalog/arcana", {
      name: "Five stats",
      color: "red",
      stats: stats.map(statId => ({ statId, value: 1 }))
    });
    assert.equal(five.status, 400);
  });
});
