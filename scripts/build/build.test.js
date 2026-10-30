// `npm run build`: hashed bundle + stylesheets, a manifest the page handler turns into tags, a CSP
// hash of the minified critical CSS.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import {
  FRAME_VIEWS,
  loadCriticalCss,
  loadFirstPaintCss,
  loadManifest,
  readStylesheet,
  ROOM_FRAME_VIEW,
  SSR_VIEWS,
  VISITOR_FRAME_VIEWS
} from "../../src/server/platform/http/page-handler.js";
import { WEB } from "../../src/server/platform/http/web-root.js";
import { clientSource } from "../../src/testing/sources.js";

process.env.HOK_SOURCE_ASSETS = "false";
execFileSync(process.execPath, ["scripts/build/build.mjs"], { cwd: WEB.root, stdio: "pipe" });
const manifest = loadManifest();

/** A file named by the manifest (its address starts with /dist/). */
const built = address => path.join(WEB.root, address.slice(1));
const read = address => readFileSync(built(address), "utf8");

describe("production build", () => {
  test("the manifest names hashed files that exist", () => {
    assert.match(manifest.entry, /^\/dist\/main-[A-Z0-9]+\.js$/);
    assert.match(manifest.styles, /^\/dist\/styles-[0-9a-f]{10}\.css$/);
    for (const file of [manifest.entry, manifest.styles, ...manifest.preload]) {
      assert.ok(existsSync(built(file)), file);
    }
  });

  test("the bundle is minified and smaller than the sources it was made from", () => {
    const bundle = read(manifest.entry);
    assert.doesNotMatch(bundle, /^\s*\/\/ /m, "a minified bundle keeps no comment lines");
    assert.ok(bundle.length < clientSource().length * 0.8, "smaller than the sources together");
  });

  test("the first download (entry and what it preloads) stays under 70 KB, so that splitting files never makes it heavier", () => {
    const bytes = [manifest.entry, ...manifest.preload].reduce(
      (sum, file) => sum + readFileSync(built(file)).length,
      0
    );
    assert.ok(bytes < 70_000, `${bytes} bytes`);
  });

  test("the catalogs stay separate files, fetched by language", () => {
    const first = [manifest.entry, ...manifest.preload].map(read).join("\n");
    assert.match(first, /\/locales\//);
  });

  test("the lazy parts (account pages, draft board, background) are not in the first download", () => {
    const first = [manifest.entry, ...manifest.preload].map(read).join("\n");
    assert.doesNotMatch(
      first,
      /Recovery codes copied|hok_bg_pick|Both sides start together on this device/
    );
  });

  test("the manifest knows the chunks of the lazy parts, so a page that needs them preloads them", () => {
    assert.ok(manifest.lazy.auth.length >= 1 && manifest.lazy.draft.length >= 1);
    for (const file of [...manifest.lazy.auth, ...manifest.lazy.draft]) {
      assert.ok(existsSync(built(file)), file);
    }
    assert.match(read(manifest.lazy.auth[0]), /Recovery codes copied/);
  });

  test("the CSP hash is that of the minified critical CSS that is actually inlined", () => {
    const critical = loadCriticalCss();
    const minified = readFileSync(path.join(WEB.dist, manifest.critical), "utf8")
      .replaceAll("\r\n", "\n")
      .trim();
    assert.equal(critical.css, minified);
    assert.match(critical.hash, /^sha256-/);
    const source = readStylesheet(path.join(WEB.client, "styles", "critical.css"));
    assert.ok(critical.css.length < source.length);
  });

  test("each view the server draws has a first-paint sheet, which is what its page inlines after the critical CSS", () => {
    // the views the server draws for a visitor, and the frames it draws for a person who is signed in (the room of a draft too)
    const drawn = [
      ...new Set([...SSR_VIEWS, ...FRAME_VIEWS, ...VISITOR_FRAME_VIEWS, ROOM_FRAME_VIEW])
    ];
    assert.deepEqual(Object.keys(manifest.firstPaint).sort(), drawn.sort());
    const whole = read(manifest.styles).length;
    const critical = loadCriticalCss();
    for (const view of drawn) {
      assert.ok(existsSync(path.join(WEB.dist, manifest.firstPaint[view])), view);
      const inline = loadFirstPaintCss(view);
      assert.ok(inline.css.startsWith(critical.css), `${view}: the critical CSS comes first`);
      assert.match(inline.hash, /^sha256-/);
      assert.ok(
        inline.css.length < critical.css.length + whole * 0.4,
        `${view}: far less than the whole stylesheet (${inline.css.length} bytes)`
      );
    }
  });
});
