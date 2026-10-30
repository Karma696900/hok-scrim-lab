// hero store, hero sheets: saveHeroDetails, getHeroDetails, heroDetailsStatus, listBackgroundVideos, and 4 more.

// ---- hero sheets from Camp ------------------------------------------------------------------
export async function saveHeroDetails(ctx, heroId, details, lang = "en") {
  if (lang !== "en") {
    await ctx.pool.execute(
      "INSERT INTO hero_details_i18n (hero_id, lang, data_json, fetched_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data_json = VALUES(data_json), fetched_at = VALUES(fetched_at)",
      [heroId, lang, JSON.stringify(details), new Date().toISOString()]
    );
    return;
  }
  await ctx.pool.execute(
    "INSERT INTO hero_details (hero_id, data_json, source, fetched_at) VALUES (?, ?, 'camp', ?) ON DUPLICATE KEY UPDATE data_json = VALUES(data_json), fetched_at = VALUES(fetched_at)",
    [heroId, JSON.stringify(details), new Date().toISOString()]
  );
}

export async function getHeroDetails(ctx, heroId, lang = "en") {
  const [rows] =
    lang === "en"
      ? await ctx.pool.execute("SELECT data_json, fetched_at FROM hero_details WHERE hero_id = ?", [
          heroId
        ])
      : await ctx.pool.execute(
          "SELECT data_json, fetched_at FROM hero_details_i18n WHERE hero_id = ? AND lang = ?",
          [heroId, lang]
        );
  return rows[0] ? { details: JSON.parse(rows[0].data_json), fetchedAt: rows[0].fetched_at } : null;
}

/** Map heroId -> fetchedAt for the heroes that already have a sheet. */
export async function heroDetailsStatus(ctx, lang = "en") {
  const [rows] =
    lang === "en"
      ? await ctx.pool.query("SELECT hero_id, fetched_at FROM hero_details")
      : await ctx.pool.query("SELECT hero_id, fetched_at FROM hero_details_i18n WHERE lang = ?", [
          lang
        ]);
  return new Map(rows.map(row => [row.hero_id, row.fetched_at]));
}

/**
 * Heroes whose sheet carries a presentation video (id + https media URL): the pool of the page
 * background. Cached for ten minutes.
 */
export async function listBackgroundVideos(ctx, lang = "en") {
  const cached = ctx.backgroundCache.get(lang);
  if (cached && cached.expires > Date.now()) {
    return cached.items;
  }
  const videos = new Map();
  const collect = rows => {
    for (const row of rows) {
      try {
        const video = JSON.parse(row.data_json)?.world?.video;
        if (typeof video === "string" && video.startsWith("https://")) {
          videos.set(row.hero_id, video);
        }
      } catch {
        /* a damaged row is skipped */
      }
    }
  };
  collect((await ctx.pool.query("SELECT hero_id, data_json FROM hero_details"))[0]);
  // The video of the visitor's language (Camp's own localized cut) replaces the English one
  // where it has been fetched.
  if (lang !== "en") {
    collect(
      (
        await ctx.pool.execute("SELECT hero_id, data_json FROM hero_details_i18n WHERE lang = ?", [
          lang
        ])
      )[0]
    );
  }
  const items = [...videos].map(([heroId, video]) => ({ heroId, video }));
  ctx.backgroundCache.set(lang, { items, expires: Date.now() + 600_000 });
  return items;
}

/**
 * Languages (other than English) that already have hero sheets: the background refresh keeps
 * those up to date.
 */
export async function heroDetailsLanguages(ctx) {
  const [rows] = await ctx.pool.query("SELECT DISTINCT lang FROM hero_details_i18n");
  return rows.map(row => row.lang);
}

export async function heroNameLanguages(ctx) {
  const [rows] = await ctx.pool.query("SELECT DISTINCT lang FROM hero_names");
  return rows.map(row => row.lang);
}

/** Localized name and classes of the heroes: Map heroId -> { name, roles }. */
export async function readHeroNames(ctx, lang) {
  if (lang === "en") {
    return new Map();
  }
  const cached = ctx.nameCache.get(lang);
  if (cached && cached.expires > Date.now()) {
    return cached.names;
  }
  const [rows] = await ctx.pool.execute(
    "SELECT hero_id, name, roles_json FROM hero_names WHERE lang = ?",
    [lang]
  );
  const names = new Map(
    rows.map(row => [
      row.hero_id,
      {
        name: row.name,
        roles: typeof row.roles_json === "string" ? JSON.parse(row.roles_json) : row.roles_json
      }
    ])
  );
  ctx.nameCache.set(lang, { names, expires: Date.now() + 60_000 });
  return names;
}

export async function saveHeroNames(ctx, lang, entries) {
  const timestamp = new Date().toISOString();
  await ctx.inTransaction(async connection => {
    for (const { id, name, roles } of entries) {
      await connection.execute(
        "INSERT INTO hero_names (hero_id, lang, name, roles_json, fetched_at) SELECT ?, ?, ?, ?, ? FROM heroes WHERE id = ? ON DUPLICATE KEY UPDATE name = VALUES(name), roles_json = VALUES(roles_json), fetched_at = VALUES(fetched_at)",
        [id, lang, name, JSON.stringify(roles), timestamp, id]
      );
    }
  });
  ctx.nameCache.delete(lang);
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  saveHeroDetails,
  getHeroDetails,
  heroDetailsStatus,
  listBackgroundVideos,
  heroDetailsLanguages,
  heroNameLanguages,
  readHeroNames,
  saveHeroNames
};
