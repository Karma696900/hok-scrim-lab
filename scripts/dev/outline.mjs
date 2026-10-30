// The natural seams inside the biggest page factories: their direct inner functions and the size of each, to decide where
// a page can be cut into files (docs/superpowers/plans/2026-10-24-refactor-complet.md).
//   node scripts/dev/outline.mjs src/client/features/catalog/catalog-page.js [more files]
import { readFileSync } from "node:fs";
import * as acorn from "acorn";

const TARGETS = process.argv.slice(2);
for (const file of TARGETS) {
  const ast = acorn.parse(readFileSync(file, "utf8"), {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true
  });
  // the biggest top-level (or exported) function
  const fns = [];
  for (const n of ast.body) {
    const d = n.type === "ExportNamedDeclaration" ? n.declaration : n;
    if (d?.type === "FunctionDeclaration") {
      fns.push(d);
    }
  }
  fns.sort((a, b) => b.loc.end.line - b.loc.start.line - (a.loc.end.line - a.loc.start.line));
  const big = fns[0];
  if (!big) {
    console.log(file, "pas de grosse fonction de premier niveau");
    continue;
  }
  const total = big.loc.end.line - big.loc.start.line + 1;
  const inner = [];
  for (const s of big.body.body) {
    if (s.type === "FunctionDeclaration") {
      inner.push({ n: s.id.name, l: s.loc.end.line - s.loc.start.line + 1, at: s.loc.start.line });
    } else if (s.type === "VariableDeclaration") {
      for (const dcl of s.declarations) {
        const init = dcl.init;
        if (init && /Function/.test(init.type) && dcl.id.name) {
          inner.push({
            n: dcl.id.name,
            l: init.loc.end.line - init.loc.start.line + 1,
            at: s.loc.start.line
          });
        }
      }
    }
  }
  const covered = inner.reduce((a, b) => a + b.l, 0);
  console.log(
    `\n== ${file}: ${big.id.name} (${total} lignes), ${inner.length} fonctions internes qui couvrent ${covered} lignes`
  );
  console.log(
    inner
      .filter(i => i.l >= 25)
      .sort((a, b) => a.at - b.at)
      .map(i => `${i.n}:${i.l}`)
      .join("  ")
  );
}
