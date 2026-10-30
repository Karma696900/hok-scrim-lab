// The map of a situation: the picture an administrator uploaded and the pins placed on it. Both the
// page that shows a situation and the editor draw it from here.
import { tx } from "../../domain/staff-content.js";
import { t } from "../../app/browser-i18n.js";
import { glyph, pinLabel, sideLabel } from "./training-shared.js";

export const mapUrl = map => `/training-maps/${encodeURIComponent(map.id)}`;

/**
 * A map with its pins. Positions are shares of the picture, so it looks the same at any size.
 * `kit` is the page kit (escape, hero names and portraits); editable pins are buttons.
 */
export function mapMarkup(kit, map, pins, { editable = false, selected = null } = {}) {
  const { esc, heroName, portrait } = kit;
  const pinMarkup = pin => {
    const dead = pin.dead ? ` ${t("(dead)")}` : "";
    const name =
      pin.type === "hero"
        ? `${heroName(pin.heroId)} · ${sideLabel(pin.side)}${dead}`
        : `${pinLabel(pin.type)}${pin.label ? ` · ${tx(pin.label)}` : ""}${pin.side ? ` · ${sideLabel(pin.side)}` : ""}`;
    const inner =
      pin.type === "hero"
        ? `${portrait(pin.heroId, 40, "pin-portrait")}${pin.dead ? '<span class="pin-dead" aria-hidden="true">✕</span>' : ""}`
        : glyph(pin.type);
    const classes = `map-pin ${pin.type === "hero" ? "hero" : "game"} ${pin.type}${pin.side ? ` ${pin.side}` : ""}${pin.dead ? " dead" : ""}${selected === pin.id ? " selected" : ""}`;
    const tag = editable ? 'button type="button"' : "span";
    return `<${tag} class="${classes}" data-pin="${esc(pin.id)}" data-x="${pin.x}" data-y="${pin.y}" title="${esc(name)}" aria-label="${esc(name)}"${editable ? "" : ' role="img"'}>${inner}${pin.type !== "hero" && pin.label ? `<span class="pin-label">${esc(pin.label)}</span>` : ""}</${editable ? "button" : "span"}>`;
  };
  return `<div class="map-board${editable ? " editable" : ""}" data-map="${esc(map.id)}" data-w="${map.width}" data-h="${map.height}"><img src="${mapUrl(map)}" alt="${t("Map")}" width="${map.width}" height="${map.height}" decoding="async"><div class="map-pins">${pins.map(pinMarkup).join("")}</div></div>`;
}

/**
 * Pins are placed with the style object (not an attribute): the page's content security policy
 * forbids inline styles.
 */
export function placePins(scope) {
  for (const board of scope.querySelectorAll(".map-board")) {
    board.style.aspectRatio = `${board.dataset.w} / ${board.dataset.h}`;
  }
  for (const pin of scope.querySelectorAll(".map-pin")) {
    pin.style.left = `${Number(pin.dataset.x) * 100}%`;
    pin.style.top = `${Number(pin.dataset.y) * 100}%`;
  }
}
