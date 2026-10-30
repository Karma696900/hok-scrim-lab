import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { sessionView } from "./session-view.js";

/** Accepts only same-site absolute paths; anything else becomes "/". Parsed, not prefix-matched. */
export function safeReturnPath(value) {
  if (
    typeof value !== "string" ||
    value.length > 1000 ||
    !value.startsWith("/") ||
    /[\\\u0000-\u001f]/.test(value)
  ) {
    return "/";
  }
  try {
    const parsed = new URL(value, "http://return.invalid");
    if (parsed.origin !== "http://return.invalid") {
      return "/";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

const base64url = buffer => buffer.toString("base64url");

/** The address on Google where the person is sent to sign in (PKCE: only the hash of the verifier travels). */
function authorizationUrl(config, state, verifier) {
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.search = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    code_challenge: base64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256"
  }).toString();
  return authorization.toString();
}

export function createGoogleAuthRouter({ store, config, identity, limiter, logger, auth }) {
  const router = Router();
  const { names } = identity;
  const enabled = config.google.enabled;

  router.get("/api/auth/me", (request, response) => {
    response.json(sessionView(request, config));
  });

  router.get("/auth/google", limiter, (request, response) => {
    if (!enabled) {
      return response
        .status(503)
        .send("Google sign-in is not configured. Set the Google OAuth variables in .env.");
    }
    const state = base64url(randomBytes(24));
    const verifier = base64url(randomBytes(32));
    identity.setCookie(response, names.state, state, 600);
    identity.setCookie(response, names.pkce, verifier, 600);
    identity.setCookie(response, names.returnTo, safeReturnPath(request.query.returnTo), 600);
    response.redirect(authorizationUrl(config, state, verifier));
  });

  router.get("/auth/google/callback", limiter, async (request, response) => {
    const cookies = identity.readCookies(request);
    const suppliedState = String(request.query.state || "");
    const expectedState = cookies[names.state] || "";
    const verifier = cookies[names.pkce] || "";
    for (const cookie of [names.state, names.pkce]) {
      identity.clearCookie(response, cookie);
    }
    if (
      !enabled ||
      request.query.error ||
      !suppliedState ||
      !expectedState ||
      !verifier ||
      Buffer.byteLength(suppliedState) !== Buffer.byteLength(expectedState) ||
      !timingSafeEqual(Buffer.from(suppliedState), Buffer.from(expectedState))
    ) {
      identity.clearCookie(response, names.returnTo);
      return response
        .status(400)
        .send("Google sign-in could not be verified. Start again from the app.");
    }

    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: String(request.query.code || ""),
          client_id: config.google.clientId,
          client_secret: config.google.clientSecret,
          redirect_uri: config.google.redirectUri,
          grant_type: "authorization_code",
          code_verifier: verifier
        })
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.access_token) {
        throw new Error("Google token exchange failed.");
      }

      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { authorization: `Bearer ${tokenData.access_token}` }
      });
      const profile = await profileResponse.json();
      if (
        !profileResponse.ok ||
        !profile.sub ||
        !profile.email ||
        profile.email_verified !== true
      ) {
        throw new Error("Google did not return a verified email address.");
      }

      const user = await store.upsertGoogleUser({
        googleSubject: profile.sub,
        email: profile.email,
        picture:
          typeof profile.picture === "string" && profile.picture.startsWith("https://")
            ? profile.picture
            : "" // only the photo: the pseudo is the player's own choice
      });
      // Google is only the FIRST factor: the session is created after the authenticator code (MFA)
      // is verified.
      const { step } = await auth.beginSecondFactor(request, response, user, "google");
      const returnTo = safeReturnPath(cookies[names.returnTo]);
      identity.clearCookie(response, names.returnTo);
      response.redirect(
        `/login/${step === "mfa" ? "mfa" : step === "profile" ? "profile" : "setup"}?next=${encodeURIComponent(returnTo)}`
      );
    } catch (error) {
      logger.warn("google sign-in failed", { id: request.id, reason: error.message });
      response.status(502).send("Google sign-in failed. Return to the app and try again.");
    }
  });

  router.post("/auth/logout", async (request, response, next) => {
    try {
      await auth.logout(request, response);
      response.json({ loggedOut: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
