// discord service, small helpers: json, bot, authorizeUrl, exchange, and 4 more.
import { createPublicKey, verify } from "node:crypto";

export const json = async response => {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(`Discord answered ${response.status}`), {
      status: response.status,
      // Discord's own code of the refusal (50007: "Cannot send messages to this user")
      discordCode: typeof data?.code === "number" ? data.code : null
    });
  }
  return data;
};

export const bot = (ctx, path, options = {}) =>
  ctx
    .fetchImpl(`${API}${path}`, {
      ...options,
      headers: { ...ctx.botHeaders, ...(options.headers ?? {}) }
    })
    .then(json);

export function authorizeUrl(ctx, state) {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: ctx.settings.clientId,
    scope: "identify",
    redirect_uri: ctx.settings.redirectUri,
    state,
    prompt: "consent"
  }).toString();
  return url.toString();
}

export async function exchange(ctx, code) {
  const data = await json(
    await ctx.fetchImpl(`${API}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: ctx.settings.clientId,
        client_secret: ctx.settings.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: ctx.settings.redirectUri
      })
    })
  );
  if (!data?.access_token) {
    throw new Error("Discord token exchange failed.");
  }
  return data.access_token;
}

export async function fetchUser(ctx, accessToken) {
  const data = await json(
    await ctx.fetchImpl(`${API}/users/@me`, { headers: { authorization: `Bearer ${accessToken}` } })
  );
  if (!data?.id || !/^[0-9]{5,25}$/.test(String(data.id))) {
    throw new Error("Discord did not return an account.");
  }
  return {
    discordId: String(data.id),
    username: String(data.global_name || data.username || "Discord user").slice(0, 64),
    avatarHash: /^[a-z0-9_]{1,64}$/i.test(String(data.avatar ?? "")) ? String(data.avatar) : ""
  };
}

export function avatarUrl(discordId, hash) {
  return hash ? `https://cdn.discordapp.com/avatars/${discordId}/${hash}.png?size=128` : null;
}

export async function sendDirectMessage(ctx, discordId, content, components = null) {
  if (!ctx.botEnabled) {
    return false;
  }
  const channel = await ctx.bot("/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: discordId })
  });
  await ctx.bot(`/channels/${channel.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: String(content).slice(0, 1800),
      allowed_mentions: { parse: [] },
      ...(components ? { components } : {})
    })
  });
  return true;
}

// ---- interactions (buttons and slash commands) ----------------------------------------------
/**
 * Discord signs every interaction (Ed25519 over timestamp + raw body); anything else is
 * refused.
 */
export function verifyInteraction(ctx, rawBody, signature, timestamp) {
  if (
    !ctx.interactionsEnabled ||
    !Buffer.isBuffer(rawBody) ||
    !/^[0-9a-f]{128}$/i.test(String(signature ?? "")) ||
    !/^[0-9]{1,15}$/.test(String(timestamp ?? ""))
  ) {
    return false;
  }
  try {
    const key = createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(ctx.settings.publicKey, "hex")]),
      format: "der",
      type: "spki"
    });
    return verify(
      null,
      Buffer.concat([Buffer.from(String(timestamp)), rawBody]),
      key,
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

const API = "https://discord.com/api/v10";

const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  bot,
  authorizeUrl,
  exchange,
  fetchUser,
  sendDirectMessage,
  verifyInteraction
};
