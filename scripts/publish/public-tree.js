// What must never reach the public repository: the bots code, which lives in the private repository hok-bots
// (engine, bots, training, their test helpers and their specs). scripts/publish/prepare-github.mjs refuses a public
// commit holding any of these paths.

export const PRIVATE_PREFIXES = [
  "src/shared/simulation/",
  "scripts/simulation/",
  "src/testing/simulation-",
  "src/testing/run-balance.mjs"
];
export const PRIVATE_DOCS = /^docs\/superpowers\/(specs|plans)\/[^/]*(simulation|bot)[^/]*\.md$/;

/** The paths of `paths` that must not be public (compared with `/` separators, in lower case). */
export function privatePaths(paths) {
  return paths.filter(original => {
    const path = original.replaceAll("\\", "/").toLowerCase();
    return PRIVATE_PREFIXES.some(prefix => path.startsWith(prefix)) || PRIVATE_DOCS.test(path);
  });
}

/** The message of a public commit: the same text without its Co-Authored-By lines, ending with one line break. */
export function publicMessage(message) {
  const lines = message.split(/\r?\n/).filter(line => !/^co-authored-by:/i.test(line.trim()));
  return `${lines.join("\n").trimEnd()}\n`;
}
