import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { readStylesheet } from "../server/platform/http/page-handler.js";
import { WEB } from "../server/platform/http/web-root.js";

/** Every file below a folder whose name matches the pattern, in a stable order. */
export function filesUnder(directory, pattern) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...filesUnder(file, pattern));
    } else if (pattern.test(entry.name)) {
      found.push(file);
    }
  }
  return found.sort();
}

/** A script of the application: not the tests that sit next to it. */
export const SCRIPT = /^(?!.*\.test\.js$).*\.js$/;

/** The source of the browser application: every script of client/, one after the other. */
export function clientSource({ only = SCRIPT } = {}) {
  return filesUnder(WEB.client, only)
    .map(file => readFileSync(file, "utf8"))
    .join("\n");
}

/** The scripts of one feature of the browser application, for example clientFeature("draft"). */
export function clientFeature(name) {
  return filesUnder(path.join(WEB.client, "features", name), SCRIPT)
    .map(file => readFileSync(file, "utf8"))
    .join("\n");
}

/** The critical and the main stylesheet with their partials, as the browser receives them. */
export function clientStyles() {
  return ["critical.css", "main.css"]
    .map(file => readStylesheet(path.join(WEB.client, "styles", file)))
    .join("\n");
}
