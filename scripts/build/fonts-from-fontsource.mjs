#!/usr/bin/env node
// Copies the self-hosted web fonts from the @fontsource packages (SIL OFL) into src/public/fonts and rewrites
// the two stylesheets that declare them: src/client/styles/base/fonts.css (imported by critical.css, so inline in
// every page) and src/public/fonts/fonts.css (the reports the server exports). Run it again after changing FAMILIES.
//   node scripts/build/fonts-from-fontsource.mjs
import { copyFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";

const FAMILIES = [
  { id: "barlow", name: "Barlow", weights: [400, 600] },
  { id: "barlow-condensed", name: "Barlow Condensed", weights: [700] }
];
const SUBSETS = {
  latin:
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  "latin-ext":
    "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
  vietnamese:
    "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB"
};
const root = new URL("../../", import.meta.url);
const fontsDir = new URL("src/public/fonts/", root);

for (const file of readdirSync(fontsDir)) {
  if (file.endsWith(".woff2")) {
    rmSync(new URL(file, fontsDir));
  }
}
const rules = [];
for (const { id, name, weights } of FAMILIES) {
  for (const weight of weights) {
    // vietnamese first, latin last: the browser tries the last matching rule first
    for (const subset of ["vietnamese", "latin-ext", "latin"]) {
      const file = `${id}-${subset}-${weight}.woff2`;
      copyFileSync(
        new URL(
          `node_modules/@fontsource/${id}/files/${id}-${subset}-${weight}-normal.woff2`,
          root
        ),
        new URL(file, fontsDir)
      );
      rules.push(
        `@font-face {\n  font-family: "${name}";\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: optional;\n  src: url("/fonts/${file}") format("woff2");\n  unicode-range: ${SUBSETS[subset]};\n}`
      );
    }
  }
}
const header = `/* Self-hosted (SIL OFL) from @fontsource: Barlow (text) and Barlow Condensed (headings, numbers, clocks). Latin,
   latin-ext and vietnamese subsets. Every page carries these faces in its inline critical stylesheet (a face
   declared late made the browser lay the whole page out a second time when the font arrived; the files are
   preloaded by the page, and font-display: optional keeps the page from moving when they come late); the
   exported reports load src/public/fonts/fonts.css, a copy of this file.
   Written by scripts/build/fonts-from-fontsource.mjs: do not edit by hand. */\n`;
// written the way Prettier writes CSS, so that the files do not change the next time the repository is formatted
const target = new URL("src/client/styles/base/fonts.css", root);
const text = await format(`${header}${rules.join("\n")}\n`, {
  ...(await resolveConfig(fileURLToPath(target))),
  parser: "css"
});
writeFileSync(target, text);
writeFileSync(new URL("src/public/fonts/fonts.css", root), text);
console.log(`${rules.length} font faces written`);
