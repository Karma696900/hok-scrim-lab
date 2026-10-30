// The small pieces the statistics are drawn with: avatars, rings, bars, figures.
import { number, percentage, t } from "../../app/browser-i18n.js";
import { responsive } from "../../../shared/media.js";
import { WINDOWS, windowLabel } from "./hero-stats-window.js";

// ---- pieces -------------------------------------------------------------------------------------

export const heroName = hero => hero.displayName || hero.name || "";

/**
 * A hero as its avatar only; the name is the accessible name and the tooltip. `count` is a small
 * badge.
 */
export function avatar(hero, { escapeHtml, size = 48, count = null, action = true }) {
  const name = escapeHtml(heroName(hero));
  const picture = hero.image
    ? `<img ${responsive(hero.image, size)} alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`
    : `<span class="image-fallback"></span>`;
  const badge = count === null ? "" : `<span class="avatar-count">${number(count)}</span>`;
  const body = `${picture}${badge}`;
  return action
    ? `<button type="button" class="hero-avatar hero-avatar-${size}" data-action="open-hero" data-hero-id="${escapeHtml(hero.id)}" aria-label="${name}" title="${name}">${body}</button>`
    : `<span class="hero-avatar hero-avatar-${size}" role="img" aria-label="${name}" title="${name}">${body}</span>`;
}

/** Win / loss ring with the win rate in the middle. */
export function donut(wins, losses) {
  const total = wins + losses;
  if (!total) {
    return "";
  }
  const radius = 42,
    circumference = 2 * Math.PI * radius;
  const won = (wins / total) * circumference;
  const label = t("{wins} wins, {losses} losses", { wins, losses });
  return `<figure class="donut" aria-label="${label}"><svg viewBox="0 0 100 100" width="132" height="132" aria-hidden="true">
    <circle class="donut-loss" cx="50" cy="50" r="${radius}" fill="none" stroke-width="12"/>
    <circle class="donut-win" cx="50" cy="50" r="${radius}" fill="none" stroke-width="12" stroke-dasharray="${won.toFixed(2)} ${(circumference - won).toFixed(2)}" transform="rotate(-90 50 50)"/>
  </svg><figcaption><strong>${percentage(wins / total, 0)}</strong><span>${t("{wins}-{losses}", { wins, losses })}</span></figcaption></figure>`;
}

/** The thin track of a ratio (0..1): drawn as an SVG, filled by a class. */
const track = value =>
  `<svg class="meter-track" viewBox="0 0 100 6" preserveAspectRatio="none" role="presentation" aria-hidden="true"><rect class="meter-back" width="100" height="6"/>${value ? `<rect class="meter-fill" width="${(value * 100).toFixed(2)}" height="6"/>` : ""}</svg>`;

const clamp = ratio =>
  ratio === null || ratio === undefined ? null : Math.max(0, Math.min(1, ratio));

/** A horizontal bar for a ratio (0..1), with its label and value as text. */
export function bar(label, ratio, { tone = "accent", detail = "" } = {}) {
  const value = clamp(ratio);
  const shown = value === null ? "—" : percentage(value, 1);
  return `<div class="meter meter-${tone}"><div class="meter-head"><span>${label}</span><strong>${shown}${detail ? ` <small>${detail}</small>` : ""}</strong></div>
    ${track(value)}</div>`;
}

/** A big figure: the ratio in large type, its label, a thin track and what it counts. */
export function figure(label, ratio, { tone = "accent", detail = "" } = {}) {
  const value = clamp(ratio);
  return `<div class="meter figure meter-${tone}"><strong class="figure__value">${value === null ? "—" : percentage(value, 1)}</strong><span class="figure__label">${label}</span>${track(value)}${detail ? `<small class="figure__detail">${detail}</small>` : ""}</div>`;
}

/** The four figures of the header of a sheet: how often the hero is picked, banned, how often it wins, and the games they come from. */
export function headlineFigures(stats) {
  const none = !stats.totalGames;
  const rate = ratio =>
    none || ratio === null || ratio === undefined ? "—" : percentage(ratio, 1);
  return [
    [t("Pick rate"), rate(stats.pickRate)],
    [t("Ban rate"), rate(stats.banRate)],
    [t("Win rate"), rate(stats.winRate)],
    [t("Games"), number(stats.totalGames ?? 0)]
  ];
}

export function windowPicker(window, rangeNote) {
  const date =
    window.kind === "from"
      ? `<span class="field"><input type="date" id="stats-window-date" value="${window.date}" aria-label="${t("First day to include")}"></span>`
      : "";
  return `<div class="window-picker"><label for="stats-window">${t("Period")}</label><span class="field"><select id="stats-window" data-stats-window>${WINDOWS.map(kind => `<option value="${kind}"${kind === window.kind ? " selected" : ""}>${windowLabel(kind)}</option>`).join("")}</select></span>${date}${rangeNote ? `<span class="muted">${rangeNote}</span>` : ""}</div>`;
}
