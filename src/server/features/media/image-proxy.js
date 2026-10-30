import { bindTo } from "../../../shared/bind-to.js";
import { onView as imageProxyParts } from "./image-proxy-parts.js";

/** The cache on disk, and how often (in writes) its size is looked at. */
const DISK_BUDGET_BYTES = 512 * 1024 * 1024;

/**
 * Camp's artwork is published at print size (a hero banner is several MB). Every image on the pages
 * goes through here: fetched once from the Camp media hosts, resized to the width asked for (from a
 * fixed list) and re-encoded as WebP, then kept in memory and on disk. The browser caches the
 * result for a year (the URL carries the source URL and the width). Only the Camp media hosts are
 * fetched (same allow-list as the sheet data), only PNG/JPEG/WebP/GIF, bounded in size, pixels,
 * time and concurrency, and no redirect is followed. Everything it keeps is bounded too: the memory
 * (a budget), the failures it remembers, the requests that wait, and the files on disk (the oldest go
 * first once the budget is passed).
 */
export function createImageProxy({
  directory,
  fetchImpl = fetch,
  logger,
  concurrency = 3,
  diskBudgetBytes = DISK_BUDGET_BYTES,
  now = Date.now
}) {
  const ctx = { concurrency, now, diskBudgetBytes, directory, fetchImpl, logger };
  bindTo(ctx, imageProxyParts);
  ctx.memory = new Map(); // key -> Buffer (insertion order = LRU order)
  ctx.memoryBytes = 0;
  ctx.inFlight = new Map(); // key -> Promise<Buffer>
  ctx.failures = new Map(); // key -> retry-after time
  ctx.active = 0;
  ctx.waiting = [];

  ctx.pruning = false;
  ctx.writes = 0;

  return { get: ctx.get, prune: ctx.prune };
}
