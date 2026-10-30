import { readFile } from "node:fs/promises";
import path from "node:path";
import { footerTemplate } from "./report-template.js";
import { WEB } from "../../platform/http/web-root.js";
import { launchChromium } from "../heroes/sync/hero-sync.js";

const ORIGIN = "http://pdf.local";
const FONT_FILE = /^[a-z0-9-]+\.(woff2|css)$/;
const FONT_TYPES = { woff2: "font/woff2", css: "text/css; charset=utf-8" };

/**
 * Renders HTML to PDF in headless Chromium with the network cut off:
 *  - JavaScript is disabled (the template has none);
 *  - only http://pdf.local is served, and only from memory/disk: the page itself, the bundled fonts,
 *    the logo and the cached portraits passed in `assets`. Anything else is aborted and reported.
 */
export function createPdfExporter({
  staticDirectory = WEB.public,
  launchBrowser = launchChromium,
  logger,
  timeoutMs = 60_000
}) {
  async function serve(url, html, assets) {
    if (url.pathname === "/export.html") {
      return { body: html, contentType: "text/html; charset=utf-8" };
    }
    if (url.pathname === "/logo.svg") {
      return {
        body: await readFile(path.join(staticDirectory, "logo.svg")),
        contentType: "image/svg+xml"
      };
    }
    const font = url.pathname.match(/^\/fonts\/([^/]+)$/);
    if (font && FONT_FILE.test(font[1])) {
      return {
        body: await readFile(path.join(staticDirectory, "fonts", font[1])),
        contentType: FONT_TYPES[font[1].split(".").pop()]
      };
    }
    return assets.get(decodeURI(url.pathname)) ?? null;
  }

  /** Opens the HTML in an isolated, network-less page and hands it to `work`. */
  async function withPage({ html, assets }, options, work) {
    const browser = await launchBrowser();
    const blocked = [];
    try {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        serviceWorkers: "block",
        acceptDownloads: false,
        ...options
      });
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== ORIGIN) {
          blocked.push(route.request().url().slice(0, 200));
          return route.abort("blockedbyclient");
        }
        try {
          const found = await serve(url, html, assets);
          if (!found) {
            return route.fulfill({ status: 404, body: "" });
          }
          return route.fulfill({ status: 200, contentType: found.contentType, body: found.body });
        } catch {
          return route.fulfill({ status: 404, body: "" });
        }
      });
      const page = await context.newPage();
      await page.goto(`${ORIGIN}/export.html`, { waitUntil: "networkidle", timeout: timeoutMs });
      const result = await work(page);
      if (blocked.length) {
        logger?.warn("export blocked external requests", { count: blocked.length });
      }
      return { result, blocked };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  /** @returns {{ pdf: Buffer, blocked: string[] }} */
  async function render({ html, assets = new Map(), language = "en" }) {
    const { result, blocked } = await withPage({ html, assets }, {}, async page => {
      await page.emulateMedia({ media: "print" });
      return page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: footerTemplate(language),
        margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" }
      });
    });
    return { pdf: result, blocked };
  }

  /** Full-page PNG of the same report (screen media, 2x for sharpness). */
  async function renderPng({ html, assets = new Map(), width = 900 }) {
    const { result, blocked } = await withPage(
      { html, assets },
      { viewport: { width, height: 1200 }, deviceScaleFactor: 2 },
      async page => {
        await page.emulateMedia({ media: "screen" });
        return page.screenshot({ type: "png", fullPage: true });
      }
    );
    return { png: result, blocked };
  }

  return { render, renderPng };
}
