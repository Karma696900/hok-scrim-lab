// The scripts and styles of dist/ are served from the copies the build compressed at the best level
// (server/platform/http/assets.js): the right copy for what the visitor accepts, the right type, no
// `Vary` on the cookie, and the plain file for anyone else or when no copy exists.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync } from "node:zlib";
import compression from "compression";
import express from "express";
import http from "node:http";
import { serveAssets } from "./assets.js";

const SCRIPT = `export const hello = "${"hello ".repeat(200)}";\n`;
let server;
let base;
let vanishing;

// like app.js: language and cookie vary the pages, so the assets must say they do not
const request = (path, encoding, { method = "GET", headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    http
      .request(
        `${base}${path}`,
        {
          method,
          headers: {
            ...(encoding === undefined ? {} : { "accept-encoding": encoding }),
            ...headers
          }
        },
        response => {
          const chunks = [];
          response.on("data", chunk => chunks.push(chunk));
          response.on("end", () =>
            resolve({
              status: response.statusCode,
              headers: response.headers,
              body: Buffer.concat(chunks)
            })
          );
        }
      )
      .on("error", reject)
      .end();
  });

describe("precompressed scripts and styles", () => {
  before(async () => {
    const folder = mkdtempSync(path.join(tmpdir(), "hok-dist-"));
    const dist = path.join(folder, "dist");
    const empty = path.join(folder, "empty");
    mkdirSync(dist);
    mkdirSync(empty);
    writeFileSync(path.join(dist, "main-ABC.js"), SCRIPT);
    writeFileSync(path.join(dist, "main-ABC.js.br"), brotliCompressSync(SCRIPT));
    writeFileSync(path.join(dist, "main-ABC.js.gz"), gzipSync(SCRIPT));
    writeFileSync(path.join(dist, "styles-DEF.css"), "a{color:red}");
    // a style with a gzip copy only, a script with no copy at all
    writeFileSync(path.join(dist, "only-gzip.css"), "b{color:blue}".repeat(100));
    writeFileSync(path.join(dist, "only-gzip.css.gz"), gzipSync("b{color:blue}".repeat(100)));
    // a file that is listed with its copy, whose copy is removed after the server has read the folder
    writeFileSync(path.join(dist, "vanishing.js"), SCRIPT);
    writeFileSync(path.join(dist, "vanishing.js.br"), brotliCompressSync(SCRIPT));
    vanishing = path.join(dist, "vanishing.js.br");
    // a script and its copy NEXT TO dist, that the folder must never hand out
    writeFileSync(path.join(folder, "secret.js"), "export const secret = 'outside the folder';\n");
    writeFileSync(
      path.join(folder, "secret.js.br"),
      brotliCompressSync("export const secret = 'outside the folder';\n")
    );
    const app = express();
    app.use(compression({ threshold: 1024 })); // as in app.js: a copy that is already encoded must pass untouched
    app.use((_request, response, next) => {
      response.vary("Accept-Language");
      response.vary("Cookie");
      next();
    });
    serveAssets(app, { dist, shared: empty, public: empty, client: empty });
    server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise(resolve => server.close(resolve)));

  test("brotli when it is accepted, and it decodes to the script", async () => {
    const response = await request("/dist/main-ABC.js", "gzip, br");
    assert.equal(response.status, 200);
    assert.equal(response.headers["content-encoding"], "br");
    assert.match(response.headers["content-type"], /javascript/);
    assert.equal(brotliDecompressSync(response.body).toString(), SCRIPT);
    assert.match(response.headers["cache-control"], /max-age=31536000, immutable/);
    assert.equal(response.headers.vary, "Accept-Encoding", "nothing about cookie or language");
  });

  test("gzip for a visitor that does not know brotli", async () => {
    const response = await request("/dist/main-ABC.js", "gzip");
    assert.equal(response.headers["content-encoding"], "gzip");
    assert.equal(gunzipSync(response.body).toString(), SCRIPT);
  });

  test("the plain file for a visitor that accepts neither, and for a style with no copy", async () => {
    const plain = await request("/dist/main-ABC.js", "identity");
    assert.equal(plain.headers["content-encoding"], undefined);
    assert.equal(plain.body.toString(), SCRIPT);
    const style = await request("/dist/styles-DEF.css", "br, gzip");
    assert.equal(style.headers["content-encoding"], undefined, "no copy: the file itself");
    assert.equal(style.body.toString(), "a{color:red}");
    assert.match(style.headers["content-type"], /css/);
  });

  test("a missing copy of the best kind falls back to the next one", async () => {
    const response = await request("/dist/only-gzip.css", "br, gzip");
    assert.equal(response.headers["content-encoding"], "gzip");
    assert.match(response.headers["content-type"], /css/);
    assert.equal(gunzipSync(response.body).toString(), "b{color:blue}".repeat(100));
  });

  test("a copy is never asked for by name, and nothing outside the folder is reachable", async () => {
    const direct = await request("/dist/main-ABC.js.br", "br");
    assert.equal(direct.status, 200, "served by the plain static handler, as the bytes they are");
    assert.equal(direct.headers["content-encoding"], undefined);
    const unknown = await request("/dist/nothing.js", "br");
    assert.equal(unknown.status, 404);
  });

  test("a script next to the folder is never handed out, however the address is written", async () => {
    for (const address of [
      "/dist/..%2fsecret.js",
      "/dist/%2e%2e%2fsecret.js",
      "/dist/..%2fsecret.js.br",
      "/dist/../secret.js"
    ]) {
      const response = await request(address, "br");
      assert.notEqual(response.status, 200, address);
      assert.ok(
        !/outside the folder/.test(response.body.toString()) &&
          !/outside the folder/.test(
            (() => {
              try {
                return brotliDecompressSync(response.body).toString();
              } catch {
                return "";
              }
            })()
          ),
        `${address} leaked the file`
      );
    }
  });

  test("compression after it: a copy that is already encoded is not compressed again", async () => {
    const response = await request("/dist/main-ABC.js", "gzip, deflate, br");
    assert.equal(response.headers["content-encoding"], "br");
    assert.equal(brotliDecompressSync(response.body).toString(), SCRIPT, "one layer, not two");
  });

  test("HEAD answers the headers of the copy and no body; a matching ETag gets a 304", async () => {
    const head = await request("/dist/main-ABC.js", "br", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers["content-encoding"], "br");
    assert.equal(head.body.length, 0);
    const etag = head.headers.etag;
    assert.ok(etag, "the copy has an ETag of its own");
    const again = await request("/dist/main-ABC.js", "br", { headers: { "if-none-match": etag } });
    assert.equal(again.status, 304);
    assert.equal(again.body.length, 0);
  });

  test("a copy that disappeared after the folder was read gives an error, not a mislabelled script", async () => {
    await request("/dist/main-ABC.js", "br"); // the folder is read at the first request
    rmSync(vanishing);
    const response = await request("/dist/vanishing.js", "br");
    assert.ok(response.status >= 400, `status ${response.status}`);
    assert.notEqual(
      response.headers["content-encoding"],
      "br",
      "the error is not announced as brotli"
    );
    assert.doesNotMatch(String(response.headers["content-type"]), /javascript/);
  });
});
