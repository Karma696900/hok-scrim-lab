import { bindTo } from "../../../shared/bind-to.js";
import { onView as heroStoreMetadataRoster } from "./hero-store-metadata-roster.js";
import { onView as heroStoreHeroSheets } from "./hero-store-hero-sheets.js";
import { onView as heroStoreOtherNames } from "./hero-store-other-names.js";
import { onView as heroStoreManualHero } from "./hero-store-manual-hero.js";

/**
 * Database access for the hero roster, the hero sheets taken from Camp, the localized names and the
 * lanes an administrator adds or removes.
 */
export function createHeroStore({ pool, inTransaction }) {
  const ctx = { pool, inTransaction };
  bindTo(
    ctx,
    heroStoreMetadataRoster,
    heroStoreHeroSheets,
    heroStoreOtherNames,
    heroStoreManualHero
  );
  ctx.heroCache = null;
  ctx.nameCache = new Map();
  ctx.backgroundCache = new Map();

  return {
    readMetadata: ctx.readMetadata,
    writeMetadata: ctx.writeMetadata,
    readHeroes: ctx.readHeroes,
    saveHeroes: ctx.saveHeroes,

    saveHeroDetails: ctx.saveHeroDetails,
    getHeroDetails: ctx.getHeroDetails,
    heroDetailsStatus: ctx.heroDetailsStatus,
    listBackgroundVideos: ctx.listBackgroundVideos,
    heroDetailsLanguages: ctx.heroDetailsLanguages,
    heroNameLanguages: ctx.heroNameLanguages,
    readHeroNames: ctx.readHeroNames,
    saveHeroNames: ctx.saveHeroNames,

    listHeroAliases: ctx.listHeroAliases,
    addHeroAlias: ctx.addHeroAlias,
    removeHeroAlias: ctx.removeHeroAlias,

    addHeroLane: ctx.addHeroLane,
    removeHeroLane: ctx.removeHeroLane
  };
}
