import { randomUUID } from "node:crypto";
import { forbidden } from "../errors.js";
import { PRERENDER_HEADER } from "./prerender-parts.js";

// Images: Camp portraits, Google avatars, and data: URIs for the bundled lane icons. Fonts are
// self-hosted. No inline script or style is allowed.
/**
 * `styleHashes` / `scriptHashes`: SHA-256 hashes of the one inline <style> (critical CSS) and the
 * one inline <script> (boot loader) the server itself writes. Nothing else inline is allowed.
 */
export const contentSecurityPolicy = (styleHashes = [], scriptHashes = [], connectSources = []) =>
  [
    "default-src 'self'",
    `script-src 'self'${scriptHashes.map(hash => ` '${hash}'`).join("")}`,
    `style-src 'self'${styleHashes.map(hash => ` '${hash}'`).join("")}`,
    "img-src 'self' data: https://camp.honorofkings.com https://*.googleusercontent.com",
    "font-src 'self'",
    "media-src 'self' https://res.sgameglobal.com https://camp.honorofkings.com",
    `connect-src 'self'${connectSources.map(source => ` ${source}`).join("")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join("; ");

/**
 * In production (cookies are Secure) a plain-http request is sent to the same address over https, for good (308 keeps the
 * method), before anything else answers. The health checks stay on http: the balancer asks them from inside, and so
 * does the page renderer (http://127.0.0.1:<port>, no proxy in between) with the secret it keeps (prerender.js): without
 * that exception it would be sent to https, fail, and the first screen would never be drawn by the server.
 */
export function enforceHttps(enabled, prerender = null) {
  return (request, response, next) => {
    const renderer =
      Boolean(prerender?.token) && request.headers[PRERENDER_HEADER] === prerender.token;
    if (!enabled || request.secure || renderer || request.path.startsWith("/api/health")) {
      return next();
    }
    return response.redirect(308, `https://${request.get("host")}${request.originalUrl}`);
  };
}

/** `connectSources`: other origins the pages may open a connection to (the bots server's live games). */
export function securityHeaders({
  hsts = false,
  styleHashes = [],
  scriptHashes = [],
  connectSources = []
} = {}) {
  const policy = contentSecurityPolicy(styleHashes, scriptHashes, connectSources);
  return (_request, response, next) => {
    response.setHeader("Content-Security-Policy", policy);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY"); // the same as the CSP frame-ancestors, for the browsers that only know this one
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
    );
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    if (hsts) {
      response.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    next();
  };
}

export function requestContext(logger) {
  return (request, response, next) => {
    request.id = randomUUID();
    response.setHeader("X-Request-Id", request.id);
    const started = process.hrtime.bigint();
    response.on("finish", () => {
      if (!request.path.startsWith("/api") && !request.path.startsWith("/auth")) {
        return;
      }
      logger.info("request", {
        id: request.id,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        ms: Number(process.hrtime.bigint() - started) / 1e6
      });
    });
    next();
  };
}

export function noStoreForApi(request, response, next) {
  if (request.path.startsWith("/api") || request.path.startsWith("/auth")) {
    response.setHeader("Cache-Control", "no-store");
  }
  next();
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence in depth on top of SameSite=Lax cookies: state-changing requests that a browser
 * marks as cross-site (Sec-Fetch-Site) or that carry a foreign Origin are refused. Requests without
 * either header (curl, server-to-server) carry no ambient browser cookies.
 */
export function sameOriginOnly({ appOrigin = null } = {}) {
  return (request, _response, next) => {
    if (SAFE_METHODS.has(request.method)) {
      return next();
    }
    const site = request.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") {
      return next(forbidden("Cross-site requests are not allowed.", "cross_site"));
    }
    const origin = request.get("origin");
    if (origin) {
      let originHost = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        /* "null" or malformed */
      }
      const expected = appOrigin ? new URL(appOrigin).host : request.host;
      if (!originHost || originHost !== expected) {
        return next(forbidden("Cross-origin requests are not allowed.", "cross_origin"));
      }
    }
    next();
  };
}
