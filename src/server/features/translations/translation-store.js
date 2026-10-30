import { bindTo } from "../../../shared/bind-to.js";
import { onView as translationStoreContentLock } from "./translation-store-content-lock.js";
import { onView as translationStoreContentSetManual } from "./translation-store-content-set-manual.js";

/**
 * Database access for the translated texts: what is kept, what is still to do, what an
 * administrator corrected, and the daily count of what was sent to the provider.
 */
export function createTranslationStore({ pool, inTransaction, acquireLock, database }) {
  const ctx = { acquireLock, database, pool, inTransaction };
  bindTo(ctx, translationStoreContentLock, translationStoreContentSetManual);

  return {
    contentLock: ctx.contentLock,

    contentSync: ctx.contentSync,

    contentWork: ctx.contentWork,

    contentSave: ctx.contentSave,

    contentDictionary: ctx.contentDictionary,
    contentVersion: ctx.contentVersion,

    contentStatus: ctx.contentStatus,

    contentLanguages: ctx.contentLanguages,
    contentWant: ctx.contentWant,

    contentList: ctx.contentList,

    contentSetManual: ctx.contentSetManual,
    contentReset: ctx.contentReset,
    contentKeep: ctx.contentKeep,
    contentRetry: ctx.contentRetry,

    contentUsage: ctx.contentUsage,
    contentAddUsage: ctx.contentAddUsage
  };
}
