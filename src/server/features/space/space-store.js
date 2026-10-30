import { bindTo } from "../../../shared/bind-to.js";
import { onView as spaceStoreBuildsKept } from "./space-store-builds-kept.js";
import { onView as spaceStoreLinks } from "./space-store-links.js";
import { onView as spaceStoreParts } from "./space-store-parts.js";

/** Database access for the personal space: the builds kept on the account and the sharing links. */
export function createSpaceStore({ pool, inTransaction }) {
  const ctx = { pool, inTransaction };
  bindTo(ctx, spaceStoreBuildsKept, spaceStoreLinks, spaceStoreParts);

  return {
    listSpaceBuilds: ctx.listSpaceBuilds,
    addSpaceBuild: ctx.addSpaceBuild,
    deleteSpaceBuild: ctx.deleteSpaceBuild,

    listSpaceLinks: ctx.listSpaceLinks,
    createSpaceLink: ctx.createSpaceLink,
    deleteSpaceLink: ctx.deleteSpaceLink,
    openSpaceLink: ctx.openSpaceLink,
    ownedTierLists: ctx.ownedTierLists,
    acquiredCombos: ctx.acquiredCombos
  };
}
