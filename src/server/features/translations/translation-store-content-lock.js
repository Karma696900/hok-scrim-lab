// translation store, content lock: contentLock, contentSync, contentWork, contentSave, and 6 more.
import { textHash } from "./translation-domain.js";

/**
 * A lock for whoever translates (one process at a time, even with several servers): { release }
 * or null when somebody else holds it. The name carries the database, for the tests that share
 * a MySQL server.
 */
export async function contentLock(ctx) {
  return ctx.acquireLock(`hok_translations:${ctx.database}`);
}

/**
 * Puts the texts that exist now in line with the table: a text that is new gets one row for each
 * language (waiting), a language that was added gets its rows, a text nobody uses any more goes
 * with its translations. `live` is Map(text → kind).
 */
export async function contentSync(ctx, live, languages, now) {
  const entries = [...live].map(([text, kind]) => ({ hash: textHash(text), text, kind }));
  const [known] = await ctx.pool.query("SELECT hash, kind FROM content_texts");
  const kinds = new Map(known.map(row => [row.hash, row.kind]));
  const liveHashes = new Set(entries.map(entry => entry.hash));
  const fresh = entries.filter(entry => !kinds.has(entry.hash));
  const renamed = entries.filter(
    entry => kinds.has(entry.hash) && kinds.get(entry.hash) !== entry.kind
  );
  const gone = known.map(row => row.hash).filter(hash => !liveHashes.has(hash));

  for (const part of chunks(fresh)) {
    await ctx.pool.query("INSERT IGNORE INTO content_texts (hash, text, kind, seen_at) VALUES ?", [
      part.map(entry => [entry.hash, entry.text, entry.kind, now])
    ]);
    if (languages.length) {
      await ctx.pool.query(
        "INSERT IGNORE INTO content_translations (hash, language, status, updated_at) VALUES ?",
        [part.flatMap(entry => languages.map(language => [entry.hash, language, "pending", now]))]
      );
    }
  }
  for (const entry of renamed) {
    await ctx.pool.execute("UPDATE content_texts SET kind = ? WHERE hash = ?", [
      entry.kind,
      entry.hash
    ]);
  }
  // a language that has been asked for since the texts were first seen (a text an administrator
  // keeps as typed is kept as typed in it too)
  for (const language of languages) {
    await ctx.pool.execute(
      "INSERT IGNORE INTO content_translations (hash, language, text, status, origin, updated_at) SELECT hash, ?, IF(kept = 1, text, NULL), IF(kept = 1, 'ok', 'pending'), IF(kept = 1, 'manual', 'machine'), ? FROM content_texts",
      [language, now]
    );
  }
  for (const part of chunks(gone)) {
    await ctx.pool.query("DELETE FROM content_texts WHERE hash IN (?)", [part]);
  }
  return { added: fresh.length, removed: gone.length };
}

/**
 * What is waited for: the rows that are pending, or failed and due again, grouped by text:
 * [{ hash, text, kind, sourceLanguage, languages }]. A text that is new comes first.
 */
export async function contentWork(ctx, now, limit = 600, languages = null) {
  if (languages && !languages.length) {
    return [];
  }
  const [rows] = await ctx.pool.query(
    `SELECT t.hash, t.text, t.kind, t.source_language, c.language, c.attempts
           FROM content_translations c JOIN content_texts t ON t.hash = c.hash
           WHERE c.status IN ('pending', 'failed') AND c.retry_at <= ?${languages ? " AND c.language IN (?)" : ""}
           ORDER BY (c.status = 'pending') DESC, t.seen_at DESC, t.hash LIMIT ?`,
    languages ? [now, languages, limit * 15] : [now, limit * 15]
  );
  const work = new Map();
  for (const row of rows) {
    if (!work.has(row.hash) && work.size >= limit) {
      continue;
    }
    if (!work.has(row.hash)) {
      work.set(row.hash, {
        hash: row.hash,
        text: row.text,
        kind: row.kind,
        sourceLanguage: row.source_language,
        languages: [],
        attempts: {}
      });
    }
    work.get(row.hash).languages.push(row.language);
    work.get(row.hash).attempts[row.language] = Number(row.attempts);
  }
  return [...work.values()];
}

/**
 * Writes what a provider (or the text itself) gave: rows { hash, language, text, status, origin,
 * error, attempts, retryAt }. What an administrator wrote is never overwritten.
 */
export async function contentSave(ctx, rows, sources, now) {
  await ctx.inTransaction(async connection => {
    for (const row of rows) {
      await connection.execute(
        `UPDATE content_translations
               SET text = ?, status = ?, origin = ?, error = ?, attempts = ?, retry_at = ?, updated_at = ?
               WHERE hash = ? AND language = ? AND NOT (origin = 'manual' AND status = 'ok')`,
        [
          row.text ?? null,
          row.status,
          row.origin,
          row.error ? String(row.error).slice(0, 160) : null,
          row.attempts,
          row.retryAt,
          now,
          row.hash,
          row.language
        ]
      );
    }
    for (const [hash, language] of Object.entries(sources ?? {})) {
      await connection.execute(
        "UPDATE content_texts SET source_language = ? WHERE hash = ? AND source_language IS NULL",
        [language, hash]
      );
    }
  });
}

/** What the pages need in a language: { "text as typed": "its translation" } (only what differs). */
export async function contentDictionary(ctx, language) {
  const [rows] = await ctx.pool.query(
    `SELECT t.text AS source, c.text AS text
           FROM content_translations c JOIN content_texts t ON t.hash = c.hash
           WHERE c.language = ? AND c.status = 'ok' AND c.text IS NOT NULL`,
    [language]
  );
  const words = {};
  for (const row of rows) {
    if (row.text !== row.source) {
      words[row.source] = row.text;
    }
  }
  return words;
}

/** Changes whenever the translations of a language do: for the cache of the pages. */
export async function contentVersion(ctx, language) {
  const [[row]] = await ctx.pool.query(
    "SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS at FROM content_translations WHERE language = ? AND status = 'ok'",
    [language]
  );
  return `${row.n}-${row.at}`;
}

/** Counts for the administration: texts, rows by state, and the waiting and failed ones by language. */
export async function contentStatus(ctx, wanted = null) {
  const [[texts]] = await ctx.pool.query("SELECT COUNT(*) AS n FROM content_texts");
  const [rows] = await ctx.pool.query(
    "SELECT language, status, origin, COUNT(*) AS n FROM content_translations GROUP BY language, status, origin"
  );
  const total = { ok: 0, pending: 0, failed: 0, manual: 0 };
  const languages = {};
  for (const row of rows) {
    const count = Number(row.n);
    const entry = (languages[row.language] ??= { ok: 0, pending: 0, failed: 0, manual: 0 });
    entry[row.status] += count;
    // the totals are about the languages that are asked for: the rows of the others are not worked
    const counted = !wanted || wanted.includes(row.language);
    if (counted) {
      total[row.status] += count;
    }
    if (row.status === "ok" && row.origin === "manual") {
      entry.manual += count;
      if (counted) {
        total.manual += count;
      }
    }
  }
  return { texts: Number(texts.n), total, languages };
}

/** The languages somebody asked for: the ones that are translated. */
export async function contentLanguages(ctx) {
  const [rows] = await ctx.pool.query(
    "SELECT language FROM translation_languages ORDER BY first_wanted_at, language"
  );
  return rows.map(row => row.language);
}

/** Asks for a language. True when it was not asked for before. */
export async function contentWant(ctx, language, now) {
  const [result] = await ctx.pool.execute(
    "INSERT IGNORE INTO translation_languages (language, first_wanted_at) VALUES (?, ?)",
    [language, now]
  );
  return result.affectedRows > 0;
}

/** The texts of a language for the page that reviews them: { rows, total }. */
export async function contentList(
  ctx,
  { language, search = "", state = "", offset = 0, limit = 50 }
) {
  const where = ["c.language = ?"];
  const params = [language];
  if (state === "failed") {
    where.push("c.status = 'failed'");
  } else if (state === "pending") {
    where.push("c.status = 'pending'");
  } else if (state === "manual") {
    where.push("c.status = 'ok' AND c.origin = 'manual'");
  } else if (state === "machine") {
    where.push("c.status = 'ok' AND c.origin = 'machine'");
  }
  if (search) {
    where.push("(t.text LIKE ? OR c.text LIKE ?)");
    const like = `%${search.replace(/[\\%_]/g, match => `\\${match}`)}%`;
    params.push(like, like);
  }
  const [[count]] = await ctx.pool.query(
    `SELECT COUNT(*) AS n FROM content_translations c JOIN content_texts t ON t.hash = c.hash WHERE ${where.join(" AND ")}`,
    params
  );
  const [rows] = await ctx.pool.query(
    `SELECT t.hash, t.text AS source, t.kind, t.source_language, c.language, c.text, c.status, c.origin, c.error, c.attempts, c.updated_at
           FROM content_translations c JOIN content_texts t ON t.hash = c.hash
           WHERE ${where.join(" AND ")}
           ORDER BY (c.status = 'failed') DESC, (c.status = 'pending') DESC, t.kind, t.text
           LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return {
    total: Number(count.n),
    rows: rows.map(row => ({
      hash: row.hash,
      source: row.source,
      kind: row.kind,
      sourceLanguage: row.source_language,
      language: row.language,
      text: row.text,
      status: row.status,
      origin: row.origin,
      error: row.error,
      attempts: Number(row.attempts),
      updatedAt: Number(row.updated_at)
    }))
  };
}

const CHUNK = 300;

const chunks = list => {
  const parts = [];
  for (let at = 0; at < list.length; at += CHUNK) {
    parts.push(list.slice(at, at + CHUNK));
  }
  return parts;
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  contentLock,
  contentSync,
  contentWork,
  contentSave,
  contentDictionary,
  contentVersion,
  contentStatus,
  contentLanguages,
  contentWant,
  contentList
};
