// scenario editor, small helpers: draftOf, mapOf, heroOptions, isTool.
import { t } from "../../app/browser-i18n.js";
import { heroPicker } from "../../shell/hero-picker.js";

export const draftOf = page =>
  page.existing
    ? { ...page.existing, pins: page.existing.pins.map(pin => ({ ...pin })) }
    : { id: null, mapId: page.maps[0].id, title: "", brief: "", published: false, pins: [] };

export const mapOf = page => page.maps.find(item => item.id === page.draft.mapId);

// the hero of a hero pin: a picker of avatars (owner, 2026-11-07)
export const heroOptions = page =>
  heroPicker({
    id: "tool-hero",
    value: page.tool.heroId ?? "",
    heroes: page.view.state.heroes.filter(hero => hero.availableGlobal !== false),
    empty: t("Choose a hero"),
    label: t("Hero")
  });

export const isTool = (page, type, side) =>
  page.tool.type === type && (side === undefined || page.tool.side === side);

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { mapOf, heroOptions, isTool };
