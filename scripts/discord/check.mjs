#!/usr/bin/env node
// Is the Discord application of the .env sound? It asks Discord, with the same calls the site makes, and says what
// is wrong in words. Nothing is changed and no secret is printed.
//   node --env-file=.env scripts/discord/check.mjs
//
//   1. the bot token          GET  /users/@me           is the token valid, which bot is it?
//   2. the application        GET  /applications/@me    do the client id and the public key of the .env belong to it?
//                                                       can anybody add the bot, is the OAuth2 code grant off?
//   3. the client secret      POST /oauth2/token        with a made-up code: "invalid_grant" means that the id, the
//                                                       secret and the redirect address are accepted
// What this cannot see is the list of Redirects of the portal (Discord does not give it to a program): the two
// addresses to register are printed first, copy them there (OAuth2 > Redirects) and Save Changes.
const API = "https://discord.com/api/v10";
const env = process.env;
const settings = {
  clientId: env.DISCORD_CLIENT_ID ?? "",
  secret: env.DISCORD_CLIENT_SECRET ?? "",
  token: env.DISCORD_BOT_TOKEN ?? "",
  publicKey: env.DISCORD_PUBLIC_KEY ?? "",
  redirect: env.DISCORD_REDIRECT_URI ?? "",
  botRedirect:
    env.DISCORD_BOT_REDIRECT_URI ||
    (env.DISCORD_REDIRECT_URI ?? "").replace(
      /\/auth\/discord\/callback$/,
      "/auth/discord/bot/callback"
    )
};
const headers = extra => ({
  "user-agent": "DiscordBot (https://github.com/hok-scrim-lab, 1.0)",
  ...extra
});
let problems = 0;
const say = (ok, label, detail) => {
  problems += ok ? 0 : 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label.padEnd(34)} ${detail}`);
};
const read = async response => ({
  status: response.status,
  ok: response.ok,
  body: await response.json().catch(() => ({}))
});

const missing = ["clientId", "secret", "redirect"].filter(name => !settings[name]);
if (missing.length) {
  console.log(
    `Missing in the .env: ${missing.map(name => ({ clientId: "DISCORD_CLIENT_ID", secret: "DISCORD_CLIENT_SECRET", redirect: "DISCORD_REDIRECT_URI" })[name]).join(", ")}.`
  );
  console.log("Run it as: node --env-file=.env scripts/discord/check.mjs");
  process.exit(2);
}

console.log("Addresses to register in the Discord portal (OAuth2 > Redirects, then Save Changes):");
console.log(`   ${settings.redirect}\n   ${settings.botRedirect}\n`);

// the client secret and the redirect address (the link of an account)
{
  const answer = await read(
    await fetch(`${API}/oauth2/token`, {
      method: "POST",
      headers: headers({ "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.secret,
        grant_type: "authorization_code",
        code: "not-a-real-code",
        redirect_uri: settings.redirect
      })
    })
  );
  if (answer.body.error === "invalid_grant") {
    say(true, "Link an account (client secret)", "accepted (only the made-up code was refused)");
  } else if (answer.body.error === "invalid_client") {
    say(
      false,
      "Link an account (client secret)",
      "Discord does not know this client id and secret: reset the secret (OAuth2 > Reset Secret) and copy it into DISCORD_CLIENT_SECRET"
    );
  } else {
    say(
      false,
      "Link an account (client secret)",
      `unexpected answer ${answer.status} ${JSON.stringify(answer.body).slice(0, 120)}`
    );
  }
}

// the bot
if (!settings.token) {
  console.log(
    "-    Direct messages (bot token)        DISCORD_BOT_TOKEN is empty: nothing will be sent by direct message"
  );
} else {
  const me = await read(
    await fetch(`${API}/users/@me`, {
      headers: headers({ authorization: `Bot ${settings.token}` })
    })
  );
  say(
    me.ok,
    "Bot token",
    me.ok
      ? `valid: the bot is "${me.body.username}"`
      : `refused (${me.status}): reset the token (Bot > Reset Token) and copy it into DISCORD_BOT_TOKEN`
  );
  const app = await read(
    await fetch(`${API}/applications/@me`, {
      headers: headers({ authorization: `Bot ${settings.token}` })
    })
  );
  if (app.ok) {
    say(
      String(app.body.id) === settings.clientId,
      "Client id belongs to this bot",
      String(app.body.id) === settings.clientId
        ? "yes"
        : `NO: the token is the one of application ${app.body.id}, DISCORD_CLIENT_ID says ${settings.clientId}`
    );
    if (settings.publicKey) {
      say(
        String(app.body.verify_key) === settings.publicKey,
        "Public key",
        String(app.body.verify_key) === settings.publicKey
          ? "yes"
          : "NO: DISCORD_PUBLIC_KEY is not the one of this application (General Information)"
      );
    }
    say(
      Boolean(app.body.bot_public),
      "Anybody can add the bot",
      app.body.bot_public
        ? "yes (public bot)"
        : "NO: the bot is private, only its owner can add it to a server (Bot > Public Bot)"
    );
    say(
      !app.body.bot_require_code_grant,
      "No code grant for the bot",
      app.body.bot_require_code_grant
        ? "NO: adding the bot to a server fails; switch 'Requires OAuth2 Code Grant' off (Bot page)"
        : "yes"
    );
    console.log(
      `-    Buttons and slash commands         ${app.body.interactions_endpoint_url ? `endpoint: ${app.body.interactions_endpoint_url}` : "no Interactions Endpoint URL (it needs a public https address: they only work on a deployed site)"}`
    );
  } else {
    say(false, "Application of the token", `refused (${app.status})`);
  }
}

console.log(
  `\n${problems ? `${problems} problem(s) above.` : "The application is sound."} A direct message also needs the person to share a server with the bot (the bot cannot write to a stranger): on the site, Discord page, "Send me a test message" says what Discord answers.`
);
process.exit(problems ? 1 : 0);
