#!/usr/bin/env node
// Production assets: one minified module graph (the app and its lazy chunks), minified stylesheets,
// content-hashed file names (cached for a year), and dist/manifest.json, which the page handler
// reads. Without a build the pages load the sources of client/ and shared/ directly (development,
// tests), so nothing depends on this step to run.
//   npm run build
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { build } from "esbuild";
import { firstPaintParts, firstPaintPlan } from "../../src/server/platform/http/first-paint.js";
import { VIEW_MODULES } from "../../src/shared/view-registry.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CLIENT = path.join(ROOT, "src", "client");
const DIST = path.join(ROOT, "dist");

const hashOf = text => createHash("sha256").update(text).digest("hex").slice(0, 10);
const urlOf = file => `/dist/${path.basename(file)}`;
const kilobytes = bytes => (bytes / 1024).toFixed(1);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// ---- scripts ------------------------------------------------------------------------------------

const scripts = await build({
  entryPoints: { main: path.join(CLIENT, "main.js") },
  bundle: true,
  splitting: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "none",
  outdir: DIST,
  entryNames: "[name]-[hash]",
  chunkNames: "chunk-[hash]",
  metafile: true,
  // The translation catalogs are separate files, fetched by language (/locales/<code>.js).
  external: ["/locales/*"],
  logLevel: "warning"
});

const outputs = Object.entries(scripts.metafile.outputs);
const entry = outputs.find(
  ([file, info]) => info.entryPoint && path.basename(file).startsWith("main-")
)?.[0];
if (!entry) {
  throw new Error("build: no entry point in the output");
}

// The chunks the entry imports statically are preloaded; the dynamic ones (account pages,
// background) are fetched when needed.
const preload = scripts.metafile.outputs[entry].imports
  .filter(item => item.kind === "import-statement" && !item.external)
  .map(item => urlOf(item.path));

// The chunk(s) that carry a lazy part: a page that needs it preloads them with the HTML (no extra
// round trip once the entry runs).
const chunksOf = sources =>
  outputs
    .filter(
      ([file, info]) =>
        file !== entry &&
        Object.keys(info.inputs).some(input =>
          sources.some(source => input.replaceAll("\\", "/").endsWith(source))
        )
    )
    .map(([file]) => urlOf(file));
// What a lazy part also needs, beyond what the entry preloads already: the chunks it imports statically (code that two
// pages share is a chunk of its own), so that the browser fetches them all together with the HTML and not one round trip
// after the other.
const preloaded = new Set([urlOf(entry), ...preload]);
const outputOf = new Map(outputs.map(([file]) => [urlOf(file), file]));
const withDependencies = chunks => {
  const found = new Set();
  const visit = url => {
    if (found.has(url) || preloaded.has(url)) {
      return;
    }
    found.add(url);
    for (const item of scripts.metafile.outputs[outputOf.get(url)].imports) {
      if (item.kind === "import-statement" && !item.external) {
        visit(urlOf(item.path));
      }
    }
  };
  chunks.forEach(visit);
  return [...found];
};
const lazy = {
  auth: withDependencies(chunksOf(["client/features/auth/auth-pages.js"])),
  draft: withDependencies(
    chunksOf(["client/features/draft/draft-view.js", "client/features/draft/draft-editor.js"])
  )
};
// the chunks of the page of each view that is downloaded on demand (shared/view-registry.js)
const pages = Object.fromEntries(
  Object.entries(VIEW_MODULES).map(([view, source]) => [view, withDependencies(chunksOf([source]))])
);

// ---- stylesheets --------------------------------------------------------------------------------

// The main stylesheet is made of partials (@import); esbuild follows them. The web fonts and the
// logo stay addresses of the site.
const bundled = await build({
  entryPoints: [path.join(CLIENT, "styles", "main.css")],
  bundle: true,
  minify: true,
  write: false,
  legalComments: "none",
  external: ["/fonts/*", "/logo.svg", "/icons/*"],
  logLevel: "warning"
});
const mainCss = bundled.outputFiles[0].text;
const styleFile = `styles-${hashOf(mainCss)}.css`;
writeFileSync(path.join(DIST, styleFile), mainCss);
const styles = { url: `/dist/${styleFile}`, bytes: mainCss.length };

// The critical stylesheet is a list of partials too; the fonts and the logo stay addresses of the site.
const critical = await build({
  entryPoints: [path.join(CLIENT, "styles", "critical.css")],
  bundle: true,
  minify: true,
  write: false,
  legalComments: "none",
  external: ["/fonts/*", "/logo.svg", "/icons/*"],
  logLevel: "warning"
});
const criticalSource = { code: critical.outputFiles[0].text };
writeFileSync(path.join(DIST, "critical.css"), criticalSource.code);

// The first paint of the pages the server draws: per view, the partials its first screen is drawn with
// (client/styles/first-paint.json), in the order of main.css. The server inlines one of these after the
// critical stylesheet; only the server reads them (a folder of their own, no precompressed copies).
const stylesFolder = path.join(CLIENT, "styles");
const firstPaint = {};
mkdirSync(path.join(DIST, "first-paint"), { recursive: true });
for (const view of Object.keys(firstPaintPlan(stylesFolder).views)) {
  const pack = await build({
    stdin: {
      contents: firstPaintParts(view, stylesFolder)
        .map(part => `@import "./${part}";`)
        .join("\n"),
      resolveDir: stylesFolder,
      loader: "css"
    },
    bundle: true,
    minify: true,
    write: false,
    legalComments: "none",
    external: ["/fonts/*", "/logo.svg", "/icons/*"],
    logLevel: "warning"
  });
  const code = pack.outputFiles[0].text;
  firstPaint[view] = `first-paint/${view}-${hashOf(code)}.css`;
  writeFileSync(path.join(DIST, firstPaint[view]), code);
}

// ---- manifest -----------------------------------------------------------------------------------

const manifest = {
  entry: urlOf(entry),
  preload,
  lazy,
  pages,
  styles: styles.url,
  critical: "critical.css",
  firstPaint,
  builtAt: new Date().toISOString()
};
writeFileSync(path.join(DIST, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

// ---- precompressed copies -------------------------------------------------------------------------
// The server hands these out as they are (platform/http/assets.js) instead of compressing a script or a
// stylesheet again on every request. The best brotli level is too slow for a request and is paid once
// here: the entry script goes from 35 KB (what the server's own on-the-fly brotli gives) to 30 KB, the
// stylesheet from 32 KB to 25 KB. A copy is kept only when it is really smaller.
let compressedFiles = 0;
for (const name of readdirSync(DIST).filter(file => /\.(js|css)$/.test(file))) {
  const bytes = readFileSync(path.join(DIST, name));
  const copies = [
    [
      ".br",
      brotliCompressSync(bytes, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11,
          [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length
        }
      })
    ],
    [".gz", gzipSync(bytes, { level: 9 })]
  ];
  for (const [suffix, compressed] of copies) {
    if (compressed.length < bytes.length * 0.95) {
      writeFileSync(path.join(DIST, name + suffix), compressed);
      compressedFiles += 1;
    }
  }
}
console.log(
  `build: ${compressedFiles} precompressed copies (.br, .gz) next to the scripts and styles`
);

const entryBytes = readFileSync(path.join(ROOT, manifest.entry.slice(1))).length;
console.log(
  `build: ${manifest.entry} ${kilobytes(entryBytes)} KB, ${preload.length} shared chunk(s), ` +
    `styles ${kilobytes(styles.bytes)} KB, critical ${kilobytes(criticalSource.code.length)} KB`
);
