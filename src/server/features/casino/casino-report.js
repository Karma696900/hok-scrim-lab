// The basket's PDF (owner, 2026-11-07): the compositions a visitor kept from the roulette, in one file styled like the
// series export. Rendered by Chromium with JavaScript disabled and the network cut off (export/pdf-exporter.js): the
// portraits and the lane icons are local paths answered from memory.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { badRequest } from "../../platform/errors.js";
import { WEB } from "../../platform/http/web-root.js";
import { tr } from "../../platform/server-i18n.js";
import { directionOf } from "../../../shared/i18n.js";
import { LANE_KEYS } from "./casino-domain.js";

/** How many compositions one file may hold. */
export const BASKET_MAX = 50;
const NAME_MAX = 80;

const LANES = {
  clash: ["Clash", "lane-clash-lane.png"],
  jungle: ["Jungle", "lane-jungle.png"],
  mid: ["Mid", "lane-mid-lane.png"],
  farm: ["Farm", "lane-farm-lane.png"],
  roam: ["Support", "lane-roamer.png"]
};

const escapeHtml = value =>
  String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );

const invalid = () =>
  badRequest(
    "The basket must hold 1 to {max} compositions, each named in at most {name} characters.",
    "invalid_basket",
    { max: BASKET_MAX, name: NAME_MAX }
  );

/** The compositions a request sends: a name (may be empty) and a hero per lane; unknown heroes become empty lanes. */
export function parseBasket(body, known) {
  const list = body?.compositions;
  if (!Array.isArray(list) || !list.length || list.length > BASKET_MAX) {
    throw invalid();
  }
  return list.map(item => {
    const name = typeof item?.name === "string" ? item.name.normalize("NFC").trim() : "";
    if (name.length > NAME_MAX || /[\u0000-\u001f\u007f]/.test(name)) {
      throw invalid();
    }
    const result = Object.fromEntries(
      LANE_KEYS.map(lane => {
        const id = item?.result?.[lane];
        return [lane, typeof id === "string" && known.has(id) ? id : null];
      })
    );
    return { name, result };
  });
}

const STYLES = `
@page { size: A4; margin: 14mm 12mm 16mm; }
* { box-sizing: border-box; }
html { font-family: "Inter", "Segoe UI", sans-serif; font-size: 9.5pt; color: #14161a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; }
h1, h2 { font-family: "Space Grotesk", "Segoe UI", sans-serif; margin: 0; letter-spacing: -0.01em; }
.cover { display: flex; gap: 14pt; align-items: center; padding: 14pt 16pt; border-radius: 8pt; color: #e9ecf2; background: linear-gradient(135deg, #14161a, #1c1f25 55%, #12306b); margin-bottom: 12pt; }
.cover img { width: 34pt; height: 44pt; }
.cover h1 { font-size: 26pt; line-height: 1; }
.cover p { margin: 3pt 0 0; color: #b3bccb; }
.team { margin-top: 10pt; border: 1px solid #d3dbef; border-radius: 6pt; padding: 8pt 10pt; break-inside: avoid; }
.team h2 { font-size: 13pt; border-bottom: 2px solid #2f6fe8; padding-bottom: 3pt; margin-bottom: 8pt; }
.lanes { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8pt; }
.slot { text-align: center; }
.square { position: relative; aspect-ratio: 1; border-radius: 6pt; overflow: hidden; background: #1c1f25; }
.square > img, .square .placeholder { width: 100%; height: 100%; object-fit: cover; display: grid; place-items: center; color: #b3bccb; font: 700 14pt "Barlow Condensed", sans-serif; }
.square .lane { position: absolute; top: 4pt; left: 4pt; width: 18pt; height: 18pt; padding: 2pt; border-radius: 4pt; background: rgba(12, 16, 24, 0.82); }
.square .lane img { width: 100%; height: 100%; display: block; }
.slot b { display: block; margin-top: 3pt; font-size: 9pt; }
.slot small { display: block; color: #5a6788; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.06em; }
.empty { color: #9aa6c4; }
.note { margin-top: 14pt; padding-top: 6pt; border-top: 1px solid #d3dbef; color: #5a6788; font-size: 7.5pt; }
`;

function slot(lane, heroId, { heroById, portraitPath, t }) {
  const [label, file] = LANES[lane];
  const hero = heroId ? heroById.get(heroId) : null;
  const name = hero ? hero.displayName || hero.name : null;
  const src = heroId ? portraitPath(heroId) : null;
  const picture = src
    ? `<img src="${escapeHtml(src)}" alt="">`
    : `<div class="placeholder">${name ? escapeHtml(name.slice(0, 2).toUpperCase()) : "–"}</div>`;
  return `<div class="slot"><div class="square">${picture}<span class="lane"><img src="/icons/${file}" alt=""></span></div><b${name ? "" : ' class="empty"'}>${escapeHtml(name ?? t("No hero"))}</b><small>${escapeHtml(t(label))}</small></div>`;
}

/** The page of the PDF: a cover, then one block per composition. */
export function renderBasketHtml({
  compositions,
  heroById,
  portraitPath,
  generatedAt,
  language = "en"
}) {
  const t = (key, params) => tr(language, key, params);
  const context = { heroById, portraitPath, t };
  const teams = compositions
    .map(
      (item, index) =>
        `<section class="team"><h2>${escapeHtml(item.name || t("Composition {n}", { n: index + 1 }))}</h2><div class="lanes">${LANE_KEYS.map(lane => slot(lane, item.result[lane], context)).join("")}</div></section>`
    )
    .join("");
  return `<!doctype html><html lang="${language}" dir="${directionOf(language)}"><head><meta charset="utf-8"><title>${escapeHtml(t("Composition roulette"))}</title><link rel="stylesheet" href="/fonts/fonts.css"><style>${STYLES}</style></head><body>
    <header class="cover"><img src="/logo.svg" alt=""><div><h1>${escapeHtml(t("Composition roulette"))}</h1><p>${t("HOK Global Scrim Lab · Honor of Kings Global")}</p><p>${t("generated {date}", { date: escapeHtml(generatedAt) })}</p></div></header>
    ${teams}
    <p class="note">${t("Hero portraits belong to their respective owners (Tencent / TiMi Studio Group) and are shown from a local cache.")}</p>
  </body></html>`;
}

/** The lane icons as assets of the renderer (it fetches nothing from the network). */
export async function laneIconAssets(directory = path.join(WEB.public, "icons")) {
  const assets = new Map();
  for (const [, file] of Object.values(LANES)) {
    assets.set(`/icons/${file}`, {
      body: await readFile(path.join(directory, file)),
      contentType: "image/png"
    });
  }
  return assets;
}
