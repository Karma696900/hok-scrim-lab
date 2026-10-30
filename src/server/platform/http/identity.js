import { createHash, randomBytes } from "node:crypto";

const DAY = 24 * 60 * 60 * 1000;
const SESSION_POLICY = {
  user: { idleMs: 14 * DAY, absoluteMs: 30 * DAY },
  guest: { idleMs: 180 * DAY, absoluteMs: 365 * DAY }
};
const REFRESH_AFTER_MS = 60 * 60 * 1000;

export const hashToken = token => createHash("sha256").update(token).digest("hex");

export function readCookies(request) {
  const cookies = {};
  for (const part of String(request.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    if (!key) {
      continue;
    }
    try {
      cookies[key] = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      cookies[key] = "";
    }
  }
  return cookies;
}

/**
 * Cookie-based identity. A visitor is either a Google user or an anonymous guest (random 256-bit
 * token, stored hashed, owning their own data until they sign in).
 */
export function createIdentity({ store, config }) {
  // __Host- needs Secure, so it is only used when cookies are Secure (production by default).
  const name = base => (config.cookieSecure ? `__Host-${base}` : base);
  const names = {
    session: name("hok_session"),
    state: name("hok_oauth_state"),
    returnTo: name("hok_oauth_return"),
    pkce: name("hok_oauth_pkce"),
    challenge: name("hok_challenge"),
    discord: name("hok_discord_state"),
    discordBot: name("hok_discord_bot")
  };

  function setCookie(response, cookieName, value, maxAgeSeconds) {
    response.append(
      "Set-Cookie",
      `${cookieName}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${config.cookieSecure ? "; Secure" : ""}`
    );
  }
  const clearCookie = (response, cookieName) => setCookie(response, cookieName, "", 0);

  const expiryFor = (user, createdAt, now) => {
    const policy = user.isGuest ? SESSION_POLICY.guest : SESSION_POLICY.user;
    return Math.min(now + policy.idleMs, createdAt + policy.absoluteMs);
  };

  function withAdminFlag(user) {
    // Only a VERIFIED email can be an administrator (local accounts are unverified unless created
    // with the CLI).
    const isAdmin =
      !user.isGuest &&
      user.emailVerified === true &&
      config.adminEmails.has(String(user.email).toLowerCase());
    return {
      ...user,
      isAdmin,
      // What the site itself shows (recommended builds, official ratings): the administrators, and
      // the people they gave the label to (see shared/access-rules.js).
      isEditor: isAdmin || (!user.isGuest && user.isContributor === true)
    };
  }

  /**
   * Loads request.user and slides the session expiry (at most once an hour, never past the absolute
   * limit).
   */
  async function middleware(request, response, next) {
    try {
      request.user = null;
      // the public API reads a key, never a cookie (see features/api-keys/gateway.js)
      if (request.path === "/api/v1" || request.path.startsWith("/api/v1/")) {
        return next();
      }
      const token = readCookies(request)[names.session];
      if (!token) {
        return next();
      }
      const tokenHash = hashToken(token);
      const session = await store.getSession(tokenHash);
      if (!session) {
        clearCookie(response, names.session);
        return next();
      }
      request.user = withAdminFlag(session.user);
      request.sessionTokenHash = tokenHash;
      const now = Date.now();
      if (now - session.lastSeenAt > REFRESH_AFTER_MS) {
        const expiresAt = expiryFor(session.user, session.createdAt, now);
        await store.refreshSession(tokenHash, expiresAt, now);
        setCookie(response, names.session, token, Math.floor((expiresAt - now) / 1000));
      }
      next();
    } catch (error) {
      next(error);
    }
  }

  /** Creates a fresh session (new random token each time = rotation) and sets the cookie. */
  async function startSession(response, user) {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    const expiresAt = expiryFor(user, now, now);
    await store.createSession(hashToken(token), user.id, expiresAt, now);
    setCookie(response, names.session, token, Math.floor((expiresAt - now) / 1000));
  }

  /** Returns the current user, creating an anonymous guest identity if there is none yet. */
  async function ensureUser(request, response) {
    if (request.user) {
      return request.user;
    }
    const guest = await store.createGuestUser();
    await startSession(response, guest);
    request.user = withAdminFlag(guest);
    return request.user;
  }

  return {
    names,
    middleware,
    startSession,
    ensureUser,
    setCookie,
    clearCookie,
    readCookies,
    withAdminFlag
  };
}
