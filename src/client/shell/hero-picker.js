// The hero picker (owner, 2026-11-07): wherever a form asks for one hero, a button with the chosen hero's avatar
// opens a panel of avatars (a search, the five lanes) instead of a list of names. A hidden field keeps the id, the
// name and the value of the list it replaces, and a pick fires `change` on it, so the forms and the handlers of the
// pages read it as they read the list. The panel is the menu of the top bar (popover.js): Escape, a click outside
// or a pick closes it.
import { t } from "../app/browser-i18n.js";
import { escapeHtml as esc, slotImage } from "../lib/dom.js";
import { icon } from "../../shared/icons.js";
import { laneLabel, laneLogos } from "../domain/lanes.js";
import { openMenu } from "./popover.js";

const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
// what each picker on screen offers (its heroes, its empty choice, its captions), by the id of its field
const offers = new Map();

const nameOf = hero => hero.displayName || hero.name || "";
const fold = text =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// the inside of the button: the avatar and the name of the choice, and the arrow
const face = (offer, value) => {
  const hero = value ? offer.heroes.find(item => item.id === value) : null;
  const art = hero ? slotImage(hero) : `<span class="image-fallback"></span>`;
  const text = hero ? nameOf(hero) : offer.empty || t("Choose a hero");
  return `<span class="hero-picker__art">${art}</span><span class="hero-picker__name">${esc(text)}</span>${icon("chevron", "i--sm")}`;
};
const spoken = (offer, value) => {
  const hero = value ? offer.heroes.find(item => item.id === value) : null;
  return `${offer.label}: ${hero ? nameOf(hero) : offer.empty || t("Choose a hero")}`;
};

/**
 * A hero field: `{ id, name, value, heroes, empty, label, captions }`. `empty` is the meaning of no hero ("All
 * heroes", "No hero"); without it a hero must be chosen. `captions` adds a line under some heroes (`{ id: text }`).
 */
export function heroPicker({
  id,
  name = "",
  value = "",
  heroes,
  empty = "",
  label,
  captions = null
}) {
  const offer = { heroes, empty, label: label || t("Hero"), captions };
  offers.set(id, offer);
  return `<span class="hero-picker" data-hero-picker="${esc(id)}"><input type="hidden" id="${esc(id)}" name="${esc(name)}" value="${esc(value)}"><button type="button" class="hero-picker__button" data-action="hero-picker" aria-haspopup="true" aria-expanded="false" aria-label="${esc(spoken(offer, value))}">${face(offer, value)}</button></span>`;
}

const avatar = (offer, hero, value) => {
  const caption = offer.captions?.[hero.id];
  return `<button type="button" class="hero-pick__item" data-pick="${esc(hero.id)}" aria-pressed="${hero.id === value}" title="${esc(nameOf(hero))}"><span class="hero-pick__art">${slotImage(hero)}</span><span class="hero-pick__name">${esc(nameOf(hero))}</span>${caption ? `<small>${esc(caption)}</small>` : ""}</button>`;
};

/** The avatars that match `query` and `lane`, the empty choice first when there is one. */
export function heroPickerGrid(offer, { query = "", lane = "", value = "" } = {}) {
  const wanted = fold(query).trim();
  const shown = offer.heroes.filter(
    hero =>
      (!lane || (hero.lanes ?? []).includes(lane)) &&
      (!wanted || fold(nameOf(hero)).includes(wanted) || fold(hero.name).includes(wanted))
  );
  const none =
    offer.empty && !wanted && !lane
      ? `<button type="button" class="hero-pick__item hero-pick__item--empty" data-pick="" aria-pressed="${!value}"><span class="hero-pick__art">${icon("x")}</span><span class="hero-pick__name">${esc(offer.empty)}</span></button>`
      : "";
  return shown.length || none
    ? `${none}${shown.map(hero => avatar(offer, hero, value)).join("")}`
    : `<p class="hero-pick__none">${t("No hero matches this search.")}</p>`;
}

/** The whole panel: the search, the lanes, the avatars. */
export function heroPickerPanel(offer, ask = {}) {
  const lanes = ["", ...LANES]
    .map(
      lane =>
        `<button type="button" class="hero-pick__lane" data-pick-lane="${esc(lane)}" aria-pressed="${(ask.lane ?? "") === lane}" title="${esc(lane ? laneLabel(lane) : t("All lanes"))}">${lane ? laneLogos([lane], 18, { decorative: true }) : t("All")}<span class="visually-hidden">${esc(lane ? laneLabel(lane) : t("All lanes"))}</span></button>`
    )
    .join("");
  return `<div class="hero-pick__head"><label class="hero-pick__search">${icon("search", "i--sm")}<span class="visually-hidden">${t("Search a hero")}</span><input type="search" placeholder="${esc(t("Search a hero"))}" autocomplete="off" value="${esc(ask.query ?? "")}"></label><div class="hero-pick__lanes">${lanes}</div></div><div class="hero-pick__grid">${heroPickerGrid(offer, ask)}</div>`;
}

/** Puts `id` in the picker's field, redraws its button and tells the page (a `change` that bubbles). */
export function pickInto(picker, id, offer) {
  const input = picker.querySelector("input[type=hidden]");
  const button = picker.querySelector(".hero-picker__button");
  input.value = id;
  button.innerHTML = face(offer, id);
  button.setAttribute("aria-label", spoken(offer, id));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

// opens the panel of a picker; `typed` is the start of a name typed on the closed field (as in a list of names)
function open(button, typed = "") {
  const picker = button.closest("[data-hero-picker]");
  const offer = offers.get(picker?.dataset.heroPicker);
  if (!offer) {
    return;
  }
  const ask = { query: typed, lane: "", value: picker.querySelector("input[type=hidden]").value };
  const pop = openMenu(button, heroPickerPanel(offer, ask), {
    label: offer.label,
    className: "hero-pick",
    align: "start",
    onPick: id => {
      pickInto(picker, id, offer);
      button.focus();
    }
  });
  if (!pop) {
    return;
  }
  const grid = pop.querySelector(".hero-pick__grid");
  const search = pop.querySelector('input[type="search"]');
  const redraw = () => {
    grid.innerHTML = heroPickerGrid(offer, ask);
  };
  search.addEventListener("input", () => {
    ask.query = search.value;
    redraw();
  });
  search.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      grid.querySelector("[data-pick]")?.click();
    }
  });
  pop.addEventListener("click", event => {
    const chip = event.target.closest("[data-pick-lane]");
    if (chip) {
      ask.lane = chip.dataset.pickLane;
      for (const other of pop.querySelectorAll("[data-pick-lane]")) {
        other.setAttribute("aria-pressed", String(other === chip));
      }
      redraw();
    }
  });
  search.focus({ preventScroll: true });
  search.setSelectionRange(search.value.length, search.value.length);
}

// one listener for every picker of every page
if (typeof document !== "undefined" && !globalThis.heroPickerListening) {
  globalThis.heroPickerListening = true;
  document.addEventListener("click", event => {
    const button = event.target?.closest?.('[data-action="hero-picker"]');
    if (button) {
      open(button);
    }
  });
  document.addEventListener("keydown", event => {
    const button = event.target?.closest?.('[data-action="hero-picker"]');
    const letter =
      event.key?.length === 1 &&
      event.key !== " " &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey;
    if (button && letter && button.getAttribute("aria-expanded") !== "true") {
      event.preventDefault();
      open(button, event.key);
    }
  });
}
