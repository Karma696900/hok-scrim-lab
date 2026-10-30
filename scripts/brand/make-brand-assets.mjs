#!/usr/bin/env node
// Draws the mark of the site (a shield with an H, one path) and every file made from it:
//   src/public/logo.svg                  the mark (header, favicon in browsers that take SVG)
//   src/public/favicon-32.png            32 x 32, transparent
//   src/public/apple-touch-icon.png      180 x 180, on the night blue (iOS fills transparency with black)
//   src/public/icon-512.png              512 x 512, transparent
//   src/public/og-image.png              1200 x 630, the picture a link shows when it is shared
//   design/brand/logo.png                the lockup (mark above the name), on the night blue (design/ is outside git)
//   design/brand/logo_transparent.png    the same, transparent
// The pictures with words are drawn by Chromium (the name is set in the site's own font, Barlow Condensed);
// the ones without go through sharp. Run it again after changing the shape or the colours below.
//   node scripts/brand/make-brand-assets.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "../..");
const NIGHT = "#0a111a";
/** The blues of the mark, light at the top left to deep at the bottom right (the colour of the site is #5b9bff). */
const STOPS = [
  ["0", "#7fe0ff"],
  [".5", "#3f86ff"],
  ["1", "#2a45e6"]
];

// ---- the shape ------------------------------------------------------------------------------------
const CENTER = [300, 372];
const scaled = (point, factor) =>
  point.map((value, axis) => +(CENTER[axis] + (value - CENTER[axis]) * factor).toFixed(1));
const at = point => point.join(" ");
/** The shield: a peaked top, straight shoulders, sides that curve into a point. */
function shield(factor) {
  const [top, topRight, bottomRight, controlRight, tip, controlLeft, bottomLeft, topLeft] = [
    [300, 20],
    [560, 118],
    [560, 430],
    [560, 570],
    [300, 700],
    [40, 570],
    [40, 430],
    [40, 118]
  ].map(point => scaled(point, factor));
  return `M${at(top)} L${at(topRight)} L${at(bottomRight)} Q${at(controlRight)} ${at(tip)} Q${at(controlLeft)} ${at(bottomLeft)} L${at(topLeft)} Z`;
}
/** The H, knocked out of the shield: two bars joined by a crossbar that rises a little to the right. */
const LETTER =
  "M" +
  [
    [150, 205],
    [225, 205],
    [225, 372],
    [375, 338],
    [375, 205],
    [450, 205],
    [450, 520],
    [375, 520],
    [375, 418],
    [225, 452],
    [225, 520],
    [150, 520]
  ]
    .map(at)
    .join(" L") +
  " Z";
// even-odd: the shield (filled), a thin gap (empty), the inner shield (filled), the letter (empty)
const MARK_PATH = [shield(1), shield(0.945), shield(0.9), LETTER].join(" ");
const gradient = STOPS.map(
  ([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`
).join("");
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="30 10 540 700" width="540" height="700" role="img" aria-label="HOK"><defs><linearGradient id="g" x1="40" y1="20" x2="560" y2="700" gradientUnits="userSpaceOnUse">${gradient}</linearGradient></defs><path fill="url(#g)" fill-rule="evenodd" d="${MARK_PATH}"/></svg>\n`;

// ---- the files made by sharp ------------------------------------------------------------------------
const markPng = async height =>
  sharp(Buffer.from(MARK), { density: 400 }).resize({ height }).png().toBuffer();

/** The mark centred in a square of `side` px, `share` of its height, on `background` (or transparent). */
async function square(side, share, background) {
  const mark = await markPng(Math.round(side * share));
  const base = sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 }
    }
  });
  return base
    .composite([{ input: mark, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// ---- the files made by Chromium (they carry words) --------------------------------------------------
// the fonts travel inside the page: a page built from a string cannot read files of the disk
const font = name =>
  `data:font/woff2;base64,${readFileSync(path.join(ROOT, "src/public/fonts", name)).toString("base64")}`;
const FACES = `
  @font-face { font-family: "Barlow Condensed"; font-weight: 700; src: url("${font("barlow-condensed-latin-700.woff2")}") format("woff2"); }
  @font-face { font-family: Barlow; font-weight: 400; src: url("${font("barlow-latin-400.woff2")}") format("woff2"); }
  @font-face { font-family: Barlow; font-weight: 600; src: url("${font("barlow-latin-600.woff2")}") format("woff2"); }`;
const markDataUri = `data:image/svg+xml;base64,${Buffer.from(MARK).toString("base64")}`;

const SHARE_PAGE = `<!doctype html><meta charset="utf-8"><style>${FACES}
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; color: #f1f5ff; font-family: Barlow, sans-serif;
    background: radial-gradient(760px 520px at 24% 46%, rgba(63, 134, 255, 0.34), transparent 68%),
      radial-gradient(520px 360px at 92% 8%, rgba(127, 224, 255, 0.12), transparent 70%),
      linear-gradient(135deg, #060d1a 0%, #0a1730 58%, #050a14 100%); display: flex; align-items: center; gap: 72px; padding: 0 110px; }
  .mark { width: 330px; height: 428px; flex: none; filter: drop-shadow(0 18px 60px rgba(63, 134, 255, 0.5)); }
  .rule { width: 84px; height: 6px; background: #5b9bff; margin-bottom: 26px; }
  .name { font: 700 236px/0.86 "Barlow Condensed", sans-serif; letter-spacing: 0.02em; }
  .sub { font: 700 54px/1 "Barlow Condensed", sans-serif; letter-spacing: 0.17em; color: #8fbaff; margin-top: 16px; white-space: nowrap; }
  .tag { font: 400 31px/1.3 Barlow, sans-serif; color: #a9bbd6; margin-top: 30px; max-width: 640px; }
</style><img class="mark" src="${markDataUri}" alt=""><div><div class="rule"></div><div class="name">HOK</div><div class="sub">GLOBAL SCRIM LAB</div><p class="tag">Draft, scrims, tier lists and training for Honor of Kings Global.</p></div>`;

const LOCKUP_PAGE = transparent => `<!doctype html><meta charset="utf-8"><style>${FACES}
  * { box-sizing: border-box; margin: 0; }
  body { width: 1254px; height: 1254px; overflow: hidden; color: #f1f5ff; display: grid; place-items: center; align-content: center; gap: 36px;
    background: ${transparent ? "transparent" : NIGHT}; text-align: center; }
  img { width: 500px; height: 649px; filter: drop-shadow(0 14px 50px rgba(63, 134, 255, ${transparent ? "0" : "0.45"})); }
  .name { font: 700 210px/0.9 "Barlow Condensed", sans-serif; letter-spacing: 0.04em; }
  .sub { font: 700 62px/1 "Barlow Condensed", sans-serif; letter-spacing: 0.22em; color: #8fbaff; margin-top: -10px; }
</style><div><img src="${markDataUri}" alt=""></div><div><div class="name">HOK</div><div class="sub">GLOBAL SCRIM LAB</div></div>`;

async function main() {
  mkdirSync(path.join(ROOT, "design/brand"), { recursive: true });
  writeFileSync(path.join(ROOT, "src/public/logo.svg"), MARK);
  writeFileSync(path.join(ROOT, "src/public/favicon-32.png"), await square(32, 0.94));
  writeFileSync(
    path.join(ROOT, "src/public/apple-touch-icon.png"),
    await sharp(await square(180, 0.72, { r: 10, g: 17, b: 26, alpha: 1 }))
      .removeAlpha()
      .png()
      .toBuffer()
  );
  writeFileSync(path.join(ROOT, "src/public/icon-512.png"), await square(512, 0.86));

  const browser = await chromium.launch();
  try {
    const shoot = async (html, width, height, file, transparent = false) => {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate("document.fonts.ready");
      await page.screenshot({ path: path.join(ROOT, file), omitBackground: transparent });
      await page.close();
    };
    await shoot(SHARE_PAGE, 1200, 630, "src/public/og-image.png");
    // glows do not compress as a true-colour PNG (half a megabyte): 128 colours with dithering look the same, at a third of the size
    const share = path.join(ROOT, "src/public/og-image.png");
    writeFileSync(
      share,
      await sharp(share)
        .png({ palette: true, colors: 128, dither: 0.9, compressionLevel: 9 })
        .toBuffer()
    );
    await shoot(LOCKUP_PAGE(false), 1254, 1254, "design/brand/logo.png");
    await shoot(LOCKUP_PAGE(true), 1254, 1254, "design/brand/logo_transparent.png", true);
  } finally {
    await browser.close();
  }
  console.log(
    "brand assets written (logo.svg, favicon-32, apple-touch-icon, icon-512, og-image, brand/logo*.png)"
  );
}

await main();
