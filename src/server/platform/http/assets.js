import express from "express";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { sameForEveryone } from "./cache-control.js";
import { loadManifest } from "./page-handler.js";
import { WEB } from "./web-root.js";

const ONE_YEAR = "public, max-age=31536000, immutable";

const PRECOMPRESSED = { br: ".br", gzip: ".gz" };
const TYPES = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

/**
 * The scripts and styles of dist/ come with a copy compressed at the best level by the build
 * (scripts/build/build.mjs). A visitor who accepts brotli or gzip gets that copy as it is: no compression
 * work per request and 15 to 25 % fewer bytes than the quick on-the-fly level. Anything else falls
 * through to the plain file (and to the compression of app.js).
 */
function precompressed(web) {
  let names = null; // the folder does not change while the server runs: read once
  return (request, response, next) => {
    if (
      (request.method !== "GET" && request.method !== "HEAD") ||
      !/\.(js|css)$/.test(request.path)
    ) {
      return next();
    }
    names ??= new Set(existsSync(web.dist) ? readdirSync(web.dist) : []);
    const file = request.path.slice(1);
    if (!names.has(file)) {
      return next();
    }
    // brotli first whatever the order of the visitor's header (browsers list gzip before br), then gzip
    for (const [encoding, suffix] of Object.entries(PRECOMPRESSED)) {
      if (!request.acceptsEncodings(encoding) || !names.has(file + suffix)) {
        continue;
      }
      // The type is the one of the script or the style, not of the .br file, and the answer depends on
      // what the visitor accepts and on nothing else. The headers go through `sendFile` so that they are
      // only set once the file is really being sent: if it has disappeared (a rebuild while running), the
      // error that follows is not labelled as a brotli script.
      return response.sendFile(
        file + suffix,
        {
          root: web.dist,
          maxAge: "1y",
          immutable: true,
          headers: {
            "Content-Type": TYPES[path.extname(file)],
            "Content-Encoding": encoding,
            Vary: "Accept-Encoding"
          }
        },
        error => {
          // a visitor who cancels the download is not an error of ours (what Express itself ignores)
          if (
            error &&
            error.code !== "ECONNABORTED" &&
            error.syscall !== "write" &&
            !response.headersSent
          ) {
            next(error);
          }
        }
      );
    }
    return next();
  };
}

/**
 * Serves the files of the browser: the bundle (named by its content, so cached for good), the
 * shared modules, the static files and the application's own sources.
 *
 * While the pages run from the sources (development, tests: no bundle was built) every file that is not
 * named by its content is revalidated at each use (`no-cache`: the browser asks again with the ETag and gets a
 * 304 with no body when nothing changed). Kept for an hour instead, a changed file does not show on a plain
 * reload (F5), only on a hard one: a fix then looks as if it had not worked. Once a bundle is built the pages
 * read nothing but the bundle, and the other files keep the hour (a deploy shows up within it).
 */
export function serveAssets(app, web = WEB) {
  const live = loadManifest(web) === null;
  // a file is the same for everybody: no `Vary` on the cookie or the language (see cache-control.js)
  const common = { index: false, setHeaders: response => sameForEveryone(response) };
  const sources = live
    ? {
        ...common,
        setHeaders: response => {
          sameForEveryone(response);
          response.setHeader("Cache-Control", "no-cache");
        }
      }
    : { ...common, maxAge: "1h" };
  app.use("/dist", precompressed(web));
  app.use("/dist", express.static(web.dist, { ...common, immutable: true, maxAge: "1y" }));
  app.use("/shared", express.static(web.shared, sources));
  app.use(
    express.static(web.public, {
      ...sources,
      maxAge: "1h",
      setHeaders: (response, filePath) => {
        sources.setHeaders(response);
        const folder = path.relative(web.public, filePath).split(path.sep)[0];
        // never edited in place (a new picture has a new name): kept for a year
        if (folder === "fonts" || folder === "icons") {
          response.setHeader("Cache-Control", ONE_YEAR);
        }
      }
    })
  );
  app.use(express.static(web.client, sources));
}
