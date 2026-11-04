// What the parts of the Game Simulation page share: the lanes of a draft, the difficulties, the names
// and portraits of the heroes, and the test hooks read from the address.
import { t } from "../../app/browser-i18n.js";
import { escapeHtml } from "../../lib/escape.js";
import { responsive } from "../../../shared/media.js";

/** The five lanes of a draft, in the order of the scrim engine (the API takes these names). */
export const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
export const SIDES = ["blue", "red"];
export const DIFFICULTIES = ["easy", "normal", "hard"];

/** The engine's id of the hero in one slot (player/setups.js names them `${side}-${role}`). */
export const ROLE_OF_LANE = {
  "Clash Lane": "clash",
  Jungle: "jungle",
  "Mid Lane": "mid",
  "Farm Lane": "farm",
  Roamer: "roam"
};

export const difficultyLabel = level =>
  level === "easy" ? t("Easy") : level === "hard" ? t("Hard") : t("Normal");

export const sideLabel = side => (side === "red" ? t("Red side") : t("Blue side"));

/** The roster entry of a hero (the Catalogue id), or null. */
export const heroOf = (heroes, id) => heroes.find(hero => hero.id === String(id)) ?? null;

export const heroName = (heroes, id) => {
  const hero = heroOf(heroes, id);
  return hero ? hero.displayName || hero.name : String(id ?? "");
};

/** The portrait of a hero at `size` pixels (an empty disc when the roster has no picture). */
export function portrait(heroes, id, size = 40) {
  const hero = heroOf(heroes, id);
  return hero?.image
    ? `<img ${responsive(hero.image, size, `${size}px`)} alt="" decoding="async">`
    : `<span class="image-fallback"></span>`;
}

export const esc = escapeHtml;

/**
 * The test hooks of the address: `?limit=90` ends the game after 90 s of play (60 at least; the bots server plays
 * in real time). It only changes how long a game lasts, never what is graded. `?debug=map` draws the vector of
 * the map (walls, bushes, river) over its picture.
 */
export function addressHooks(search = globalThis.location?.search ?? "") {
  const query = new URLSearchParams(search);
  const bounded = (raw, min, max) => {
    const number = Number(raw);
    return Number.isFinite(number) && raw !== null ? Math.min(max, Math.max(min, number)) : null;
  };
  return {
    limit: bounded(query.get("limit"), 60, 3600) ?? 3600,
    debug: query.get("debug") === "map"
  };
}

/** `mm:ss` of a number of seconds. */
export function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

// only a WebP picture sent whole as a data address is drawn
const ART = /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/;

/** The picture the bots server sent under `key` (`start.art`), or null when there is none or it is not a WebP. */
export const artOf = (art, key) => {
  const picture = art?.[key];
  return typeof picture === "string" && ART.test(picture) ? picture : null;
};
