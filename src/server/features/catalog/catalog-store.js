import { bindTo } from "../../../shared/bind-to.js";
import { onView as catalogStoreParts } from "./catalog-store-parts.js";
import { onView as catalogStoreStats } from "./catalog-store-stats.js";
import { onView as catalogStoreTags } from "./catalog-store-tags.js";
import { onView as catalogStoreItems } from "./catalog-store-items.js";
import { onView as catalogStoreArcana } from "./catalog-store-arcana.js";
import { onView as catalogStoreSpells } from "./catalog-store-spells.js";
import { onView as catalogStoreHeroProfiles } from "./catalog-store-hero-profiles.js";
import { onView as catalogStoreRecommendedBuilds } from "./catalog-store-recommended-builds.js";

/**
 * Database access for the game catalogue (stats, tags, items, arcana, pictures), the hero profiles
 * and the recommended builds.
 */
export function createCatalogStore({ pool, inTransaction }) {
  const ctx = { pool, inTransaction };
  bindTo(
    ctx,
    catalogStoreParts,
    catalogStoreStats,
    catalogStoreTags,
    catalogStoreItems,
    catalogStoreArcana,
    catalogStoreSpells,
    catalogStoreHeroProfiles,
    catalogStoreRecommendedBuilds
  );

  ctx.cache = null; // { value, expires }
  // Changes with every write: a read that was under way when one happened holds the catalogue as it
  // was before it, and is not kept (it would be served for the next half minute).
  ctx.generation = 0;

  ctx.store = {
    readCatalog: ctx.readCatalog,

    createStat: ctx.createStat,
    usageData: ctx.usageData,
    checkStatChange: ctx.checkStatChange,
    updateStat: ctx.updateStat,
    statUsage: ctx.statUsage,
    deleteStat: ctx.deleteStat,

    createTag: ctx.createTag,
    updateTag: ctx.updateTag,
    deleteTag: ctx.deleteTag,

    saveImage: ctx.saveImage,
    getImage: ctx.getImage,
    imageIds: ctx.imageIds,

    createItem: ctx.createItem,
    updateItem: ctx.updateItem,
    buildsUsing: ctx.buildsUsing,
    deleteItem: ctx.deleteItem,

    sortItems: ctx.sortItems,

    createArcana: ctx.createArcana,
    updateArcana: ctx.updateArcana,
    deleteArcana: ctx.deleteArcana,

    createSpell: ctx.createSpell,
    updateSpell: ctx.updateSpell,
    deleteSpell: ctx.deleteSpell,

    getHeroProfile: ctx.getHeroProfile,
    saveHeroProfile: ctx.saveHeroProfile,
    heroTags: ctx.heroTags,

    listBuildSets: ctx.listBuildSets,
    listBuildSummaries: ctx.listBuildSummaries,
    saveBuildSet: ctx.saveBuildSet,
    deleteBuildSet: ctx.deleteBuildSet
  };
  return ctx.store;
}
