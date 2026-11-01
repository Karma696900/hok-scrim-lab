// The link with the bots server (bots.hok-scrim-lab.com, private repository hok-bots), where the Game Simulation
// and the bots API run. The site and that server share one secret: the site signs with it the ticket of a live game
// (HMAC-SHA256, 60 seconds, used once: the bots server reads it with the same format, its src/service/tickets.js),
// and the bots server sends it back in `x-bots-secret` when it asks the site about an API key or hands it the end
// of a game. Read from the environment here (BOTS_URL, BOTS_SHARED_SECRET_FILE or BOTS_SHARED_SECRET): without
// them the link is off and the page says the games are not open.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const MIN_SECRET = 32;
const TICKET_MS = 60_000;

function secretOf(env) {
  if (env.BOTS_SHARED_SECRET_FILE) {
    try {
      return readFileSync(env.BOTS_SHARED_SECRET_FILE, "utf8").trim();
    } catch {
      return "";
    }
  }
  return (env.BOTS_SHARED_SECRET ?? "").trim();
}

/** `{ url, socketOrigin, ticketFor(payload, now), secretMatches(given) }`, or null when the link is not set. */
export function botsLinkFrom(env = process.env) {
  const secret = secretOf(env);
  if (!env.BOTS_URL || secret.length < MIN_SECRET) {
    return null;
  }
  const url = env.BOTS_URL.replace(/\/+$/, "");
  const expected = Buffer.from(secret);
  return {
    url,
    socketOrigin: url.replace(/^http/, "ws"),
    ticketFor(payload, now = Date.now()) {
      const body = Buffer.from(
        JSON.stringify({ ...payload, nonce: randomUUID(), exp: now + TICKET_MS })
      ).toString("base64url");
      return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
    },
    secretMatches(given) {
      if (typeof given !== "string") {
        return false;
      }
      const offered = Buffer.from(given);
      return offered.length === expected.length && timingSafeEqual(offered, expected);
    }
  };
}

/** The bots server's socket origin for the CSP `connect-src`, or none when the link is not set. */
export function botsSockets(env = process.env) {
  const link = botsLinkFrom(env);
  return link ? [link.socketOrigin] : [];
}
