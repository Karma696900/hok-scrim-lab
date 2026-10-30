// HTML template for the PDF export. Rendered by Chromium with JavaScript disabled and the network
// blocked: every asset below is a local path (/fonts, /logo.svg, /portraits/<id>) answered by the
// exporter.
import { banSlots, getSeriesScore, pickSlots } from "../../../shared/draft-model.js";
import { directionOf } from "../../../shared/i18n.js";
import { tr } from "../../platform/server-i18n.js";

const escapeHtml = value =>
  String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );
const duration = seconds =>
  `${String(Math.floor((seconds || 0) / 60)).padStart(2, "0")}:${String((seconds || 0) % 60).padStart(2, "0")}`;
const modeLabel = (t, mode) =>
  mode === "global-ban-pick"
    ? t("Global Ban & Pick")
    : mode === "free-for-all"
      ? t("Free For All")
      : mode === "classic"
        ? t("Classic")
        : mode;
const statusLabel = (t, status) =>
  status === "active"
    ? t("Active")
    : status === "complete"
      ? t("Complete")
      : status === "draw"
        ? t("Draw")
        : status;

const STYLES = `
@page { size: A4; margin: 14mm 12mm 16mm; }
* { box-sizing: border-box; }
html { font-family: "Inter", "Segoe UI", sans-serif; font-size: 9.5pt; color: #14161a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; }
h1, h2, h3 { font-family: "Space Grotesk", "Segoe UI", sans-serif; margin: 0; letter-spacing: -0.01em; }
.cover { display: flex; gap: 14pt; align-items: center; padding: 14pt 16pt; border-radius: 8pt; color: #e9ecf2; background: linear-gradient(135deg, #14161a, #1c1f25 55%, #12306b); break-after: avoid; }
.cover img { width: 34pt; height: 44pt; }
.cover h1 { font-size: 26pt; line-height: 1; }
.cover p { margin: 3pt 0 0; color: #b3bccb; }
.facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin: 10pt 0 14pt; }
.fact { border: 1px solid #d3dbef; border-radius: 6pt; padding: 7pt 9pt; }
.fact strong { display: block; font: 600 16pt "Barlow Condensed", sans-serif; }
.fact span { color: #5a6788; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 4pt 6pt; border-bottom: 1px solid #e3e8f5; font-size: 8.5pt; vertical-align: top; }
th { color: #5a6788; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; }
.series { margin-top: 14pt; }
.series-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10pt; border-bottom: 2px solid #2f6fe8; padding-bottom: 3pt; margin-bottom: 6pt; break-after: avoid; }
.series-head h2 { font-size: 15pt; }
.series-head .score { font: 600 15pt "IBM Plex Mono", monospace; }
.muted { color: #5a6788; }
.game { border: 1px solid #d3dbef; border-radius: 6pt; padding: 6pt 8pt; margin-bottom: 6pt; break-inside: avoid; }
.game-head { display: flex; justify-content: space-between; gap: 8pt; font-weight: 700; margin-bottom: 4pt; }
.sides { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; }
.side { border-top: 3pt solid; padding-top: 3pt; }
.side.blue { border-color: #2f6fe8; }
.side.red { border-color: #cf3340; }
.side h3 { font-size: 10pt; display: flex; justify-content: space-between; }
.side.blue h3 span { color: #1f5fcc; }
.side.red h3 span { color: #c8283a; }
.row-label { margin: 3pt 0 1pt; color: #5a6788; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.06em; }
.heroes { display: flex; gap: 3pt; }
.hero { width: 40pt; text-align: center; }
.hero img, .hero .placeholder { display: block; width: 28pt; height: 28pt; margin: 0 auto; border-radius: 4pt; object-fit: cover; background: #e6ebf8; }
.hero .placeholder { display: grid; place-items: center; color: #5a6788; font: 700 8pt sans-serif; }
.ban img, .ban .placeholder { filter: grayscale(1); opacity: 0.55; }
.hero small { display: block; margin-top: 1pt; font-size: 6pt; line-height: 1.15; overflow-wrap: anywhere; }
.empty { color: #9aa6c4; }
.comment { margin: 10pt 0 0; padding: 8pt 10pt; border-left: 3pt solid #2f6fe8; background: #eef4ff; border-radius: 0 6pt 6pt 0; break-inside: avoid; }
.comment h3 { font-size: 9pt; color: #1f5fcc; margin-bottom: 2pt; }
.comment p { margin: 0; white-space: pre-wrap; font-size: 10pt; }
.note { margin-top: 14pt; padding-top: 6pt; border-top: 1px solid #d3dbef; color: #5a6788; font-size: 7.5pt; }
`;

function filterSummary(filters, t) {
  const draftControl = {
    solo: t("Solo"),
    local: t("Two players · local"),
    online: t("Online · invite a player")
  };
  const parts = [];
  if (filters.status) {
    parts.push(t("Status: {value}", { value: statusLabel(t, filters.status) }));
  }
  if (filters.mode) {
    parts.push(t("Hero rule: {value}", { value: modeLabel(t, filters.mode) }));
  }
  if (filters.draftMode) {
    parts.push(
      t("Draft control: {value}", { value: draftControl[filters.draftMode] ?? filters.draftMode })
    );
  }
  if (filters.q) {
    parts.push(t("Team contains “{value}”", { value: filters.q }));
  }
  if (filters.from) {
    parts.push(t("From {value}", { value: filters.from }));
  }
  if (filters.to) {
    parts.push(t("To {value}", { value: filters.to }));
  }
  return parts.length ? parts.join(" · ") : t("No filters (all your series)");
}

function heroCell(heroId, { heroById, portraitPath, ban = false }) {
  if (!heroId) {
    return `<div class="hero"><div class="placeholder empty">–</div></div>`;
  }
  const hero = heroById.get(heroId);
  const name = hero ? hero.displayName || hero.name : heroId;
  const src = portraitPath(heroId);
  const picture = src
    ? `<img src="${escapeHtml(src)}" alt="">`
    : `<div class="placeholder">${escapeHtml(name.slice(0, 2).toUpperCase())}</div>`;
  return `<div class="hero${ban ? " ban" : ""}">${picture}<small>${escapeHtml(name)}</small></div>`;
}

function sideBlock(side, game, context) {
  const { t } = context;
  const teamName = side === "blue" ? game.blueTeam : game.redTeam;
  const bans = banSlots(game.draft, side)
    .map(heroId => heroCell(heroId, { ...context, ban: true }))
    .join("");
  const picks = pickSlots(game.draft, side)
    .map(({ heroId }) => heroCell(heroId, context))
    .join("");
  return `<div class="side ${side}"><h3>${escapeHtml(teamName)}<span>${side === "blue" ? t("Blue side") : t("Red side")}</span></h3><div class="row-label">${t("Bans")}</div><div class="heroes">${bans}</div><div class="row-label">${t("Picks")}</div><div class="heroes">${picks}</div></div>`;
}

function seriesBlock(series, context) {
  const { t } = context;
  const score = getSeriesScore(series);
  const games = series.games
    .map(
      game =>
        `<div class="game"><div class="game-head"><span>${t("Game {number}", { number: game.gameNumber })}</span><span>${t("{winner} won · {duration}", { winner: escapeHtml(game.winner), duration: duration(game.durationSeconds) })}</span></div><div class="sides">${sideBlock("blue", game, context)}${sideBlock("red", game, context)}</div></div>`
    )
    .join("");
  return `<section class="series"><div class="series-head"><div><h2>${t("{teamA} vs {teamB}", { teamA: escapeHtml(series.teamA.name), teamB: escapeHtml(series.teamB.name) })}</h2><div class="muted">BO${series.bestOf} · ${escapeHtml(modeLabel(t, series.gameMode))} · ${escapeHtml(statusLabel(t, series.status))} · ${t("updated {date}", { date: escapeHtml(String(series.updatedAt).slice(0, 10)) })}</div></div><div class="score">${score.teamA} : ${score.teamB}</div></div>${games || `<p class="muted">${t("No recorded games.")}</p>`}</section>`;
}

/**
 * @param model { generatedAt, ownerName, filters, series: object[], heroById: Map, portraitPath: (id) => string|null }
 */
export function renderExportHtml({
  generatedAt,
  ownerName,
  filters,
  series,
  heroById,
  portraitPath,
  comment = "",
  title = "",
  language = "en"
}) {
  const t = (key, params) => tr(language, key, params);
  const context = { heroById, portraitPath, t };
  const games = series.reduce((sum, item) => sum + item.games.length, 0);
  const totalSeconds = series.reduce(
    (sum, item) => sum + item.games.reduce((inner, game) => inner + (game.durationSeconds || 0), 0),
    0
  );
  const rows = series
    .map(item => {
      const score = getSeriesScore(item);
      return `<tr><td>${t("{teamA} vs {teamB}", { teamA: escapeHtml(item.teamA.name), teamB: escapeHtml(item.teamB.name) })}</td><td>BO${item.bestOf}</td><td>${escapeHtml(modeLabel(t, item.gameMode))}</td><td>${escapeHtml(statusLabel(t, item.status))}</td><td>${score.teamA} : ${score.teamB}</td><td>${item.games.length}</td><td>${escapeHtml(String(item.updatedAt).slice(0, 10))}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html lang="${language}" dir="${directionOf(language)}"><head><meta charset="utf-8"><title>${escapeHtml(t("HOK Global Scrim Lab · Series export"))}</title><link rel="stylesheet" href="/fonts/fonts.css"><style>${STYLES}</style></head><body>
    <header class="cover"><img src="/logo.svg" alt=""><div><h1>${escapeHtml(title || (series.length === 1 ? t("{teamA} vs {teamB}", { teamA: series[0].teamA.name, teamB: series[0].teamB.name }) : t("Series export")))}</h1><p>${t("HOK Global Scrim Lab · Honor of Kings Global")}</p><p>${escapeHtml(ownerName)} · ${t("generated {date}", { date: escapeHtml(generatedAt) })}</p></div></header>
    ${comment ? `<section class="comment"><h3>${t("Note")}</h3><p>${escapeHtml(comment)}</p></section>` : ""}
    <div class="facts"><div class="fact"><strong>${series.length}</strong><span>${t("Series")}</span></div><div class="fact"><strong>${games}</strong><span>${t("Games")}</span></div><div class="fact"><strong>${duration(totalSeconds)}</strong><span>${t("Total game time (mm:ss)")}</span></div><div class="fact"><strong>${t("Global")}</strong><span>${t("Honor of Kings edition")}</span></div></div>
    <p class="muted"><strong>${t("Filters:")}</strong> ${escapeHtml(filterSummary(filters, t))}</p>
    <table><thead><tr><th>${t("Series")}</th><th>${t("Format")}</th><th>${t("Hero rule")}</th><th>${t("Status")}</th><th>${t("Score")}</th><th>${t("Games")}</th><th>${t("Updated")}</th></tr></thead><tbody>${rows || `<tr><td colspan="7" class="muted">${t("No series match these filters.")}</td></tr>`}</tbody></table>
    ${series.map(item => seriesBlock(item, context)).join("")}
    <p class="note">${t("Statistics and drafts come from the owner's own recorded scrims. No ranked or competitive data is included. This file can be imported back into HOK Global Scrim Lab (Scrims → Import). Hero portraits belong to their respective owners (Tencent / TiMi Studio Group) and are shown from a local cache.")}</p>
  </body></html>`;
}

/** Page footer; the page counter is filled in by Chromium. */
export const footerTemplate = (language = "en") =>
  `<div style="width:100%;font:7pt sans-serif;color:#5a6788;padding:0 12mm;display:flex;justify-content:space-between" dir="${directionOf(language)}"><span>HOK Global Scrim Lab</span><span>${tr(language, "Page {current} / {total}", { current: '<span class="pageNumber"></span>', total: '<span class="totalPages"></span>' })}</span></div>`;
