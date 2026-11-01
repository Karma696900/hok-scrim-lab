// An example answer of each address of endpoints.js, keyed by its path (endpoint-examples.json: data, not code).
// Shortened (a list shows one entry) but with the real top-level fields: mcp.test.js compares them with what the
// application answers, so an example cannot drift from the answer it shows.
import { readFileSync } from "node:fs";

export const API_EXAMPLES = Object.freeze(
  JSON.parse(readFileSync(new URL("./endpoint-examples.json", import.meta.url), "utf8"))
);
