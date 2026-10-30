import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

/**
 * The first paint of a page the server draws. Such a page arrives with its stylesheet inline (no flash
 * of unstyled content, no request that blocks the paint), and the stylesheet of the application is big:
 * every page has a sheet of its own. So a page carries only what ITS first screen is drawn with, and
 * the whole stylesheet follows right after the first paint, like for the pages the server does not
 * draw (see boot.js).
 *
 * client/styles/first-paint.json names the partials of main.css that every such page carries
 * ("always") and, per view, the ones that view adds. The cascade is the one of main.css.
 * src/client/styles/first-paint.e2e.mjs checks that the first screen looks the same with this subset as with the
 * whole stylesheet.
 */

/** The partials main.css imports, in the order that is the cascade. */
export const stylesheetParts = stylesDir =>
  [
    ...readFileSync(path.join(stylesDir, "main.css"), "utf8").matchAll(
      /@import\s+["']\.\/([^"']+)["']/g
    )
  ].map(match => match[1]);

/** What first-paint.json says. */
export const firstPaintPlan = stylesDir =>
  JSON.parse(readFileSync(path.join(stylesDir, "first-paint.json"), "utf8"));

/**
 * The partials the first screen of `view` is drawn with, in cascade order (the web fonts are in
 * critical.css, which every page carries).
 */
export function firstPaintParts(view, stylesDir) {
  const plan = firstPaintPlan(stylesDir);
  const wanted = new Set([...plan.always, ...(plan.views[view] ?? [])]);
  return stylesheetParts(stylesDir).filter(part => wanted.has(part));
}

/**
 * The page shell paints from its own HTML and inlined critical CSS. Everything else (stylesheet,
 * script modules, the page's API calls, the translation catalog, the banner picture) is requested
 * right AFTER that first paint (the browser's own first-contentful-paint entry; 1.5 s at the
 * latest, for browsers that do not report it), by this small script: the first frame never waits
 * for a byte of it, and the rest still starts within a frame or two.
 *
 * The script is constant (its CSP hash is a constant); what differs per page and language travels in the JSON block that
 * precedes it (`<script type="application/json" id="boot">`, not executable, so not subject to the script policy).
 *   e: entry module · m: modules to preload · f: API calls to preload · s: stylesheet · w: the whole
 *   stylesheet of a page the server drew, which carries only the CSS of its first screen: it is prefetched,
 *   and applied when another page is drawn (client/app/stylesheet-loading.js) · i: banner srcset ("" when none)
 */
export const BOOT_SCRIPT = `(function(){var done=false;function add(tag,props){var el=document.createElement(tag);for(var k in props)el[k]=props[k];document.head.appendChild(el);return el}function go(){if(done)return;done=true;var d=JSON.parse(document.getElementById("boot").textContent);if(d.s){var css=add("link",{rel:"stylesheet",href:d.s});css.setAttribute("data-deferred-css","")}if(d.w)add("link",{rel:"prefetch",as:"style",href:d.w});d.m.forEach(function(h){add("link",{rel:"modulepreload",href:h})});d.f.forEach(function(h){add("link",{rel:"preload",as:"fetch",href:h,crossOrigin:"anonymous"})});if(d.i){var img=add("link",{rel:"preload",as:"image",imageSrcset:d.i,imageSizes:"100vw"});img.setAttribute("fetchpriority","high")}add("script",{type:"module",src:d.e})}try{new PerformanceObserver(function(list){if(list.getEntriesByName("first-contentful-paint").length)setTimeout(go,0)}).observe({type:"paint",buffered:true})}catch(e){setTimeout(go,0)}setTimeout(go,1500)})();`;

export const BOOT_SCRIPT_HASH = `sha256-${createHash("sha256").update(BOOT_SCRIPT).digest("base64")}`;

/**
 * JSON that is safe inside <script type="application/json">: nothing in it can close the element or
 * open a comment.
 */
export const safeJson = value =>
  JSON.stringify(value)
    .replaceAll("<", "\u003c")
    .replaceAll(">", "\u003e")
    .replaceAll("&", "\u0026")
    .replaceAll("\u2028", "\u2028")
    .replaceAll("\u2029", "\u2029");
