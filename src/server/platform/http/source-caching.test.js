// While the pages run from the sources of client/ (development, tests: no bundle was built), a file that changes must
// show on the next plain reload. A browser that is told "keep this for an hour" does not ask again, and not even a
// reload (F5) makes it: only a hard reload does. The owner of the site tested a fix of the player page for an hour in
// a browser that still held the old stylesheet, and saw the old bug. So the sources are revalidated at every use
// (ETag: a 304 with no body when nothing changed); the built bundle keeps its names that change with the content, and
// the fonts and icons keep their year.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import express from "express";
import { serveAssets } from "./assets.js";

const servers = [];
const folders = [];

/** A web root with one file of each kind, and an app that serves it the way app.js does. */
async function serve({ built }) {
  const root = mkdtempSync(path.join(tmpdir(), "hok-web-"));
  folders.push(root);
  const web = Object.fromEntries(
    ["client", "shared", "public", "dist"].map(name => [name, path.join(root, name)])
  );
  web.root = root;
  for (const folder of [
    web.client,
    path.join(web.client, "styles"),
    web.shared,
    path.join(web.public, "fonts"),
    path.join(web.public, "icons"),
    path.join(web.public, "locales"),
    web.dist
  ]) {
    mkdirSync(folder, { recursive: true });
  }
  writeFileSync(path.join(web.client, "styles", "player.css"), ".a{color:red}");
  writeFileSync(path.join(web.shared, "routes.js"), "export const routes = [];");
  writeFileSync(path.join(web.public, "locales", "fr.js"), "export default {};");
  writeFileSync(path.join(web.public, "logo.svg"), "<svg/>");
  writeFileSync(path.join(web.public, "fonts", "text.woff2"), "font");
  writeFileSync(path.join(web.public, "icons", "lane.png"), "icon");
  writeFileSync(path.join(web.dist, "main-ABC.js"), "export {};");
  if (built) {
    writeFileSync(path.join(web.dist, "manifest.json"), "{}");
  }
  process.env.HOK_SOURCE_ASSETS = built ? "false" : "true";
  const app = express();
  serveAssets(app, web);
  const server = await new Promise(resolve => {
    const listening = app.listen(0, () => resolve(listening));
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

const get = (base, address, headers = {}) =>
  new Promise((resolve, reject) => {
    http
      .get(`${base}${address}`, { headers }, response => {
        const chunks = [];
        response.on("data", chunk => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks)
          })
        );
      })
      .on("error", reject);
  });

after(async () => {
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe("the files of the sources, while no bundle is built", () => {
  let base;
  before(async () => {
    base = await serve({ built: false });
  });

  test("the styles, the scripts of the client and the shared ones are revalidated at every use", async () => {
    for (const address of [
      "/styles/player.css",
      "/shared/routes.js",
      "/locales/fr.js",
      "/logo.svg"
    ]) {
      const answer = await get(base, address);
      assert.equal(answer.status, 200, address);
      assert.equal(answer.headers["cache-control"], "no-cache", address);
      assert.ok(answer.headers.etag, `${address} has an ETag to revalidate with`);
    }
  });

  test("a browser that asks again with the ETag gets a 304 and no body, until the file changes", async () => {
    const first = await get(base, "/styles/player.css");
    const again = await get(base, "/styles/player.css", { "if-none-match": first.headers.etag });
    assert.equal(again.status, 304);
    assert.equal(again.body.length, 0);
  });

  test("the fonts and the icons, which are never edited in place, keep their year", async () => {
    for (const address of ["/fonts/text.woff2", "/icons/lane.png"]) {
      assert.match(
        (await get(base, address)).headers["cache-control"],
        /max-age=31536000, immutable/
      );
    }
  });

  test("a file that is named by its content is cached for good all the same", async () => {
    assert.match((await get(base, "/dist/main-ABC.js")).headers["cache-control"], /immutable/);
  });
});

describe("the same files, once a bundle is built", () => {
  let base;
  before(async () => {
    base = await serve({ built: true });
  });

  test("keep the hour they were always given: the pages no longer read them, only the bundle", async () => {
    for (const address of [
      "/styles/player.css",
      "/shared/routes.js",
      "/locales/fr.js",
      "/logo.svg"
    ]) {
      assert.match((await get(base, address)).headers["cache-control"], /max-age=3600/, address);
    }
    assert.match(
      (await get(base, "/fonts/text.woff2")).headers["cache-control"],
      /max-age=31536000/
    );
  });
});
