// translation service, pause: pause, pauseForQuota, readQuota, wantedNow, and 4 more.
import {
  afterFailure,
  allowanceOf,
  charsOf,
  checkTranslation,
  dayOf,
  msUntilTomorrow,
  planBatches,
  sourceLanguageOf
} from "./translation-domain.js";
import { wording } from "./translation-service-shared.js";

export const pause = (ctx, ms, reason) => {
  ctx.state.pausedUntil = ctx.now() + ms;
  ctx.state.pauseReason = reason;
};

/** The quota is used up: nothing is sent until the period ends, when the account says when, else until tomorrow. */
export const pauseForQuota = ctx => {
  const end = ctx.state.quota?.resetsAt;
  ctx.pause(end && end > ctx.now() ? end - ctx.now() : msUntilTomorrow(ctx.now()), "quota");
};

/** What the account of the provider says about its quota (asked again when it was read long ago). */
export async function readQuota(ctx, maxAgeMs = QUOTA_FRESH_MS) {
  if (!ctx.provider?.usage) {
    return null;
  }
  if (ctx.state.quota && ctx.now() - ctx.state.quota.checkedAt < maxAgeMs) {
    return ctx.state.quota;
  }
  try {
    ctx.state.quota = { ...(await ctx.provider.usage()), checkedAt: ctx.now() };
  } catch (error) {
    if (error?.kind === "auth") {
      ctx.state.lastError = wording(error);
      ctx.state.refused = ctx.state.lastError;
    } else {
      ctx.logger?.warn?.("translation quota not read", { message: error?.message });
    }
  }
  return ctx.state.quota;
}

/** The languages that are asked for, among those of the site. */
export const wantedNow = async ctx => {
  const wanted = new Set(await ctx.store.contentLanguages());
  return ctx.languages.filter(code => wanted.has(code));
};

/** Rows for texts that could not be translated: tried again later, a little further each time. */
export const failedRows = (ctx, batch, reason) =>
  batch.items.flatMap(item =>
    batch.languages.map(language => ({
      hash: item.hash,
      language,
      text: null,
      status: "failed",
      origin: "machine",
      error: reason,
      ...afterFailure(item.attempts?.[language] ?? 0, ctx.now())
    }))
  );

/** What a failure of the provider means for the round. Always false: the round stops. */
export function react(ctx, error, result) {
  ctx.state.lastError = wording(error);
  if (error?.kind === "auth") {
    ctx.state.refused = ctx.state.lastError;
    result.stopped = "refused";
  } else if (error?.kind === "quota") {
    ctx.pauseForQuota();
    result.stopped = "quota";
  } else if (error?.kind === "rate") {
    ctx.pause(error.retryAfterMs || 60_000, "slow down");
    result.stopped = "paused";
  } else {
    // the service does not answer: nothing is lost, the rows stay as they were
    ctx.state.failures += 1;
    if (ctx.state.failures >= 3) {
      ctx.pause(Math.min(3_600_000, 600_000 * 2 ** (ctx.state.failures - 3)), "unavailable");
    }
    result.stopped = "unavailable";
  }
  return false;
}

/**
 * Asks the provider for a batch and writes the answers. A batch whose answer was unusable is
 * cut in two (so one text cannot spoil the others). When the provider stopped half-way what it
 * did is written and the rest is left for later. False when the round must stop.
 */
export async function translateBatch(ctx, batch, result, budget) {
  let answers;
  try {
    answers = await ctx.provider.translate({ items: batch.items, languages: batch.languages });
  } catch (error) {
    if (error?.kind === "bad-answer" && batch.items.length > 1) {
      ctx.state.lastError = wording(error);
      const middle = Math.ceil(batch.items.length / 2);
      for (const items of [batch.items.slice(0, middle), batch.items.slice(middle)]) {
        if (!(await ctx.translateBatch({ languages: batch.languages, items }, result, budget))) {
          return false;
        }
      }
      return true;
    }
    if (error?.kind === "bad-answer" || error?.kind === "bad-request") {
      ctx.state.lastError = wording(error);
      const rows = ctx.failedRows(batch, ctx.state.lastError);
      await ctx.store.contentSave(rows, {}, ctx.now());
      result.failed += rows.length;
      return true;
    }
    return ctx.react(error, result);
  }
  ctx.state.failures = 0;
  // a provider that stopped half-way says which languages it finished
  const finished = answers.done
    ? batch.languages.filter(language => answers.done.has(language))
    : batch.languages;
  const spent = batch.items.reduce((sum, item) => sum + item.text.length * finished.length, 0);
  await ctx.store.contentAddUsage(dayOf(ctx.now()), spent);
  budget.left -= spent;

  const rows = [];
  const sources = {};
  for (const item of batch.items) {
    const answer = answers.get(item.hash) ?? { source: null, texts: {}, failed: {} };
    const source = sourceLanguageOf(answer.source) ?? item.sourceLanguage ?? null;
    if (source) {
      sources[item.hash] = source;
    }
    for (const language of finished) {
      if (source === language) {
        rows.push({
          hash: item.hash,
          language,
          text: item.text,
          status: "ok",
          origin: "source",
          error: null,
          attempts: 0,
          retryAt: 0
        });
        result.translated += 1;
        continue;
      }
      const given = answer.texts?.[language];
      const checked =
        typeof given === "string"
          ? checkTranslation(item.text, given)
          : { ok: false, reason: answer.failed?.[language] ?? "missing from the answer" };
      if (checked.ok) {
        rows.push({
          hash: item.hash,
          language,
          text: checked.text,
          status: "ok",
          origin: "machine",
          error: null,
          attempts: 0,
          retryAt: 0
        });
        result.translated += 1;
      } else {
        rows.push({
          hash: item.hash,
          language,
          text: null,
          status: "failed",
          origin: "machine",
          error: checked.reason,
          ...afterFailure(item.attempts?.[language] ?? 0, ctx.now())
        });
        result.failed += 1;
      }
    }
  }
  await ctx.store.contentSave(rows, sources, ctx.now());
  return answers.interrupted ? ctx.react(answers.interrupted, result) : true;
}

/** One pass over what is waited for. False when there is nothing more to do now. */
export async function pass(ctx, result, wanted, budget) {
  const work = await ctx.store.contentWork(ctx.now(), WORK_LIMIT, wanted);
  result.texts += work.length;
  if (!work.length) {
    return false;
  }
  // a text whose own language is known needs nothing for that language
  const own = [];
  const todo = [];
  for (const entry of work) {
    const rest = entry.languages.filter(language => language !== entry.sourceLanguage);
    if (rest.length !== entry.languages.length) {
      own.push({
        hash: entry.hash,
        language: entry.sourceLanguage,
        text: entry.text,
        status: "ok",
        origin: "source",
        error: null,
        attempts: 0,
        retryAt: 0
      });
    }
    if (rest.length) {
      todo.push({ ...entry, languages: rest });
    }
  }
  if (own.length) {
    await ctx.store.contentSave(own, {}, ctx.now());
    result.translated += own.length;
  }
  for (const batch of planBatches(todo, ctx.provider.limits)) {
    if (budget.left === null) {
      // asked once, when there is something to send
      budget.left = allowanceOf(await ctx.readQuota());
      if (ctx.state.refused) {
        result.stopped = "refused";
        return false;
      }
    }
    const cost = charsOf(batch);
    if (cost > budget.left) {
      result.stopped = "quota";
      ctx.pauseForQuota();
      return false;
    }
    if (
      ctx.dailyChars !== null &&
      (await ctx.store.contentUsage(dayOf(ctx.now()))) + cost > ctx.dailyChars
    ) {
      result.stopped = "limit";
      ctx.pause(msUntilTomorrow(ctx.now()), "daily limit");
      return false;
    }
    if (!(await ctx.translateBatch(batch, result, budget))) {
      return false;
    }
  }
  return work.length >= WORK_LIMIT || own.length > 0;
}

// The translator of the site. Every few minutes (and a moment after the staff saved something) it
// reads the texts that the staff wrote, makes sure each is kept for every language that is asked for,
// asks the provider for the ones that are missing, checks what came back and writes it. A language
// is asked for when a visitor reads the site in it (or an administrator asks for it): nothing is sent
// for a language nobody uses. The pages never wait for it: until a translation exists the text is
// shown as it was typed.
//
// What keeps it safe: one process works at a time (a database lock); what is sent never goes beyond
// what the account of the provider has left (read from the provider when it can say), nor beyond a
// daily limit when the owner wrote one; a pause when the provider is down or asks to slow down;
// nothing more is tried when the key is refused; a translation with other numbers than its source
// is refused; and what an administrator wrote by hand is never replaced.

const WORK_LIMIT = 600;

/** What an account said about its quota is kept this long (the administration asks at every look). */
const QUOTA_FRESH_MS = 30_000;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  pause,
  pauseForQuota,
  readQuota,
  wantedNow,
  failedRows,
  react,
  translateBatch,
  pass
};
