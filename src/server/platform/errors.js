import { format } from "../../shared/i18n.js";
import { tr } from "./server-i18n.js";

// Every message is an English template ("{label} must be a string.") plus its values. `message`
// keeps the formatted English text for logs and tests; the client receives it in the language of
// the request (see describeError).

/** Marks a text as translatable without throwing (the collector in scripts/i18n/keys.mjs lists it). */
export const message = text => text;

/** Error whose message is safe to show to the client. */
export class HttpError extends Error {
  constructor(status, code, template, extra = {}, params = extra) {
    super(format(template, params));
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.extra = extra;
    this.template = template;
    this.params = params;
  }
}

/** Rule violation raised by the pure domain layer (draft, series). Maps to HTTP 400. */
export class DomainError extends Error {
  constructor(template, params = {}) {
    super(format(template, params));
    this.name = "DomainError";
    this.template = template;
    this.params = params;
  }
}

export const badRequest = (message, code = "bad_request", params = {}) =>
  new HttpError(400, code, message, {}, params);
export const unauthorized = (message = "Sign in to continue.", params = {}) =>
  new HttpError(401, "unauthorized", message, {}, params);
export const forbidden = (
  message = "You are not allowed to do this.",
  code = "forbidden",
  params = {}
) => new HttpError(403, code, message, {}, params);
export const notFound = (message = "Not found.", params = {}) =>
  new HttpError(404, "not_found", message, {}, params);
export const conflict = (message, code = "conflict", params = {}) =>
  new HttpError(409, code, message, {}, params);
export const tooMany = (message, retryAfterSeconds, params = {}) =>
  new HttpError(
    429,
    "rate_limited",
    message,
    { retryAfterSeconds },
    { retryAfterSeconds, ...params }
  );

/** A weak password: several issues, each translated on its own. */
export const weakPassword = issues =>
  Object.assign(
    badRequest(
      issues.map(({ template, params }) => format(template, params)).join(" "),
      "weak_password"
    ),
    { parts: issues }
  );

const CLIENT_MESSAGES = {
  400: message("Bad request."),
  404: message("Not found."),
  405: message("Method not allowed."),
  413: message("The request body is too large."),
  414: message("The URL is too long."),
  415: message("Unsupported media type."),
  431: message("Request headers are too large.")
};

/**
 * Turns any thrown value into `{ status, body }` without leaking internals; the message is in
 * `language`.
 */
export function describeError(error, language = "en") {
  const say = (template, params) => tr(language, template, params);
  if (error instanceof HttpError) {
    const text = error.parts
      ? error.parts.map(({ template, params }) => say(template, params)).join(" ")
      : say(error.template, error.params);
    return {
      status: error.status,
      body: {
        error: error.seriesNumber
          ? say("Series {number}: {message}", { number: error.seriesNumber, message: text })
          : text,
        code: error.code,
        ...error.extra
      }
    };
  }
  if (error instanceof DomainError) {
    return {
      status: 400,
      body: { error: say(error.template, error.params), code: "rule_violation" }
    };
  }
  if (error?.type === "entity.parse.failed") {
    return {
      status: 400,
      body: { error: say("The request body is not valid JSON."), code: "invalid_json" }
    };
  }
  if (error?.type === "entity.too.large") {
    return {
      status: 413,
      body: { error: say("The request body is too large."), code: "payload_too_large" }
    };
  }
  if (error instanceof URIError || /Failed to decode param/i.test(error?.message ?? "")) {
    return { status: 400, body: { error: say("The URL is not valid."), code: "invalid_url" } };
  }
  // Other client errors raised by Express/body-parser (415, 431, ...) keep their status but never
  // their message.
  const clientStatus = error?.statusCode ?? error?.status;
  if (Number.isInteger(clientStatus) && clientStatus >= 400 && clientStatus < 500) {
    return {
      status: clientStatus,
      body: {
        error: say(CLIENT_MESSAGES[clientStatus] ?? "The request could not be processed."),
        code: "bad_request"
      }
    };
  }
  return { status: 500, body: { error: say("Internal server error."), code: "internal_error" } };
}
