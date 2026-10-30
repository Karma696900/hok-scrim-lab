// Small pieces of markup that the lists and the forms of the catalog share.
import { catalogImageAttrs } from "../../domain/catalog-display.js";
import { classLabel } from "../../domain/lanes.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { formatEntry } from "../../../shared/build-model.js";
import { number, t } from "../../app/browser-i18n.js";
import { responsive } from "../../../shared/media.js";
import { sceneHero } from "../../domain/scene-art.js";
import { spellFacts } from "../build-lab/build-lab-view.js";

export const lead = () => sceneHero(4);

export const statOf = (view, id) => view.catalog.stats.find(stat => stat.id === id);

export const heroName = hero => hero.displayName || hero.name;

export const picture = (imageId, className = "catalog-picture", size = 44) =>
  imageId
    ? `<img class="${className}" ${catalogImageAttrs(imageId, size)} alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`
    : `<span class="${className} image-fallback"></span>`;

export const chip = tag =>
  `<span class="tag-chip tag-${esc(tag.color)}" title="${esc(tag.description)}">${esc(tag.name)}</span>`;

export const field = (label, control, { area = false } = {}) =>
  `<label class="label">${label}<span class="field${area ? " field--area" : ""}">${control}</span></label>`;

export const group = (label, body) => `<div class="label">${label}${body}</div>`;

// ---- what the lists know about the entries ----------------------------------------------------

/** The first stats of an item or an arcana as one short line: "+240 Physical Defense, +1000 Max Health +1". */
export const statSummary = (view, entry) => {
  const lines = (entry.stats ?? []).filter(line => view.statOf(line.statId));
  const text = lines
    .slice(0, 2)
    .map(line => `${formatEntry(view.statOf(line.statId), line)} ${view.statOf(line.statId).name}`)
    .join(", ");
  return lines.length > 2 ? `${text} +${lines.length - 2}` : text;
};

export const statUse = (view, id) => ({
  items: view.catalog.items.filter(entry => entry.stats.some(line => line.statId === id)).length,
  arcana: view.catalog.arcana.filter(entry => entry.stats.some(line => line.statId === id)).length
});

export const tagUse = (view, id) => ({
  items: view.catalog.items.filter(entry => entry.tags.includes(id)).length,
  arcana: view.catalog.arcana.filter(entry => entry.tags.includes(id)).length,
  heroes: Object.values(view.catalog.heroTags ?? {}).filter(list => list.includes(id)).length
});

export const tagsOfHero = (view, hero) =>
  (view.catalog.heroTags?.[hero.id] ?? [])
    .map(id => view.catalog.tags.find(tag => tag.id === id))
    .filter(Boolean);

export const numberCell = given =>
  given == null
    ? `<span class="ws-none">&mdash;</span>`
    : `<span class="num">${number(given)}</span>`;

/** The tags of an entry as small chips: two of them, and how many more. */
export function tagCell(view, ids) {
  const tags = ids.map(id => view.catalog.tags.find(tag => tag.id === id)).filter(Boolean);
  if (!tags.length) {
    return `<span class="ws-none">&mdash;</span>`;
  }
  return `<span class="ct-tags">${tags.slice(0, 2).map(chip).join("")}${tags.length > 2 ? `<span class="ct-more">+${tags.length - 2}</span>` : ""}</span>`;
}

/** The first cell of a row: the picture, the name and the line under it. */
export function mainCell(view, entry) {
  switch (view.tab) {
    case "items":
    case "arcana": {
      const summary = view.statSummary(entry);
      return `${picture(entry.imageId)}<span class="ws-main-cell"><b>${esc(entry.name)}</b>${summary ? `<small>${esc(summary)}</small>` : `<small class="ct-todo">${t("Without stats")}</small>`}</span>`;
    }
    case "spells":
      return `${picture(entry.imageId)}<span class="ws-main-cell"><b>${esc(entry.name)}</b><small>${esc(spellFacts(entry) || t("Not entered yet."))}</small></span>`;
    case "tags":
      return chip(entry);
    case "hero-tags":
      return `<span class="catalog-picture ct-portrait">${heroPicture(entry)}</span><span class="ws-main-cell"><b>${esc(heroName(entry))}</b><small>${esc((entry.roles ?? []).map(classLabel).join(" · "))}</small></span>`;
    default:
      return `<span class="ws-main-cell"><b>${esc(entry.name)}</b></span>`;
  }
}

export const heroPicture = hero =>
  hero.image
    ? `<img ${responsive(hero.image, 44)} alt="" width="44" height="44" loading="lazy" decoding="async">`
    : `<span class="image-fallback"></span>`;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { statOf, statSummary, statUse, tagUse, tagsOfHero, tagCell, mainCell };
