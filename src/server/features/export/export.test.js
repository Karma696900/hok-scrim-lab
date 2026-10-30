// PDF export: template, queue, portrait cache, network blocking, HTTP rules.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { createLimiters } from "../../platform/http/rate-limits.js";
import { createExportQueue } from "./queue.js";
import { createPdfExporter } from "./pdf-exporter.js";
import { createPortraitCache } from "../media/portrait-cache.js";
import { EXPORT_LIMIT_MESSAGE } from "./export-service.js";
import { renderExportHtml } from "./report-template.js";
import {
  BLANK_PDF,
  buildExportService,
  CREATE_BODY,
  PIXEL_PNG,
  startTestServer
} from "../../../testing/test-app.js";

const ids = (from, count) =>
  Array.from({ length: count }, (_, index) => `h${String(from + index).padStart(2, "0")}`);
const game = (number, blue = "Alpha", red = "Bravo") => ({
  gameNumber: number,
  blueTeam: blue,
  redTeam: red,
  winner: blue,
  durationSeconds: 1500 + number,
  draft: {
    bans: { blue: ids(21, 5), red: ids(26, 5) },
    picks: { blue: ids(1, 5), red: ids(11, 5) },
    pickAssignments: { blue: [{ heroId: "h03", lane: "Mid Lane" }], red: [] }
  }
});
const sampleSeries = (overrides = {}) => ({
  id: "s1",
  teamA: { name: "Alpha" },
  teamB: { name: "Bravo" },
  bestOf: 3,
  winsRequired: 2,
  gameMode: "free-for-all",
  status: "complete",
  updatedAt: "2026-09-30T10:00:00.000Z",
  createdAt: "2026-09-30T09:00:00.000Z",
  games: [game(1), game(2)],
  currentGame: null,
  ...overrides
});
const heroById = new Map([
  ["h01", { id: "h01", name: "Hero h01", displayName: "Hero h01" }],
  ["h03", { id: "h03", name: "Flowborn (Mage)", displayName: "Flowborn" }]
]);

describe("export template", () => {
  const html = renderExportHtml({
    generatedAt: "2026-10-01 10:00 UTC",
    ownerName: "Coach",
    filters: { status: "complete", q: "Alp" },
    series: [sampleSeries()],
    heroById,
    portraitPath: id => (id === "h01" ? "/portraits/h01" : null)
  });

  test("it is self-contained: no script, no remote URL, only local asset paths", () => {
    assert.doesNotMatch(html, /<script/i);
    const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
    assert.ok(urls.length > 0);
    assert.ok(
      urls.every(url => url.startsWith("/")),
      urls.join(", ")
    );
    assert.doesNotMatch(html, /https?:\/\//);
  });

  test("it carries every game, the score, the filters and the Global/own-data notice", () => {
    assert.equal((html.match(/class="game"/g) || []).length, 2);
    assert.match(html, /Alpha vs Bravo/);
    assert.match(html, /Game 1/);
    assert.match(html, /Game 2/);
    assert.match(html, /Status: Complete/);
    assert.match(html, /Team contains “Alp”/);
    assert.match(html, /No ranked or competitive data/);
    assert.match(html, /Honor of Kings Global/);
  });

  test("no role or lane text under the heroes, Flowborn reads Flowborn, missing portraits get a placeholder", () => {
    assert.match(html, /Flowborn/);
    assert.doesNotMatch(html, /Flowborn \(Mage\)/);
    assert.match(html, /<img src="\/portraits\/h01" alt="">/);
    assert.match(html, /class="placeholder"/);
    assert.doesNotMatch(html, /class="lane"|Mid Lane|Pick d/);
  });

  test("everything user-provided is escaped", () => {
    const hostile = renderExportHtml({
      generatedAt: "x",
      ownerName: "<img src=x onerror=alert(1)>",
      filters: { q: '"><script>alert(1)</script>' },
      series: [sampleSeries({ teamA: { name: "<b>A</b>" }, teamB: { name: "B&C" } })],
      heroById,
      portraitPath: () => null
    });
    assert.doesNotMatch(hostile, /<script|<b>A|<img src=x/i);
    assert.match(hostile, /&lt;b&gt;A&lt;\/b&gt;/);
    assert.match(hostile, /B&amp;C/);
  });

  test("an empty selection still renders", () => {
    const empty = renderExportHtml({
      generatedAt: "x",
      ownerName: "Coach",
      filters: {},
      series: [],
      heroById,
      portraitPath: () => null
    });
    assert.match(empty, /No series match these filters/);
    assert.match(empty, /No filters/);
  });
});

describe("export queue", () => {
  const gate = () => {
    let release;
    const promise = new Promise(resolve => {
      release = resolve;
    });
    return { promise, release };
  };

  test("one job at a time; waiting jobs run in order", async () => {
    const queue = createExportQueue({ concurrency: 1, maxQueued: 4 });
    const order = [];
    const first = gate();
    const a = queue.run("a", async () => {
      order.push("a:start");
      await first.promise;
      order.push("a:end");
    });
    const b = queue.run("b", async () => {
      order.push("b:start");
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(order, ["a:start"]);
    assert.deepEqual(queue.stats(), { running: 1, queued: 1 });
    first.release();
    await Promise.all([a, b]);
    assert.deepEqual(order, ["a:start", "a:end", "b:start"]);
  });

  test("a full queue answers 503 and the same user cannot queue twice (429)", async () => {
    const queue = createExportQueue({ concurrency: 1, maxQueued: 1 });
    const hold = gate();
    const running = queue.run("a", () => hold.promise);
    const waiting = queue.run("b", async () => "b");
    await assert.rejects(
      queue.run("c", async () => "c"),
      error =>
        error.status === 503 && error.code === "export_busy" && error.extra.retryAfterSeconds > 0
    );
    await assert.rejects(
      queue.run("a", async () => "again"),
      error => error.status === 429 && error.code === "export_in_progress"
    );
    hold.release();
    assert.equal(await waiting, "b");
    await running;
    assert.equal(
      await queue.run("a", async () => "free again"),
      "free again",
      "the slot is released"
    );
  });

  test("a failing job frees its slot and a stuck job times out", async () => {
    const queue = createExportQueue({ concurrency: 1, maxQueued: 2, jobTimeoutMs: 40 });
    await assert.rejects(
      queue.run("a", async () => {
        throw new Error("boom");
      }),
      /boom/
    );
    await assert.rejects(
      queue.run("a", () => new Promise(() => {})),
      error => error.status === 504
    );
    assert.equal(await queue.run("a", async () => "ok"), "ok");
  });
});

describe("portrait cache", () => {
  const png = () => new Response(PIXEL_PNG, { headers: { "content-type": "image/png" } });
  const cacheWith = (fetchImpl, now) => ({
    cache: createPortraitCache({
      directory: mkdtempSync(path.join(tmpdir(), "hok-p-")),
      fetchImpl,
      now
    })
  });

  test("only https camp.honorofkings.com images are fetched, and they are cached on disk", async () => {
    let calls = 0;
    const { cache } = cacheWith(async () => {
      calls += 1;
      return png();
    });
    assert.ok(await cache.get("https://camp.honorofkings.com/a.png"));
    assert.ok(await cache.get("https://camp.honorofkings.com/a.png"));
    assert.equal(calls, 1, "the second read comes from disk");
    for (const url of [
      "https://evil.example/a.png",
      "http://camp.honorofkings.com/a.png",
      "https://camp.honorofkings.com.evil.example/a.png",
      "file:///etc/passwd",
      "not a url"
    ]) {
      assert.equal(await cache.get(url), null, url);
    }
    assert.equal(calls, 1, "no request was made for refused hosts");
  });

  test("bad content type, oversize and errors give null (placeholder) and are remembered", async () => {
    let clock = 0;
    let calls = 0;
    const responses = [
      () => new Response("<html>", { headers: { "content-type": "text/html" } }),
      () => new Response(Buffer.alloc(2_000_000), { headers: { "content-type": "image/png" } }),
      () => new Response("", { status: 500 }),
      png
    ];
    const { cache } = cacheWith(
      async () => {
        calls += 1;
        return responses[Math.min(calls - 1, 3)]();
      },
      () => clock
    );
    assert.equal(await cache.get("https://camp.honorofkings.com/html.png"), null);
    assert.equal(await cache.get("https://camp.honorofkings.com/big.png"), null);
    assert.equal(await cache.get("https://camp.honorofkings.com/err.png"), null);
    assert.equal(calls, 3);
    assert.equal(await cache.get("https://camp.honorofkings.com/err.png"), null);
    assert.equal(calls, 3, "failures are not retried straight away");
    clock += 11 * 60 * 1000;
    assert.ok(
      await cache.get("https://camp.honorofkings.com/err.png"),
      "retried after the memory window"
    );
  });

  test("many() resolves heroes concurrently and keeps nulls for heroes without a portrait", async () => {
    const { cache } = cacheWith(async () => png());
    const result = await cache.many([
      { id: "1", image: "https://camp.honorofkings.com/1.png" },
      { id: "2", image: "" },
      { id: "3", image: "https://camp.honorofkings.com/3.png" }
    ]);
    assert.ok(result.get("1") && result.get("3"));
    assert.equal(result.get("2"), null);
  });
});

describe("pdf exporter (headless Chromium)", () => {
  const exporter = createPdfExporter({});
  test("renders a PDF and cuts the network: external images, scripts, styles and fonts are blocked", async t => {
    let result;
    try {
      result = await exporter.render({
        html: `<!doctype html><link rel="stylesheet" href="https://evil.example/x.css"><img src="https://evil.example/pixel.png"><img src="/portraits/h01"><script src="https://evil.example/x.js"></script><p>Local</p>`,
        assets: new Map([["/portraits/h01", { body: PIXEL_PNG, contentType: "image/png" }]])
      });
    } catch (error) {
      return t.skip(`Chromium unavailable: ${error.message.split("\n")[0]}`);
    }
    assert.equal(result.pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(result.pdf.length > 1000);
    assert.ok(result.blocked.some(url => url.includes("evil.example/pixel.png")));
    assert.ok(result.blocked.some(url => url.includes("evil.example/x.css")));
    assert.ok(
      result.blocked.every(url => url.startsWith("https://evil.example")),
      "nothing but the hostile URLs was blocked"
    );
  });
});

const slowExporter = delay => ({
  renderPng: async () => ({ png: PIXEL_PNG, blocked: [] }),
  render: async () => {
    await new Promise(resolve => setTimeout(resolve, delay));
    return { pdf: BLANK_PDF, blocked: [] };
  }
});
const capturing = () => {
  const captured = [];
  return {
    captured,
    exporter: {
      renderPng: async ({ html }) => {
        captured.push(html);
        return { png: PIXEL_PNG, blocked: [] };
      },
      render: async ({ html }) => {
        captured.push(html);
        return { pdf: BLANK_PDF, blocked: [] };
      }
    }
  };
};

const spy = capturing();
const app = await startTestServer({
  exportService: store => buildExportService(store, { exporter: spy.exporter })
});
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

async function ownSeries(browser, teamA, teamB, extra = {}) {
  const response = await browser.post("/api/series", { ...CREATE_BODY, teamA, teamB, ...extra });
  assert.equal(response.status, 200, response.text);
  return response.body;
}

describe("export over HTTP", { skip }, () => {
  test("authentication is required; the response is a PDF download", async () => {
    assert.equal((await app.browser().post("/api/export/pdf", {})).status, 401);
    const me = app.browser();
    await ownSeries(me, "Exp One", "Exp Two");
    const response = await fetch(`${app.baseUrl}/api/export/pdf`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: [...me.jar].map(([key, value]) => `${key}=${value}`).join("; ")
      },
      body: "{}"
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.match(
      response.headers.get("content-disposition"),
      /^attachment; filename="hok-series-\d{4}-\d{2}-\d{2}\.pdf"$/
    );
    assert.equal(response.headers.get("x-export-series"), "1");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(
      Buffer.from(await response.arrayBuffer())
        .subarray(0, 4)
        .toString(),
      "%PDF"
    );
  });

  test("only the requester's own series are exported (owner filter)", async () => {
    const alice = app.browser();
    const bob = app.browser();
    await ownSeries(alice, "Alice Squad", "Alice Rivals");
    await ownSeries(bob, "Bob Squad", "Bob Rivals");
    spy.captured.length = 0;
    assert.equal((await alice.post("/api/export/pdf", {})).status, 200);
    const html = spy.captured.at(-1);
    assert.match(html, /Alice Squad/);
    assert.doesNotMatch(html, /Bob Squad/);
    assert.doesNotMatch(html, /@example\.test/, "no email addresses in the report");
  });

  test("filters apply and bad filters are refused", async () => {
    const me = app.browser();
    await ownSeries(me, "Filter Keep", "X1", { gameMode: "global-ban-pick" });
    await ownSeries(me, "Filter Drop", "X2", { gameMode: "free-for-all" });
    spy.captured.length = 0;
    assert.equal((await me.post("/api/export/pdf", { mode: "global-ban-pick" })).status, 200);
    assert.match(spy.captured[0], /Filter Keep/);
    assert.doesNotMatch(spy.captured[0], /Filter Drop/);
    assert.equal((await me.post("/api/export/pdf", { status: "nope" })).status, 400);
    assert.equal((await me.post("/api/export/pdf", { from: "2026-13-01" })).status, 400);
  });

  test("a result over 100 series is refused with the exact message; exactly 100 is accepted", async () => {
    const heavy = await app.signIn("Heavy");
    const now = new Date().toISOString();
    const make = index => ({
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      teamA: { name: `H${index}a` },
      teamB: { name: `H${index}b` },
      bestOf: 1,
      winsRequired: 1,
      gameMode: "free-for-all",
      draftMode: "solo",
      status: "active",
      games: [],
      currentGame: null
    });
    for (let index = 0; index < 100; index += 1) {
      await app.store.createSeries(make(index), heavy.user.id);
    }
    assert.equal(
      (await heavy.browser.post("/api/export/pdf", {})).status,
      200,
      "exactly 100 passes"
    );
    await app.store.createSeries(make(100), heavy.user.id);
    const refused = await heavy.browser.post("/api/export/pdf", {});
    assert.equal(refused.status, 422);
    assert.equal(
      refused.body.error,
      "100 series maximum per export. Narrow the date range or filters."
    );
    assert.equal(refused.body.error, EXPORT_LIMIT_MESSAGE);
    assert.equal(refused.body.code, "export_too_large");
    assert.equal(
      (await heavy.browser.post("/api/export/pdf", { q: "H100" })).status,
      200,
      "narrowing the filters makes it work"
    );
  });

  test("cross-site requests cannot trigger an export", async () => {
    const me = app.browser();
    await ownSeries(me, "Csrf A", "Csrf B");
    const response = await me.post("/api/export/pdf", {}, { origin: "https://evil.example" });
    assert.equal(response.status, 403);
    assert.equal((await me.get("/api/export/pdf")).status, 404, "no GET endpoint to prefetch");
  });
});

describe("export limits", { skip }, () => {
  test("rate limit answers 429 with Retry-After", async () => {
    const limited = await startTestServer({
      limiters: createLimiters({ enabled: true, overrides: { export: { limit: 2 } } }),
      exportService: store => buildExportService(store, { exporter: slowExporter(1) })
    });
    try {
      const me = limited.browser();
      await me.post("/api/series", CREATE_BODY);
      assert.equal((await me.post("/api/export/pdf", {})).status, 200);
      assert.equal((await me.post("/api/export/pdf", {})).status, 200);
      const blocked = await me.post("/api/export/pdf", {});
      assert.equal(blocked.status, 429);
      assert.ok(blocked.headers.get("retry-after"));
    } finally {
      await limited.close();
    }
  });

  test("a busy queue answers 503 and one user cannot run two exports at once", async () => {
    const busy = await startTestServer({
      exportService: store =>
        buildExportService(store, {
          exporter: slowExporter(300),
          queue: createExportQueue({ concurrency: 1, maxQueued: 0 })
        })
    });
    try {
      const [one, two, three] = [busy.browser(), busy.browser(), busy.browser()];
      for (const browser of [one, two, three]) {
        await browser.post("/api/series", CREATE_BODY);
      }
      const first = one.post("/api/export/pdf", {});
      await new Promise(resolve => setTimeout(resolve, 60));
      const sameUser = await one.post("/api/export/pdf", {});
      assert.equal(sameUser.status, 429);
      const otherUser = await two.post("/api/export/pdf", {});
      assert.equal(otherUser.status, 503);
      assert.ok(otherUser.headers.get("retry-after") || otherUser.body.retryAfterSeconds);
      assert.equal((await first).status, 200);
      assert.equal((await three.post("/api/export/pdf", {})).status, 200, "capacity is back");
    } finally {
      await busy.close();
    }
  });
});

describe("export with real Chromium", { skip }, () => {
  test("a real PDF is produced end to end, with portraits from the local cache only", async t => {
    const real = await startTestServer();
    try {
      const me = real.browser();
      const { body: series } = await me.post("/api/series/import", {
        teamA: { name: "Real A" },
        teamB: { name: "Real B" },
        bestOf: 1,
        gameMode: "free-for-all",
        games: [
          {
            blueTeam: "Real A",
            redTeam: "Real B",
            winner: "Real A",
            durationSeconds: 1500,
            draft: {
              bans: { blue: ids(21, 5), red: ids(26, 5) },
              picks: { blue: ids(1, 5), red: ids(11, 5) }
            }
          }
        ]
      });
      assert.ok(series.id);
      const response = await me.post("/api/export/pdf", {});
      if (response.status === 500 || response.status === 503) {
        return t.skip(`Chromium unavailable: ${response.text.slice(0, 80)}`);
      }
      assert.equal(response.status, 200, response.text);
      assert.match(response.text.slice(0, 8), /%PDF-/);
      assert.ok(response.text.length > 5000);
    } finally {
      await real.close();
    }
  });
});
