// The name of the file that takes an import back, shared by both importers (import-images.mjs and
// import-data.mjs).
import path from "node:path";

/**
 * Where the manifest of a run goes: backups/<prefix>-<date>-<time>.json, to the millisecond. A run that
 * creates nothing still writes one; with a name to the second it would replace the manifest of the run
 * that came just before and the import could no longer be undone.
 */
export function manifestFile(prefix, when = new Date()) {
  const stamp = when.toISOString().replace(/[-:]/g, "").replace("T", "-").replace("Z", "");
  return path.join("backups", `${prefix}-${stamp}.json`);
}
