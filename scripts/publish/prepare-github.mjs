// Prepares the public commit of the site (branch `github`, pushed by the owner to github.com main) from the tree of
// `refonte`, signed Karma with no co-author line, or refuses when that tree holds private bots code (scripts/publish/public-tree.js).
// It never pushes: it prints the push command.
//   node scripts/publish/prepare-github.mjs
import { execFileSync } from "node:child_process";
import { privatePaths, publicMessage } from "./public-tree.js";

const git = (args, options = {}) =>
  execFileSync("git", args, { encoding: "utf8", ...options }).trim();

const leaks = privatePaths(git(["ls-tree", "-r", "--name-only", "refonte"]).split("\n"));
if (leaks.length) {
  console.error(`Refused: ${leaks.length} private path(s) in refonte, nothing prepared:`);
  for (const path of leaks.slice(0, 20)) {
    console.error(`  ${path}`);
  }
  process.exit(1);
}
const karma = { NAME: "Karma", EMAIL: "karmaisafool69@gmail.com" };
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: karma.NAME,
  GIT_AUTHOR_EMAIL: karma.EMAIL,
  GIT_COMMITTER_NAME: karma.NAME,
  GIT_COMMITTER_EMAIL: karma.EMAIL
};
const message = publicMessage(git(["log", "-1", "--format=%B", "refonte"]));
const sha = git(["commit-tree", "refonte^{tree}", "-p", "refs/heads/github"], {
  env,
  input: message
});
git(["update-ref", "refs/heads/github", sha]);
console.log(`github is now ${sha.slice(0, 7)}. To publish: git push origin github:main`);
