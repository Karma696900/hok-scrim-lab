# Discord setup — create the application (about 10 minutes)

The site works without Discord. These steps turn on, one after the other:

| Step | Gives you                                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------- |
| 1–3  | **Link your Discord account** (button on `/discord`)                                                                       |
| 4    | **Direct messages** for scrim requests, answers, invitations and reminders (6 h, 4 h, 2 h before an event)                 |
| 5    | **Buttons Accept / Decline** under a request in Discord, and the commands `/agenda` and `/requests`                        |
| 6    | **A team's Discord server**: reminders, confirmed scrims and a Monday digest posted in a channel the owner/managers choose |

> An application can only be created by a person, from a Discord account, in the Developer Portal. It cannot be created by the site or by a script, which is why this is a manual guide.

## 1. Create the application

1. Open <https://discord.com/developers/applications> and sign in.
2. **New Application** → name it (for example `HOK Scrim Lab`) → accept the terms → **Create**.
3. **General Information**: keep the page open. Copy:
   - **Application ID** → `DISCORD_CLIENT_ID`
   - **Public Key** → `DISCORD_PUBLIC_KEY` (used in step 5)

## 2. OAuth2: client secret and redirect addresses

1. **OAuth2** (left menu) → **Client Secret** → **Reset Secret** → copy it → `DISCORD_CLIENT_SECRET` (shown once).
2. **Redirects** → add **both** addresses (replace the host by your public address; `http://localhost:3000` is fine for local tests):
   - `http://localhost:3000/auth/discord/callback` → `DISCORD_REDIRECT_URI`
   - `http://localhost:3000/auth/discord/bot/callback` → `DISCORD_BOT_REDIRECT_URI`
3. **Save Changes**.

## 3. Put the values in `.env`

```
DISCORD_CLIENT_ID=<Application ID>
DISCORD_CLIENT_SECRET=<Client Secret>
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback
DISCORD_BOT_REDIRECT_URI=http://localhost:3000/auth/discord/bot/callback
```

Restart the app (`docker compose up -d --build hok-scrim-lab`). On `/discord`, **Link my Discord** now works.
In production use your real `https://…` addresses (Discord requires https for non-local redirects) and put the same addresses in the Developer Portal.

## 4. The bot (direct messages)

1. **Bot** (left menu) → **Reset Token** → copy it → `DISCORD_BOT_TOKEN` (shown once; never commit it).
2. On the same page, the three **Privileged Gateway Intents** stay **off**: the bot never reads messages and never connects to the gateway (it only calls Discord's REST API).
3. Restart. People who linked Discord and left the preferences on now receive their notifications as direct messages. (Discord only delivers a bot's DM to someone who shares a server with the bot or has installed the app: add the bot to one server you are in — step 6 does it — or install the app on your account from **Installation → User Install**.)

## 5. Buttons and commands (interactions endpoint)

1. Put the Public Key in `.env`: `DISCORD_PUBLIC_KEY=<Public Key>` and restart (the app also registers the two slash commands `/agenda` and `/requests` at start-up).
2. **General Information → Interactions Endpoint URL**: `https://<your public address>/discord/interactions` → **Save**. Discord sends a signed ping; the app answers it, and the field is accepted. (It must be a public https address: use a tunnel such as `cloudflared tunnel --url http://localhost:3000` for local tests.)
3. Buttons under a request answer through the same rules as the site (only the team whose turn it is; a person is recognised by the Discord account they linked).

## 6. A team's server (channel posts)

No Developer Portal action is needed besides steps 1–4:

1. A team **owner or manager** opens the team page → card **Discord** → **Add the bot to my server** → Discord asks which server (they need the _Manage Server_ permission there) → **Authorise**.
2. Back on the team page they pick the **channel** and press **Use this channel**: the bot posts a confirmation.
3. From then on the bot posts, in that channel: the reminders **6 h, 4 h and 2 h before** each team event, the **confirmed scrims**, and on **Monday at 08:00 (team time zone)** the digest of the week.
   The bot only asks for the permissions _Send Messages_ and _Embed Links_.

## Check the whole setup in one command

```
node --env-file=.env scripts/discord/check.mjs
```

It asks Discord, with the calls the site makes, and says in words what is wrong: the bot token (valid? which bot?), the
client id and the public key (do they belong to that bot?), the client secret and the redirect address (accepted?), whether
anybody can add the bot, whether the OAuth2 code grant is off. It prints the two addresses to register under **OAuth2 →
Redirects** first: Discord does not let a program read that list, so a missing address (Discord then shows "Invalid OAuth2
redirect_uri" when someone links) is the one thing it cannot see. Nothing is changed and no secret is printed.

On the site, **Discord → Check that it works → Send me a test message** sends one direct message to the account you linked
and tells you what Discord answered. The usual refusal is that **a bot can only write to people who share a server with it**
(and who allow direct messages from server members): add the bot to a server you are in (step 6) and try again.

## What to check

- `GET /api/me/discord` (signed in) tells what is configured: `configured` (steps 1–3), `botConfigured` (step 4).
- Nothing is sent to anyone who did not link Discord, or who switched the kind of notification off on `/discord`.
- A failed Discord call never blocks the site: the notification stays in the Inbox.

## Variables

| Variable                                                             | Needed for                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` | linking accounts                                                                      |
| `DISCORD_BOT_TOKEN`                                                  | direct messages, team channel                                                         |
| `DISCORD_BOT_REDIRECT_URI`                                           | adding the bot to a team server (default: the account redirect with `/bot/` inserted) |
| `DISCORD_PUBLIC_KEY`                                                 | buttons and slash commands                                                            |
