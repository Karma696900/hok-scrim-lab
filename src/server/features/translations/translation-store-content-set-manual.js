// translation store, content set manual: contentSetManual, contentReset, contentKeep, contentRetry, and 2 more.

/** An administrator's own translation of a text: true when the text exists. */
export async function contentSetManual(ctx, hash, language, text, now) {
  const [result] = await ctx.pool.execute(
    "UPDATE content_translations SET text = ?, status = 'ok', origin = 'manual', error = NULL, attempts = 0, retry_at = 0, updated_at = ? WHERE hash = ? AND language = ?",
    [text, now, hash, language]
  );
  return result.affectedRows > 0;
}

/** Back to the automatic translation: the row waits for the next one. */
export async function contentReset(ctx, hash, language, now) {
  // the text is not "as typed in every language" any more
  await ctx.pool.execute("UPDATE content_texts SET kept = 0 WHERE hash = ?", [hash]);
  const [result] = await ctx.pool.execute(
    "UPDATE content_translations SET text = NULL, status = 'pending', origin = 'machine', error = NULL, attempts = 0, retry_at = 0, updated_at = ? WHERE hash = ? AND language = ?",
    [now, hash, language]
  );
  return result.affectedRows > 0;
}

/** The text stays as typed in every language (a name that is not translated). */
export async function contentKeep(ctx, hash, now) {
  const [[found]] = await ctx.pool.execute("SELECT text FROM content_texts WHERE hash = ?", [hash]);
  if (!found) {
    return false;
  }
  // remembered on the text: a language that is asked for later is left as typed too
  await ctx.pool.execute("UPDATE content_texts SET kept = 1 WHERE hash = ?", [hash]);
  await ctx.pool.execute(
    "UPDATE content_translations SET text = ?, status = 'ok', origin = 'manual', error = NULL, attempts = 0, retry_at = 0, updated_at = ? WHERE hash = ?",
    [found.text, now, hash]
  );
  return true;
}

/** The failed rows try again at the next round (a language, or all of them). */
export async function contentRetry(ctx, language, now) {
  const [result] = await ctx.pool.execute(
    `UPDATE content_translations SET status = 'pending', error = NULL, attempts = 0, retry_at = 0, updated_at = ?
           WHERE status = 'failed'${language ? " AND language = ?" : ""}`,
    language ? [now, language] : [now]
  );
  return result.affectedRows;
}

export async function contentUsage(ctx, day) {
  const [[row]] = await ctx.pool.execute("SELECT chars FROM translation_usage WHERE day = ?", [
    day
  ]);
  return row ? Number(row.chars) : 0;
}

export async function contentAddUsage(ctx, day, chars) {
  await ctx.pool.execute(
    "INSERT INTO translation_usage (day, chars) VALUES (?, ?) ON DUPLICATE KEY UPDATE chars = chars + VALUES(chars)",
    [day, chars]
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  contentSetManual,
  contentReset,
  contentKeep,
  contentRetry,
  contentUsage,
  contentAddUsage
};
