// Series files: styled PDF/PNG downloads carrying their own data, a note, a chosen name, and import
// back.
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { after, describe, test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { renderExportHtml } from "../export/report-template.js";
import {
  buildPayload,
  decodePayload,
  embedInPdf,
  embedInPng,
  encodePayload,
  extractFromFile,
  extractFromPdf,
  extractFromPng,
  safeFileName,
  sniffFile
} from "./series-file.js";
import { parseExportOptions } from "../export/export-validation.js";
import {
  BLANK_PDF,
  buildExportService,
  CREATE_BODY,
  PIXEL_PNG,
  playFullDraft,
  startTestServer
} from "../../../testing/test-app.js";

const ids = (from, count) =>
  Array.from({ length: count }, (_, index) => `h${String(from + index).padStart(2, "0")}`);
const game = (blue = "Alpha", red = "Bravo", winner = blue, duration = 1500) => ({
  blueTeam: blue,
  redTeam: red,
  winner,
  durationSeconds: duration,
  draft: {
    bans: { blue: ids(21, 5), red: ids(26, 5) },
    picks: { blue: ids(1, 5), red: ids(11, 5) }
  }
});
const importBody = (games = [game()], overrides = {}) => ({
  teamA: { name: "Alpha" },
  teamB: { name: "Bravo" },
  bestOf: 3,
  gameMode: "free-for-all",
  games,
  ...overrides
});
const sample = () => ({
  id: "x",
  createdAt: "2026-09-30T09:00:00.000Z",
  updatedAt: "2026-09-30T10:00:00.000Z",
  teamA: { name: "Alpha" },
  teamB: { name: "Bravo" },
  bestOf: 3,
  winsRequired: 2,
  gameMode: "free-for-all",
  status: "complete",
  games: [{ ...game(), gameNumber: 1 }],
  currentGame: { draft: "live" },
  online: { invitationCode: "secret" },
  viewer: { role: "owner" },
  version: 4
});

describe("payload", () => {
  test("the envelope never carries live state, invitation codes or viewer data", () => {
    const payload = buildPayload([sample()], { comment: "Scrim vs Bravo" });
    assert.equal(payload.format, "hok-series");
    assert.equal(payload.comment, "Scrim vs Bravo");
    const text = JSON.stringify(payload);
    for (const leaked of ["secret", "invitationCode", "viewer", "live"]) {
      assert.ok(!text.includes(leaked), leaked);
    }
    assert.equal(payload.series[0].currentGame, null);
  });

  test("encode/decode round trip, and only our envelope is accepted", () => {
    const payload = buildPayload([sample()]);
    assert.deepEqual(decodePayload(encodePayload(payload)).series[0].teamA, { name: "Alpha" });
    for (const bad of [
      Buffer.from("not gzip"),
      gzipSync("not json"),
      gzipSync("{}"),
      gzipSync(JSON.stringify({ format: "other", version: 1, series: [{}] })),
      gzipSync(JSON.stringify({ format: "hok-series", version: 99, series: [{}] })),
      gzipSync(JSON.stringify({ format: "hok-series", version: 1, series: [] })),
      gzipSync(
        JSON.stringify({
          format: "hok-series",
          version: 1,
          series: Array.from({ length: 101 }, () => ({}))
        })
      )
    ]) {
      assert.throws(
        () => decodePayload(bad),
        error => error.status === 400 && error.code === "invalid_file"
      );
    }
  });

  test("a decompression bomb is refused instead of exhausting memory", () => {
    const bomb = gzipSync(Buffer.alloc(40 * 1024 * 1024, 0x20));
    assert.ok(bomb.length < 100_000);
    assert.throws(
      () => decodePayload(bomb),
      error => error.status === 400
    );
  });
});

describe("PDF and PNG containers", () => {
  const payload = encodePayload(buildPayload([sample()], { comment: "kept" }));

  test("a PDF keeps its pages and carries the data as a real attachment, plus title and note as metadata", async () => {
    const pdf = await embedInPdf(BLANK_PDF, payload, {
      title: "Alpha vs Bravo",
      comment: "Great scrim\nGG"
    });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.equal(sniffFile(pdf), "pdf");
    const document = await PDFDocument.load(pdf);
    assert.equal(document.getPageCount(), 1);
    assert.equal(document.getTitle(), "Alpha vs Bravo");
    assert.equal(document.getSubject(), "Great scrim GG");
    assert.equal((await extractFromPdf(pdf)).comment, "kept");
  });

  test("a PNG stays a valid image and carries the data in a tEXt chunk", () => {
    const png = embedInPng(PIXEL_PNG, payload);
    assert.equal(sniffFile(png), "png");
    assert.ok(png.length > PIXEL_PNG.length);
    assert.deepEqual(png.subarray(0, 8), PIXEL_PNG.subarray(0, 8));
    assert.equal(extractFromPng(png).series[0].teamB.name, "Bravo");
    assert.equal(png.subarray(png.length - 8, png.length - 4).toString("latin1"), "IEND");
  });

  test("files without our data, damaged files and foreign types are refused with a clear message", async () => {
    await assert.rejects(extractFromPdf(BLANK_PDF), /does not contain HOK series data/);
    await assert.rejects(
      extractFromPdf(Buffer.from("%PDF-1.4 garbage")),
      error => error.status === 400
    );
    assert.throws(() => extractFromPng(PIXEL_PNG), /does not contain HOK series data/);
    assert.throws(
      () => extractFromPng(PIXEL_PNG.subarray(0, 30)),
      error => error.status === 400
    );
    await assert.rejects(extractFromFile(Buffer.from("PK\u0003\u0004zip")), /PDF or PNG/);
    await assert.rejects(extractFromFile(Buffer.alloc(0)), /PDF or PNG/);
    const tampered = embedInPng(PIXEL_PNG, payload);
    tampered[tampered.length - 30] ^= 0xff;
    assert.ok(tampered.length > 0);
  });

  test("an attachment that is not ours (another gzip) is skipped, ours is still found", async () => {
    const other = await PDFDocument.load(BLANK_PDF);
    await other.attach(gzipSync('{"hello":1}'), "other.json.gz", { mimeType: "application/gzip" });
    const mixed = Buffer.from(await other.save());
    const both = await embedInPdf(mixed, payload);
    assert.equal((await extractFromPdf(both)).format, "hok-series");
  });
});

describe("download names and options", () => {
  test("names are sanitised: no path, no extension games, no control characters", () => {
    assert.equal(safeFileName("Finale Nova vs Orion", "x", "pdf"), "Finale Nova vs Orion.pdf");
    assert.equal(safeFileName("../../etc/passwd", "x", "pdf"), "etc_passwd.pdf");
    assert.equal(safeFileName("C:\\Windows\\evil.exe", "x", "png"), "C_Windows_evil.exe.png");
    assert.equal(safeFileName("report.PDF", "x", "pdf"), "report.pdf");
    assert.equal(safeFileName("  ..  ", "Alpha_vs_Bravo_BO3", "pdf"), "Alpha_vs_Bravo_BO3.pdf");
    assert.equal(safeFileName("é à ü", "x", "pdf"), "e a u.pdf");
    assert.equal(safeFileName("a\u0000b\nc", "x", "pdf"), "a_b_c.pdf");
    assert.ok(safeFileName("x".repeat(500), "x", "pdf").length <= 84);
    assert.equal(safeFileName(undefined, "fallback name!", "png"), "fallback_name_.png");
  });

  test("options: format, comment length and type are validated", () => {
    assert.deepEqual(parseExportOptions({}), { format: "pdf", comment: "", filename: "" });
    assert.deepEqual(
      parseExportOptions({ format: "png", comment: " hi\r\nthere\u0007 ", filename: " name " }),
      { format: "png", comment: "hi\nthere", filename: "name" }
    );
    assert.throws(() => parseExportOptions({ format: "json" }), /pdf or png/);
    assert.throws(() => parseExportOptions({ format: "png" }, { allowPng: false }), /pdf/);
    assert.throws(() => parseExportOptions({ comment: "x".repeat(501) }), /500/);
    assert.throws(() => parseExportOptions({ comment: 5 }), /text/);
    assert.throws(() => parseExportOptions({ filename: ["a"] }), /file name/);
  });

  test("the note appears in the report, escaped", () => {
    const html = renderExportHtml({
      generatedAt: "x",
      ownerName: "Coach",
      filters: {},
      series: [sample()],
      heroById: new Map(),
      portraitPath: () => null,
      comment: "Round 1 <script>alert(1)</script>\nsecond line"
    });
    assert.match(html, /<h3>Note<\/h3>/);
    assert.match(html, /Round 1 &lt;script&gt;/);
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /<h1>Alpha vs Bravo<\/h1>/, "a single series is titled with its teams");
    assert.doesNotMatch(
      renderExportHtml({
        generatedAt: "x",
        ownerName: "C",
        filters: {},
        series: [sample()],
        heroById: new Map(),
        portraitPath: () => null
      }),
      /<h3>Note<\/h3>/
    );
  });
});

const captured = [];
const stubExporter = {
  render: async ({ html }) => {
    captured.push(html);
    return { pdf: BLANK_PDF, blocked: [] };
  },
  renderPng: async ({ html }) => {
    captured.push(html);
    return { png: PIXEL_PNG, blocked: [] };
  }
};
const app = await startTestServer({
  exportService: store => buildExportService(store, { exporter: stubExporter })
});
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

async function rawPost(browser, path, body, contentType) {
  const cookie = [...browser.jar].map(([key, value]) => `${key}=${value}`).join("; ");
  const response = await fetch(`${app.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": contentType, ...(cookie ? { cookie } : {}) },
    body
  });
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const separator = pair.indexOf("=");
    if (/Max-Age=0/i.test(header)) {
      browser.jar.delete(pair.slice(0, separator));
    } else {
      browser.jar.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* binary */
  }
  return { status: response.status, body: json, headers: response.headers };
}
async function download(browser, path, options) {
  const cookie = [...browser.jar].map(([key, value]) => `${key}=${value}`).join("; ");
  const response = await fetch(`${app.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(options)
  });
  return {
    status: response.status,
    headers: response.headers,
    bytes: Buffer.from(await response.arrayBuffer())
  };
}
const seed = async (browser, games = [game(), game("Bravo", "Alpha", "Alpha", 1800)], overrides) =>
  (await browser.post("/api/series/import", importBody(games, overrides))).body;

describe("per-series export", { skip }, () => {
  test("PDF with a note and a chosen name: the file is named as asked, the note is printed, the data is embedded", async () => {
    const me = app.browser();
    const series = await seed(me);
    captured.length = 0;
    const file = await download(me, `/api/series/${series.id}/export`, {
      format: "pdf",
      comment: "Round 1 – strong draft",
      filename: "Finale Nova vs Orion"
    });
    assert.equal(file.status, 200);
    assert.equal(file.headers.get("content-type"), "application/pdf");
    assert.equal(
      file.headers.get("content-disposition"),
      'attachment; filename="Finale Nova vs Orion.pdf"'
    );
    assert.match(captured.at(-1), /Round 1 – strong draft/);
    const envelope = await extractFromPdf(file.bytes);
    assert.equal(envelope.comment, "Round 1 – strong draft");
    assert.equal(envelope.series[0].games.length, 2);
    assert.equal((await PDFDocument.load(file.bytes)).getSubject(), "Round 1 – strong draft");
  });

  test("PNG works the same way, with its own extension", async () => {
    const me = app.browser();
    const series = await seed(me);
    const file = await download(me, `/api/series/${series.id}/export`, {
      format: "png",
      filename: "recap",
      comment: "png note"
    });
    assert.equal(file.headers.get("content-type"), "image/png");
    assert.equal(file.headers.get("content-disposition"), 'attachment; filename="recap.png"');
    assert.equal(extractFromPng(file.bytes).comment, "png note");
  });

  test("the default name is Team_vs_Team_BOn; hostile names are neutralised; JSON is not a format", async () => {
    const me = app.browser();
    const series = await seed(me);
    assert.equal(
      (await download(me, `/api/series/${series.id}/export`, {})).headers.get(
        "content-disposition"
      ),
      'attachment; filename="Alpha_vs_Bravo_BO3.pdf"'
    );
    assert.equal(
      (
        await download(me, `/api/series/${series.id}/export`, {
          filename: '..\\..\\x"\r\nSet-Cookie: a=b'
        })
      ).headers
        .get("content-disposition")
        .includes("\n"),
      false
    );
    assert.equal(
      (await me.post(`/api/series/${series.id}/export`, { format: "json" })).status,
      400
    );
    assert.equal(
      (await me.post(`/api/series/${series.id}/export`, { comment: "x".repeat(501) })).status,
      400
    );
  });

  test("only people who can see the series can export it; viewers can; strangers get 404", async () => {
    const owner = app.browser();
    const series = await seed(owner);
    assert.equal((await app.browser().post(`/api/series/${series.id}/export`, {})).status, 401);
    assert.equal(
      (await (await app.signIn("Stranger")).browser.post(`/api/series/${series.id}/export`, {}))
        .status,
      404
    );
    const viewer = app.browser();
    await viewer.post("/api/invites/accept", {
      token: (await owner.post(`/api/series/${series.id}/invites`, { role: "viewer" })).body.token
    });
    assert.equal((await download(viewer, `/api/series/${series.id}/export`, {})).status, 200);
    assert.equal((await owner.post("/api/series/not-a-uuid/export", {})).status, 400);
  });

  test("a series that is still being drafted exports its finished games only", async () => {
    const me = app.browser();
    const { body: live } = await me.post("/api/series", {
      ...CREATE_BODY,
      teamA: "Live A",
      teamB: "Live B"
    });
    await me.post(`/api/series/${live.id}/game`, { blueTeam: "Live A" });
    await me.post(`/api/series/${live.id}/game/ready`);
    await playFullDraft(me, live.id);
    const envelope = await extractFromPdf(
      (await download(me, `/api/series/${live.id}/export`, {})).bytes
    );
    assert.equal(envelope.series[0].games.length, 0);
    assert.equal(envelope.series[0].currentGame, null);
  });

  test("a PNG is limited to 15 games with a pointer to the PDF", async () => {
    const me = app.browser();
    const big = await seed(
      me,
      Array.from({ length: 16 }, (_, index) =>
        game(index % 2 ? "Bravo" : "Alpha", index % 2 ? "Alpha" : "Bravo", "Alpha", 1000 + index)
      ),
      { bestOf: 99 }
    );
    const refused = await me.post(`/api/series/${big.id}/export`, { format: "png" });
    assert.equal(refused.status, 422);
    assert.equal(refused.body.code, "png_too_large");
    assert.match(refused.body.error, /PDF/);
    assert.equal(
      (await download(me, `/api/series/${big.id}/export`, { format: "pdf" })).status,
      200
    );
  });

  test("the History export takes a note and a name too, and stays PDF only", async () => {
    const me = app.browser();
    await seed(me);
    const file = await download(me, "/api/export/pdf", {
      comment: "Season review",
      filename: "season-1"
    });
    assert.equal(file.headers.get("content-disposition"), 'attachment; filename="season-1.pdf"');
    assert.equal((await extractFromPdf(file.bytes)).comment, "Season review");
    assert.equal((await me.post("/api/export/pdf", { format: "png" })).status, 400);
  });
});

describe("import from a generated file", { skip }, () => {
  test("PDF round trip: games, winners, durations, drafts, mode and format come back as a NEW series owned by the importer", async () => {
    const author = app.browser();
    const original = await seed(author, [game(), game("Bravo", "Alpha", "Alpha", 1800)], {
      gameMode: "global-ban-pick"
    });
    const file = await download(author, `/api/series/${original.id}/export`, {
      comment: "back me up"
    });
    const importer = app.browser();
    const response = await rawPost(
      importer,
      "/api/series/import-file",
      file.bytes,
      "application/pdf"
    );
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.imported, 1);
    assert.equal(response.body.comment, "back me up");
    const restored = (await importer.get(`/api/series/${response.body.series[0].id}`)).body;
    assert.notEqual(restored.id, original.id);
    assert.deepEqual(
      [
        restored.teamA.name,
        restored.teamB.name,
        restored.bestOf,
        restored.gameMode,
        restored.status
      ],
      ["Alpha", "Bravo", 3, "global-ban-pick", "complete"]
    );
    assert.deepEqual(
      restored.games.map(item => [item.winner, item.durationSeconds, item.blueTeam]),
      [
        ["Alpha", 1500, "Alpha"],
        ["Alpha", 1800, "Bravo"]
      ]
    );
    assert.deepEqual(restored.games[0].draft.picks, original.games[0].draft.picks);
    assert.equal(restored.viewer.role, "owner");
    assert.equal(
      (await author.get(`/api/series/${original.id}`)).body.games.length,
      2,
      "the original is untouched"
    );
  });

  test("PNG round trip", async () => {
    const author = app.browser();
    const original = await seed(author);
    const file = await download(author, `/api/series/${original.id}/export`, { format: "png" });
    const importer = app.browser();
    const response = await rawPost(importer, "/api/series/import-file", file.bytes, "image/png");
    assert.equal(response.status, 200);
    assert.equal(
      (await importer.get(`/api/series/${response.body.series[0].id}`)).body.games.length,
      2
    );
  });

  test("a multi-series History PDF restores every series", async () => {
    const author = app.browser();
    for (const name of ["Multi One", "Multi Two", "Multi Three"]) {
      await seed(author, [game(name, `${name} rival`)], {
        teamA: { name },
        teamB: { name: `${name} rival` }
      });
    }
    const file = await download(author, "/api/export/pdf", { q: "Multi" });
    const importer = app.browser();
    const response = await rawPost(
      importer,
      "/api/series/import-file",
      file.bytes,
      "application/pdf"
    );
    assert.equal(response.body.imported, 3);
    assert.equal((await importer.get("/api/series?view=summary")).body.total, 3);
  });

  test("the file type is read from the bytes, not from the declared content type", async () => {
    const author = app.browser();
    const original = await seed(author);
    const file = await download(author, `/api/series/${original.id}/export`, {});
    assert.equal(
      (
        await rawPost(
          app.browser(),
          "/api/series/import-file",
          file.bytes,
          "application/octet-stream"
        )
      ).status,
      200
    );
  });

  test("hostile or foreign files are refused with a clear 400 and create nothing", async () => {
    const importer = app.browser();
    const before = (await importer.get("/api/series?view=summary")).body.total;
    const author = app.browser();
    const original = await seed(author);
    const goodPdf = (await download(author, `/api/series/${original.id}/export`, {})).bytes;
    const payloadOf = series =>
      encodePayload({ format: "hok-series", version: 1, exportedAt: "x", comment: "", series });
    const forged = async series => embedInPdf(BLANK_PDF, payloadOf(series));
    const goodSeries = (await extractFromPdf(goodPdf)).series[0];
    const cases = {
      "random bytes": [Buffer.from("hello world, not a file"), "application/pdf"],
      empty: [Buffer.alloc(0), "application/pdf"],
      "plain pdf": [BLANK_PDF, "application/pdf"],
      "plain png": [PIXEL_PNG, "image/png"],
      zip: [Buffer.from("PK\u0003\u0004rest"), "application/octet-stream"],
      "forged: unknown hero": [
        await forged([
          {
            ...goodSeries,
            games: [
              {
                ...goodSeries.games[0],
                draft: {
                  ...goodSeries.games[0].draft,
                  picks: { blue: ["nope", "h02", "h03", "h04", "h05"], red: ids(11, 5) }
                }
              }
            ]
          }
        ]),
        "application/pdf"
      ],
      "forged: winner not a team": [
        await forged([{ ...goodSeries, games: [{ ...goodSeries.games[0], winner: "Mallory" }] }]),
        "application/pdf"
      ],
      "forged: extra fields": [await forged([{ ...goodSeries, isAdmin: true }]), "application/pdf"],
      "forged: html team name": [
        await forged([{ ...goodSeries, teamA: { name: "<img onerror=x>" }, games: [] }]),
        "application/pdf"
      ]
    };
    for (const [label, [bytes, type]] of Object.entries(cases)) {
      const response = await rawPost(importer, "/api/series/import-file", bytes, type);
      assert.equal(response.status, 400, `${label}: ${JSON.stringify(response.body)}`);
      assert.equal(typeof response.body.error, "string");
    }
    assert.equal(
      (await importer.get("/api/series?view=summary")).body.total,
      before,
      "nothing was created"
    );
  });

  test("a forged id cannot overwrite an existing series: ids are always regenerated", async () => {
    const victim = app.browser();
    const original = await seed(victim);
    const goodSeries = (
      await extractFromPdf((await download(victim, `/api/series/${original.id}/export`, {})).bytes)
    ).series[0];
    const attacker = app.browser();
    const file = await embedInPdf(
      BLANK_PDF,
      encodePayload({
        format: "hok-series",
        version: 1,
        exportedAt: "x",
        comment: "",
        series: [{ ...goodSeries, id: original.id, teamA: { name: "Pwned" }, games: [] }]
      })
    );
    const response = await rawPost(attacker, "/api/series/import-file", file, "application/pdf");
    assert.equal(response.status, 200);
    assert.notEqual(response.body.series[0].id, original.id);
    assert.equal((await victim.get(`/api/series/${original.id}`)).body.teamA.name, "Alpha");
  });

  test("oversized uploads are refused (413) and cross-site uploads are blocked", async () => {
    assert.equal(
      (
        await rawPost(
          app.browser(),
          "/api/series/import-file",
          Buffer.alloc(13 * 1024 * 1024, 1),
          "application/pdf"
        )
      ).status,
      413
    );
    const cookie = "";
    const response = await fetch(`${app.baseUrl}/api/series/import-file`, {
      method: "POST",
      headers: { "content-type": "application/pdf", origin: "https://evil.example", cookie },
      body: BLANK_PDF
    });
    assert.equal(response.status, 403);
  });

  test("series import via JSON is no longer part of the product surface: the UI offers files only", async () => {
    const { clientSource } = await import("../../../testing/sources.js");
    const client = clientSource();
    assert.doesNotMatch(client, /downloadJson\([^)]*series/i);
    assert.doesNotMatch(
      client,
      /action === "export-game"|action === "export-series"|Download series JSON|Download game/
    );
    assert.doesNotMatch(client, /\/api\/series\/import"/, "the client never posts series JSON");
    assert.match(client, /series\/import-file/);
  });
});
