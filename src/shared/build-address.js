// A build written in an address, and read back.
import { MAX_LEVEL } from "./stat-values.js";

/**
 * The build as address parameters: i=1.2.3 (items), u= (utility), l= (late-game), r=10x7.11x3 (red
 * arcana as id×quantity), b= (blue), g= (green).
 */
export function encodeBuild(build) {
  const params = new URLSearchParams();
  if (build.items.length) {
    params.set("i", build.items.join("."));
  }
  if (build.utility.length) {
    params.set("u", build.utility.join("."));
  }
  if (build.core.length) {
    params.set("c", build.core.join("."));
  }
  if (build.spells?.length) {
    params.set("s", build.spells.join("."));
  }
  if (build.late.length) {
    params.set("l", build.late.join("."));
  }
  for (const [color, key] of [
    ["red", "r"],
    ["blue", "b"],
    ["green", "g"]
  ]) {
    if (build.arcana[color].length) {
      params.set(key, build.arcana[color].map(entry => `${entry.id}x${entry.count}`).join("."));
    }
  }
  return params;
}

/** The address of a page that opens this build: the build, the hero and, when it is not the last, the level. */
export function buildAddress(path, { build, heroId = "", level = MAX_LEVEL }) {
  const params = encodeBuild(build);
  if (heroId) {
    params.set("h", heroId);
  }
  if (heroId && level !== MAX_LEVEL) {
    params.set("lv", String(level));
  }
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}`;
}

export function decodeBuild(params) {
  const list = key =>
    (params.get(key) ?? "").split(".").filter(Boolean).map(Number).filter(Number.isInteger);
  const arcana = key =>
    (params.get(key) ?? "")
      .split(".")
      .filter(Boolean)
      .map(part => {
        const [id, count] = part.split("x").map(Number);
        return { id, count };
      })
      .filter(entry => Number.isInteger(entry.id) && Number.isInteger(entry.count));
  return {
    items: list("i"),
    utility: list("u"),
    late: list("l"),
    core: list("c"),
    spells: list("s"),
    arcana: { red: arcana("r"), blue: arcana("b"), green: arcana("g") }
  };
}
