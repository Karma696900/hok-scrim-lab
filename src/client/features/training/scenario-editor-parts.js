// scenario editor, small helpers: draftOf, mapOf, heroOptions, isTool.
import { escapeHtml as esc } from "../../lib/escape.js";
import { t } from "../../app/browser-i18n.js";

export const draftOf = page =>
  page.existing
    ? { ...page.existing, pins: page.existing.pins.map(pin => ({ ...pin })) }
    : { id: null, mapId: page.maps[0].id, title: "", brief: "", published: false, pins: [] };

export const mapOf = page => page.maps.find(item => item.id === page.draft.mapId);

export const heroOptions = page =>
  `<option value="">${t("Choose a hero")}</option>${page.view.state.heroes
    .filter(hero => hero.availableGlobal !== false)
    .map(
      hero =>
        `<option value="${esc(hero.id)}"${hero.id === page.tool.heroId ? " selected" : ""}>${esc(hero.displayName || hero.name)}</option>`
    )
    .join("")}`;

export const isTool = (page, type, side) =>
  page.tool.type === type && (side === undefined || page.tool.side === side);

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { mapOf, heroOptions, isTool };
