import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { describeError, tooMany } from "../errors.js";

const MINUTE = 60 * 1000;

// name -> { windowMs, limit }. Keyed by client IP (set `trust proxy` behind a reverse proxy).
const RATE_LIMITS = {
  auth: { windowMs: 15 * MINUTE, limit: 30 },
  login: { windowMs: 15 * MINUTE, limit: 12 },
  register: { windowMs: 60 * MINUTE, limit: 8 },
  // the contact form: a few messages an hour from one address
  contact: { windowMs: 60 * MINUTE, limit: 5 },
  mfa: { windowMs: 15 * MINUTE, limit: 30 },
  createSeries: { windowMs: 60 * MINUTE, limit: 60 },
  join: { windowMs: 15 * MINUTE, limit: 30 },
  draftAction: { windowMs: MINUTE, limit: 180 },
  import: { windowMs: 60 * MINUTE, limit: 20 },
  export: { windowMs: 60 * MINUTE, limit: 30 },
  rosterSync: { windowMs: 60 * MINUTE, limit: 6 },
  share: { windowMs: 60 * MINUTE, limit: 60 },
  media: { windowMs: MINUTE, limit: 1200 },
  write: { windowMs: MINUTE, limit: 240 },
  // what one API key may read in a minute (the key is counted, not the address: many keys can share one)
  apiKey: { windowMs: MINUTE, limit: 120 },
  // refused keys per address: the gateway counts each refusal (a call that works is never counted)
  apiFailures: { windowMs: 15 * MINUTE, limit: 60 }
};

// The limiters that count something else than the address of the client.
const COUNTED_BY = {
  apiKey: request => request.apiKey?.id ?? ipKeyGenerator(request.ip)
};

/** Builds one middleware per limiter; all are no-ops when `enabled` is false (tests). */
export function createLimiters({ enabled = true, overrides = {} } = {}) {
  const limiters = {};
  for (const [name, defaults] of Object.entries(RATE_LIMITS)) {
    const { windowMs, limit } = { ...defaults, ...(overrides[name] || {}) };
    limiters[name] = enabled
      ? rateLimit({
          windowMs,
          limit,
          ...(COUNTED_BY[name] ? { keyGenerator: COUNTED_BY[name] } : {}),
          standardHeaders: "draft-7",
          legacyHeaders: false,
          handler: (request, response, _next, options) => {
            const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
            response.setHeader("Retry-After", String(retryAfterSeconds));
            const { status, body } = describeError(
              tooMany("Too many requests. Slow down and retry shortly.", retryAfterSeconds),
              request.language
            );
            response.status(status).json(body);
          }
        })
      : (_request, _response, next) => next();
  }
  return limiters;
}
