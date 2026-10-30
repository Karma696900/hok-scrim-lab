import { t } from "../app/browser-i18n.js";

/**
 * Placeholders shaped like the content that is on its way (styles/components/skeleton.css; the shimmer
 * itself is `.skeleton` in motion.css and stops with the reduced-motion setting). They keep the page from
 * jumping when the data arrives and tell a screen reader that something is loading.
 *
 * Every placeholder starts with the `loading-line` bar: the hydration (app/hydration.js) and the
 * pre-renderer (platform/http/prerender.js) recognise a page that is still waiting for its data by it.
 *
 *   skeleton("list", 5)   rows: a picture and two lines (history, requests, notifications)
 *   skeleton("grid", 6)   cards: a picture and two lines (teams, heroes, popular drafts)
 *   skeleton("page")      a heading and a few cards (any page that draws all of itself)
 */
const BAR = `<div class="loading-line"></div>`;
const LINES = `<span class="skeletons__lines"><span class="skeleton skeleton--line"></span><span class="skeleton skeleton--line skeleton--short"></span></span>`;

const rows = count =>
  Array.from(
    { length: count },
    () =>
      `<div class="skeletons__row" aria-hidden="true"><span class="skeleton skeleton--icon"></span>${LINES}</div>`
  ).join("");

const cards = count =>
  `<div class="skeletons__grid" aria-hidden="true">${Array.from(
    { length: count },
    () => `<div class="skeletons__card"><span class="skeleton skeleton--art"></span>${LINES}</div>`
  ).join("")}</div>`;

const head = () =>
  `<div class="skeletons__head" aria-hidden="true"><span class="skeleton skeleton--title"></span><span class="skeleton skeleton--line skeleton--short"></span></div>`;

export function skeleton(kind = "page", count = 5) {
  const body = kind === "list" ? rows(count) : kind === "grid" ? cards(count) : head() + cards(3);
  return `${BAR}<div class="skeletons skeletons--${kind}" role="status"><span class="visually-hidden">${t("Loading…")}</span>${body}</div>`;
}
