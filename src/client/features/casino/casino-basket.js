// casino page, the basket (owner, 2026-11-07): compositions kept from any roulette, in this browser (localStorage
// `casino-basket`, or in memory for the tab when the browser refuses storage), at most 50; renamed and removed in a
// side panel, then sent to the server for one PDF (POST /api/casino/pdf).
import { t } from "../../app/browser-i18n.js";
import { slotImage } from "../../lib/dom.js";
import { icon } from "../../../shared/icons.js";
import { laneLabel, laneLogos } from "../../domain/lanes.js";

export const BASKET_MAX = 50;
const SLOT = "casino-basket";
const NAME_MAX = 80;
const LANES = [
  ["clash", "Clash Lane"],
  ["jungle", "Jungle"],
  ["mid", "Mid Lane"],
  ["farm", "Farm Lane"],
  ["roam", "Roamer"]
];
let memory = [];

/** The kept compositions, oldest first. */
export function readBasket() {
  try {
    const stored = globalThis.localStorage?.getItem(SLOT);
    if (stored) {
      const list = JSON.parse(stored);
      return Array.isArray(list) ? list.slice(0, BASKET_MAX) : [];
    }
  } catch {
    // storage refused or damaged: the tab's copy
  }
  return memory.map(item => ({ ...item }));
}

function write(list) {
  memory = list.map(item => ({ ...item }));
  try {
    globalThis.localStorage?.setItem(SLOT, JSON.stringify(list));
  } catch {
    // private browsing: the tab keeps it in memory
  }
}

/** Empties the basket. */
export function clearBasket() {
  memory = [];
  try {
    globalThis.localStorage?.removeItem(SLOT);
  } catch {
    // nothing kept there
  }
}

/** Keeps the five heroes of `result`; `{ ok: false, reason }` when it has no hero or the basket is full. */
export function addToBasket(result, now = Date.now()) {
  const lanes = Object.fromEntries(LANES.map(([key]) => [key, result?.[key] ?? null]));
  if (!Object.values(lanes).some(Boolean)) {
    return { ok: false, reason: "empty" };
  }
  const list = readBasket();
  if (list.length >= BASKET_MAX) {
    return { ok: false, reason: "full" };
  }
  list.push({
    id: `${now.toString(36)}-${list.length}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    result: lanes,
    at: now
  });
  write(list);
  return { ok: true, count: list.length };
}

/** Renames one kept composition (an empty name shows its number). */
export function renameInBasket(id, name) {
  const clean = String(name ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, NAME_MAX);
  write(readBasket().map(item => (item.id === id ? { ...item, name: clean } : item)));
}

/** Removes one kept composition. */
export function removeFromBasket(id) {
  write(readBasket().filter(item => item.id !== id));
}

/** What the server needs for the PDF. */
export const basketRequest = list => ({
  compositions: list.map(item => ({ name: item.name, result: item.result }))
});

const avatar = (view, heroes, lane, id) => {
  const hero = id ? heroes.get(id) : null;
  const name = hero ? hero.displayName || hero.name : t("No hero");
  return `<li class="casino-basket__hero" title="${view.esc(`${laneLabel(lane)}: ${name}`)}"><span class="casino-basket__art">${hero ? slotImage(hero) : `<span class="image-fallback"></span>`}</span>${laneLogos([lane], 16, { decorative: true })}<span class="visually-hidden">${view.esc(`${laneLabel(lane)}: ${name}`)}</span></li>`;
};

/** The side panel: every kept composition, its name to edit, its remove button; the download at the bottom. */
export function basketMarkup(view, list, heroes) {
  const items = list
    .map(
      (item, index) => `<li class="casino-basket__item" data-basket-id="${view.esc(item.id)}">
        <div class="casino-basket__row"><label><span class="visually-hidden">${t("Name")}</span><input type="text" name="casino-basket-name" maxlength="${NAME_MAX}" value="${view.esc(item.name)}" placeholder="${view.esc(t("Composition {n}", { n: index + 1 }))}" data-basket-id="${view.esc(item.id)}"></label><button type="button" class="btn btn--ghost btn--icon btn--sm" data-action="casino-basket-remove" data-basket-id="${view.esc(item.id)}" aria-label="${view.esc(t("Remove"))}">${icon("trash", "i--sm")}</button></div>
        <ul class="casino-basket__heroes">${LANES.map(([key, lane]) => avatar(view, heroes, lane, item.result[key])).join("")}</ul>
      </li>`
    )
    .join("");
  return `<div class="casino-basket__head"><h2>${t("Basket")} <b class="casino-count">${list.length}</b></h2><button type="button" class="btn btn--ghost btn--icon btn--sm" data-action="casino-basket-close" aria-label="${view.esc(t("Close"))}">${icon("x", "i--sm")}</button></div>
    ${
      list.length
        ? `<ol class="casino-basket__list">${items}</ol><div class="casino-basket__foot"><button type="button" class="btn btn--primary" data-action="casino-basket-pdf">${icon("download", "i--sm")}${t("Download the PDF")}</button></div>`
        : `<p class="casino-basket__empty">${t("Add a composition from a roulette: it is kept here, in this browser, until you download it.")}</p>`
    }`;
}
