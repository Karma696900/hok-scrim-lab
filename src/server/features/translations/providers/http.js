// What every translation provider shares: the error it can raise and how one request is sent. The
// request never logs its headers (they hold the key) and an answer that is not understood is an
// error of the provider, never of the site.

/**
 * A provider failed. `kind` says what to do about it:
 *   auth         the key was refused: nothing is tried again until the key is changed
 *   quota        the quota of the account is used up: nothing is sent until it is renewed
 *   rate         too many requests: wait `retryAfterMs`
 *   unavailable  the service did not answer in time, or is down: try again later
 *   bad-answer   the answer could not be used: ask again with fewer texts
 *   bad-request  the service refused the request itself
 */
export class ProviderError extends Error {
  constructor(kind, message, { retryAfterMs = 0 } = {}) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

/** A few words of what the service said, for the administrator (never the request, never a key). */
function reasonOf(body) {
  const message = body?.error?.message ?? body?.message ?? body?.error ?? "";
  return typeof message === "string" ? message.replace(/\s+/g, " ").slice(0, 140) : "";
}

/** The seconds in a Retry-After header, as milliseconds (0 when there is none). */
function retryAfter(headers) {
  const seconds = Number(headers?.get?.("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) * 1000 : 0;
}

/**
 * Sends one request and returns the parsed JSON answer. A 401 or 403 is `auth`, a 456 is `quota`, a
 * 429 is `rate`, a 5xx or a network failure is `unavailable`, any other refusal is `bad-request`
 * (with the service's own words).
 */
async function requestJson(fetchImpl, url, { method, headers, body, timeoutMs = 60_000 }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new ProviderError(
      "unavailable",
      error?.name === "TimeoutError"
        ? "The service did not answer in time."
        : "The service cannot be reached."
    );
  }
  const text = await response.text().catch(() => "");
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (response.ok) {
    if (json === null) {
      throw new ProviderError("bad-answer", "The service did not answer with JSON.");
    }
    return json;
  }
  const why = reasonOf(json);
  if (response.status === 401 || response.status === 403) {
    throw new ProviderError("auth", `The service refused the key${why ? `: ${why}` : "."}`);
  }
  if (response.status === 456) {
    throw new ProviderError(
      "quota",
      `The quota of the account is used up${why ? `: ${why}` : "."}`
    );
  }
  if (response.status === 429) {
    throw new ProviderError("rate", `The service asks to slow down${why ? `: ${why}` : "."}`, {
      retryAfterMs: retryAfter(response.headers) || 60_000
    });
  }
  if (response.status === 408 || response.status >= 500) {
    throw new ProviderError("unavailable", `The service is not available (${response.status}).`, {
      retryAfterMs: retryAfter(response.headers)
    });
  }
  throw new ProviderError(
    "bad-request",
    `The service refused the request (${response.status})${why ? `: ${why}` : "."}`
  );
}

/** POSTs JSON and returns the parsed answer. */
export const postJson = (fetchImpl, url, { headers, body, timeoutMs }) =>
  requestJson(fetchImpl, url, { method: "POST", headers, body: body ?? {}, timeoutMs });

/** GETs JSON and returns the parsed answer. */
export const getJson = (fetchImpl, url, { headers, timeoutMs }) =>
  requestJson(fetchImpl, url, { method: "GET", headers, timeoutMs });

/** The JSON object in a model's answer, with or without a code fence around it; null if there is none. */
export function objectIn(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
