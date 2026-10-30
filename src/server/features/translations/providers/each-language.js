import { matchLanguage } from "../../../../shared/i18n.js";
import { ProviderError } from "./http.js";

/** The failures that stop a service for a while but spoil nothing that was already done. */
const PAUSES = new Set(["rate", "quota", "unavailable"]);

/**
 * What the providers that translate into one language per request share. `call(language, texts)`
 * gives { texts: [translation of each], sources: [language detected for each, or null] }.
 *
 * The first language is asked alone: its answer says which language each text is written in, and a
 * text is never translated into its own language (that would be paid for and give the same text).
 * The others are asked `concurrency` at a time. A language the service does not know (a refused
 * request) fails for every text of the batch and does not stop the others.
 *
 * When the service stops half-way (too many requests, quota used up, not available) after some
 * languages were done, what was done is returned and kept: `results.done` is the set of languages that
 * have their answer, `results.interrupted` the error that stopped the rest. When nothing was done, or
 * when the key was refused, or an answer was unusable, the call fails with the error.
 */
export async function translateEachLanguage({ items, languages, call, concurrency = 1 }) {
  const results = new Map(items.map(item => [item.hash, { source: null, texts: {}, failed: {} }]));
  const done = new Set();

  async function one(language) {
    const wanted = items.filter(item => results.get(item.hash).source !== language);
    for (const item of items) {
      if (results.get(item.hash).source === language) {
        results.get(item.hash).texts[language] = item.text;
      }
    }
    if (!wanted.length) {
      done.add(language);
      return;
    }
    let answer;
    try {
      answer = await call(
        language,
        wanted.map(item => item.text)
      );
    } catch (error) {
      if (error instanceof ProviderError && error.kind === "bad-request") {
        for (const item of wanted) {
          results.get(item.hash).failed[language] = error.message;
        }
        done.add(language);
        return;
      }
      throw error;
    }
    if (!Array.isArray(answer?.texts) || answer.texts.length !== wanted.length) {
      throw new ProviderError("bad-answer", "The service did not answer for every text.");
    }
    wanted.forEach((item, index) => {
      const result = results.get(item.hash);
      result.texts[language] = answer.texts[index];
      const detected = answer.sources?.[index];
      if (!result.source && typeof detected === "string") {
        result.source = matchLanguage(detected);
      }
    });
    done.add(language);
  }

  const [first, ...rest] = languages;
  if (first) {
    await one(first);
  }
  let interrupted = null;
  let failure = null;
  const queue = [...rest];
  const worker = async () => {
    while (!interrupted && !failure && queue.length) {
      try {
        await one(queue.shift());
      } catch (error) {
        if (error instanceof ProviderError && PAUSES.has(error.kind)) {
          interrupted ??= error;
        } else {
          failure ??= error;
        }
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), queue.length) }, worker)
  );
  if (failure) {
    throw failure;
  }
  results.done = done;
  if (interrupted) {
    results.interrupted = interrupted;
  }
  return results;
}
