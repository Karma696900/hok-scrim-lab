// export service, small helpers: report, finish, exportSeries, exportFiltered, and 1 more.
import { HttpError, message } from "../../platform/errors.js";
import {
  buildPayload,
  embedInPdf,
  embedInPng,
  encodePayload,
  safeFileName
} from "../series/series-file.js";
import { presentHero } from "../heroes/hero-domain.js";
import { renderExportHtml } from "./report-template.js";
import { tr } from "../../platform/server-i18n.js";

export async function report(
  ctx,
  { user, series, filters = {}, comment = "", title = "", language = "en" }
) {
  const heroes = (await ctx.store.readHeroes()).map(presentHero);
  const used = new Set(
    series.flatMap(item =>
      item.games.flatMap(game =>
        ["bans", "picks"].flatMap(kind => ["blue", "red"].flatMap(side => game.draft[kind][side]))
      )
    )
  );
  const cached = await ctx.portraits.many(heroes.filter(hero => used.has(hero.id)));
  const assets = new Map();
  for (const [heroId, portrait] of cached) {
    if (portrait) {
      assets.set(`/portraits/${encodeURIComponent(heroId)}`, portrait);
    }
  }
  const html = renderExportHtml({
    generatedAt: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
    ownerName: user.isGuest ? tr(language, "Guest scrims") : user.name,
    filters,
    series,
    comment,
    title,
    language,
    heroById: new Map(heroes.map(hero => [hero.id, hero])),
    portraitPath: heroId =>
      assets.has(`/portraits/${encodeURIComponent(heroId)}`)
        ? `/portraits/${encodeURIComponent(heroId)}`
        : null
  });
  return { html, assets };
}

export async function finish(
  ctx,
  { user, series, filters, comment, title, format, filename, fallbackName, language }
) {
  const { html, assets } = await ctx.report({ user, series, filters, comment, title, language });
  const payload = encodePayload(buildPayload(series, { comment }));
  if (format === "png") {
    const { png, blocked } = await ctx.exporter.renderPng({ html, assets });
    ctx.logger?.info("png exported", {
      series: series.length,
      bytes: png.length,
      blocked: blocked.length
    });
    return {
      body: embedInPng(png, payload),
      contentType: "image/png",
      filename: safeFileName(filename, fallbackName, "png"),
      count: series.length
    };
  }
  const { pdf, blocked } = await ctx.exporter.render({ html, assets, language });
  const body = await embedInPdf(pdf, payload, { title: title || fallbackName, comment });
  ctx.logger?.info("pdf exported", {
    series: series.length,
    bytes: body.length,
    blocked: blocked.length,
    portraits: assets.size
  });
  return {
    body,
    contentType: "application/pdf",
    filename: safeFileName(filename, fallbackName, "pdf"),
    count: series.length
  };
}

/** One series the viewer can see. */
export function exportSeries(
  ctx,
  user,
  series,
  { format = "pdf", comment = "", filename = "", language = "en" } = {}
) {
  const games = series.games.length;
  if (format === "png" && games > PNG_MAX_GAMES) {
    throw new HttpError(422, "png_too_large", PNG_LIMIT_MESSAGE, { limit: PNG_MAX_GAMES });
  }
  const fallbackName = `${series.teamA.name}_vs_${series.teamB.name}_BO${series.bestOf}`;
  return ctx.queue.run(user.id, () =>
    ctx.finish({
      user,
      series: [series],
      filters: {},
      comment,
      title: `${series.teamA.name} vs ${series.teamB.name}`,
      format,
      filename,
      fallbackName,
      language
    })
  );
}

/** The History selection (own series matching the filters), PDF only. */
export async function exportFiltered(
  ctx,
  user,
  filters,
  { comment = "", filename = "", language = "en" } = {}
) {
  const total = await ctx.store.countOwnScrims(user.id, filters);
  if (total > ctx.maxSeries) {
    throw new HttpError(422, "export_too_large", EXPORT_LIMIT_MESSAGE, {
      total,
      limit: ctx.maxSeries
    });
  }
  return ctx.queue.run(user.id, async () => {
    const series = await ctx.store.listOwnScrims(user.id, { filters, limit: ctx.maxSeries + 1 });
    if (series.length > ctx.maxSeries) {
      throw new HttpError(422, "export_too_large", EXPORT_LIMIT_MESSAGE, { limit: ctx.maxSeries });
    }
    return ctx.finish({
      user,
      series,
      filters,
      comment,
      title: "",
      format: "pdf",
      filename,
      fallbackName: `hok-series-${new Date().toISOString().slice(0, 10)}`,
      language
    });
  });
}

export const EXPORT_LIMIT_MESSAGE = message(
  "100 series maximum per export. Narrow the date range or filters."
);

const PNG_MAX_GAMES = 15;

const PNG_LIMIT_MESSAGE = message(
  "A PNG shows up to {limit} games. Export this series as a PDF instead."
);

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { report, finish, exportSeries, exportFiltered };
