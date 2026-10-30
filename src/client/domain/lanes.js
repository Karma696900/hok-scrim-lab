import { t } from "../app/browser-i18n.js";

// Camp lane badges, served as real files (cached, not inlined in JavaScript).
export const LANE_ICON_URLS = {
  "Clash Lane": "/icons/lane-clash-lane.png",
  Jungle: "/icons/lane-jungle.png",
  "Mid Lane": "/icons/lane-mid-lane.png",
  "Farm Lane": "/icons/lane-farm-lane.png",
  Roamer: "/icons/lane-roamer.png"
};

// Display names for lanes and roles. The lane ids ("Clash Lane", "All"…) are data keys and never
// change with the language.

/**
 * The logo of every lane a hero can play, side by side (a hero can be both Clash Lane and Jungle).
 * `escape` is the page's HTML escaper. The lane's name is the picture's text, so a screen reader
 * still hears it.
 */
export function laneIcons(lanes, escape, className = "lane-icon") {
  return (lanes ?? [])
    .filter(lane => LANE_ICON_URLS[lane])
    .map(
      lane =>
        `<img class="${className}" src="${LANE_ICON_URLS[lane]}" alt="${escape(laneName(lane))}" title="${escape(laneName(lane))}" width="22" height="22" decoding="async">`
    )
    .join("");
}

const escapeText = text =>
  String(text).replace(
    /[&<>"']/g,
    character =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );

/**
 * The lane logos of the new design: one rounded chip each, `size` pixels wide (14 to 32). A logo
 * that stands next to the name of its lane is `decorative`: it carries no text of its own.
 */
export function laneLogos(lanes, size = 22, { decorative = false } = {}) {
  return `<span class="lanes">${(lanes ?? [])
    .filter(lane => LANE_ICON_URLS[lane])
    .map(
      lane =>
        `<span class="lane ls-${size}"${decorative ? "" : ` title="${escapeText(laneName(lane))}"`}><img src="${LANE_ICON_URLS[lane]}" alt="${decorative ? "" : escapeText(laneName(lane))}" width="${size}" height="${size}" decoding="async"></span>`
    )
    .join("")}</span>`;
}

/** Short name used on slots and chips. */
export function laneLabel(lane) {
  switch (lane) {
    case "Clash Lane":
      return t("Clash");
    case "Jungle":
      return t("Jungle");
    case "Mid Lane":
      return t("Mid");
    case "Farm Lane":
      return t("Farm");
    case "Roamer":
      return t("Support");
    default:
      return lane;
  }
}

/** Full name used in filters and headings. */
export function laneName(lane) {
  switch (lane) {
    case "All":
      return t("All");
    case "All Roles":
      return t("All Roles");
    case "Clash Lane":
      return t("Clash Lane");
    case "Jungle":
      return t("Jungle");
    case "Mid Lane":
      return t("Mid Lane");
    case "Farm Lane":
      return t("Farm Lane");
    case "Roamer":
      return t("Roamer");
    default:
      return lane;
  }
}

export function roleLabel(role) {
  switch (role) {
    case "owner":
      return t("Owner");
    case "editor":
      return t("Editor");
    case "viewer":
      return t("Viewer");
    default:
      return role;
  }
}

/**
 * The six hero classes Camp names in English (some languages come back untranslated from Camp):
 * ours follow the page. Other values are Camp's own words.
 */
export function classLabel(value) {
  switch (value) {
    case "Tank":
      return t("Tank");
    case "Fighter":
      return t("Fighter");
    case "Mage":
      return t("Mage");
    case "Assassin":
      return t("Assassin");
    case "Marksman":
      return t("Marksman");
    case "Support":
      return t("Support@@class");
    default:
      return value;
  }
}
