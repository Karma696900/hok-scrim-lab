// The page of a view that is downloaded on demand is fetched together with the HTML (shared/view-registry.js): the map
// must list every such page, name real files and real views, and the build must find the chunk of each one.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { createPageHandler } from "../server/platform/http/page-handler.js";
import { VIEW_MODULES } from "./view-registry.js";
import { WEB } from "../server/platform/http/web-root.js";

const read = file => readFileSync(path.join(WEB.root, "src", file), "utf8");

describe("view modules", () => {
  test("every module of the map is a file of the client, drawn by a view that exists", () => {
    const views = new Set(
      [
        ...(read("shared/routes.js") + read("shared/routes-table.js")).matchAll(
          /view:\s*"([a-z-]+)"/g
        )
      ].map(m => m[1])
    );
    for (const [view, source] of Object.entries(VIEW_MODULES)) {
      assert.ok(views.has(view), `${view} is a view of shared/routes.js`);
      assert.ok(existsSync(path.join(WEB.root, "src", source)), `${source} exists`);
    }
  });

  test("every page that app/lazy-pages.js downloads on demand is in the map, but the ones that are not a view", () => {
    // not a page of a view: the account pages and the draft board have their own entry in the manifest, the hero
    // editor and the profile dialog open on top of a page
    const NOT_A_VIEW = new Set([
      "client/features/auth/auth-pages.js",
      "client/features/heroes/hero-editor.js",
      "client/features/heroes/hero-background.js"
    ]);
    const loaded = [
      ...read("client/app/lazy-pages.js").matchAll(/import\("\.\.\/(features\/[^"]+)"\)/g)
    ].map(m => `client/${m[1]}`);
    assert.ok(loaded.length >= 10, "the dynamic imports of app/lazy-pages.js were found");
    const mapped = new Set(Object.values(VIEW_MODULES));
    const missing = loaded.filter(source => !NOT_A_VIEW.has(source) && !mapped.has(source));
    assert.deepEqual(missing, [], "a page loaded on demand that no view of the map names");
  });

  test("the build finds one chunk or more for each view, and the page handler preloads it with the HTML", async () => {
    execFileSync(process.execPath, ["scripts/build/build.mjs"], { cwd: WEB.root, stdio: "pipe" });
    const manifest = JSON.parse(readFileSync(path.join(WEB.root, "dist/manifest.json"), "utf8"));
    assert.deepEqual(Object.keys(manifest.pages).sort(), Object.keys(VIEW_MODULES).sort());
    for (const [view, chunks] of Object.entries(manifest.pages)) {
      assert.ok(chunks.length >= 1, `${view} has a chunk`);
      for (const chunk of chunks) {
        assert.ok(existsSync(path.join(WEB.root, chunk.slice(1))), `${chunk} exists`);
      }
    }
    // what a page shares with another page is a chunk of its own: it is listed after the page, and never twice, and never when
    // the entry preloads it already
    const preloaded = new Set([manifest.entry, ...manifest.preload]);
    for (const [view, chunks] of Object.entries(manifest.pages)) {
      assert.equal(new Set(chunks).size, chunks.length, `${view}: no chunk twice`);
      assert.ok(
        chunks.every(chunk => !preloaded.has(chunk)),
        `${view}: nothing the entry loads already`
      );
    }
    assert.notEqual(
      manifest.pages.settings[0],
      manifest.pages.training[0],
      "two pages, two chunks"
    );
    assert.equal(manifest.pages.items[0], manifest.pages.arcana[0], "three views, one page");

    // the page handler writes the chunk of the view it serves in the boot block (a signed-in person: no pre-render)
    process.env.HOK_SOURCE_ASSETS = "false";
    const handler = createPageHandler({
      store: { readHeroes: async () => [] },
      config: { appOrigin: "http://localhost" }
    });
    const served = async route => {
      let html = "";
      const response = {
        status: () => response,
        type: () => response,
        set: () => response,
        setHeader: () => {},
        send: body => {
          html = body;
        }
      };
      await handler(
        {
          path: route,
          originalUrl: route,
          headers: {},
          language: "en",
          protocol: "http",
          get: () => "localhost"
        },
        response,
        error => {
          throw error;
        }
      );
      return JSON.parse(/id="boot">([\s\S]*?)<\/script>/.exec(html)[1]);
    };
    assert.ok(
      (await served("/settings")).m.includes(manifest.pages.settings[0]),
      "settings: its chunk is preloaded"
    );
    assert.ok(
      (await served("/training")).m.includes(manifest.pages.training[0]),
      "training: its chunk is preloaded"
    );
    assert.ok(
      !(await served("/training")).m.includes(manifest.pages.settings[0]),
      "and not the chunk of another page"
    );
    assert.ok(
      !(await served("/")).m.includes(manifest.pages.settings[0]),
      "the home page preloads none of them"
    );
  });
});
