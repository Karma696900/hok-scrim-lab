import { bindTo } from "../../../shared/bind-to.js";
import { onView as exportServiceParts } from "./export-service-parts.js";
export { EXPORT_LIMIT_MESSAGE } from "./export-service-parts.js";

export const EXPORT_MAX_SERIES = 100;

/**
 * Builds the owner's styled report (PDF or PNG) of one series or of a filtered selection. Every
 * file also embeds the series data so it can be imported back (see series-file.js). Chromium work
 * goes through the bounded queue.
 */
export function createExportService({
  store,
  portraits,
  exporter,
  queue,
  logger,
  maxSeries = EXPORT_MAX_SERIES
}) {
  const ctx = { store, portraits, exporter, logger, queue, maxSeries };
  bindTo(ctx, exportServiceParts);

  return {
    exportSeries: ctx.exportSeries,

    exportFiltered: ctx.exportFiltered
  };
}
