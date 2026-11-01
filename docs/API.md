# The public API (`/api/v1`)

Everything a signed-in person can read in the application can be read from their own programs with an **API key**. The
API **only reads**: a key never writes, never carries administrator or editor rights, and sees exactly what its owner
sees (the series they created or were given, the series their teams shared, their tier lists, their own statistics, the
data of the game). What the bots would do is not here: it is the bots API of `bots.hok-scrim-lab.com` (private
repository hok-bots), which takes the same keys with the scope `simulation`.

The public documentation is the page **`/developers`** of the site (made from the same list of addresses as the
gateway, so it never drifts), the machine-readable description is **`GET /api/v1/openapi.json`** (OpenAPI 3.1, no key
needed to read it), and AI assistants connect to the **MCP server** at `/api/v1/mcp` (see below).

## Make a key

Me → **API** (`/me/api`, for a real account; a guest identity cannot hold keys). Settings only links there.

- The scopes of the public data (`game`, `competitive`) are ticked by default; tick the others only for a program that
  needs your own data. Make **one key per program or AI assistant**, so one can be revoked without the others.

- A key has a **name**, a set of **scopes** (what it can read), and a **lifetime** (30 days, 90 days, 1 year, or never).
- The secret (`hok_` followed by 43 characters) is **shown once**, in the answer that creates it. Only its SHA-256 is
  stored, with its first 10 characters to recognise it in a list. Nobody, the staff included, can read it again.
- Up to 10 live keys per person. Revoking a key stops it **at once**; a revoked or expired key can then be removed from
  the list.
- Keys are made, listed and revoked **with the browser session only** (`/api/me/api-keys`): a key cannot make another
  key, so a leaked key cannot spread.

## Call the API

```bash
curl -H "Authorization: Bearer hok_xxxxxxxx…" https://YOUR-SITE/api/v1/heroes
```

- Send the key in the `Authorization: Bearer …` header (or `X-API-Key`). Never in the address: addresses end up in logs
  and in the history of browsers, so a key found in a query string is ignored.
- Cookies are not read on `/api/v1`, and a key is not read anywhere else.
- `GET /api/v1` lists the addresses open to the key, with the scope each one needs. `GET /api/v1/me` says who the key
  belongs to (tag and name, never the email), its scopes and its expiry.
- `GET /api/v1/openapi.json` describes every address (parameters, scope, an example answer); it is the only address of
  `/api/v1` that takes no key.
- Answers are JSON, the same objects as the application's own (`items`, `total`, `page`, `pageSize` for lists). They are
  never cached (`Cache-Control: no-store`).
- Pages of other sites may read too: `/api/v1` answers CORS preflights and sends `Access-Control-Allow-Origin: *`
  (never with credentials). A key in a web page is visible to whoever reads the page: keep keys in programs you run.

### Errors

| Status | `code`               | Meaning                                                                           |
| ------ | -------------------- | --------------------------------------------------------------------------------- |
| 401    | `unauthorized`       | No key, or a key that is not valid, has expired or was revoked (never says which) |
| 403    | `insufficient_scope` | The key lacks the scope this address needs (`{scope}` says which)                 |
| 404    | `not_found`          | Unknown address, or something the key's owner cannot see                          |
| 405    | `method_not_allowed` | The API only reads: use `GET` (`Allow: GET, HEAD, OPTIONS`; `POST` on `/mcp`) |
| 429    | `rate_limited`       | More than 120 requests a minute for this key (`Retry-After`, `RateLimit` headers) |

Messages come in the language of the request (`Accept-Language`).

## Scopes and addresses

| Scope         | Address                                                                | What it reads                                                                               |
| ------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `game`        | `/heroes`                                                              | The heroes of the Global roster                                                             |
|               | `/tier-list`                                                           | The public tier list of each lane (tournaments first, then the editors' ratings)            |
|               | `/heroes/:id`                                                          | One hero: sheet, skills, builds, combos, official ratings, competitive figures              |
|               | `/catalog`                                                             | Items, arcana, battle spells, stats and tags                                                |
|               | `/catalog/:family`, `/catalog/:family/:id`                             | One family (`items`, `arcana`, `spells`, `stats`, `tags`), or one piece of it by its number |
| `competitive` | `/tournaments`, `/tournaments/:id`                                     | The tournament series and all their games (bans, picks, lanes, winner)                      |
|               | `/popular/drafts`, `/popular/heroes`                                   | The drafts and heroes that win and are played most in tournaments                           |
| `scrims`      | `/series`, `/series/:id`                                               | Your series and the ones a team of yours shared                                             |
|               | `/stats/overview`, `/stats/heroes`, `/heroes/:id/scrims`               | The statistics of **your** scrims (figures under the minimum sample are withheld)           |
| `tier-lists`  | `/tier-lists`, `/tier-lists/:id`                                       | Your tier lists and the ones shared with you                                                |
| `teams`       | `/me/teams`, `/teams`, `/teams/:id`, `/teams/:id/events`, `/me/agenda` | Your teams and their agenda                                                                 |
|               | `/teams/:id/series`                                                    | The series this team shared with its members                                                |
| `training`    | `/training/*`, `/space`                                                | Your training notebook, combos to review, reflex results, personal space                    |
| `account`     | `/me`                                                                  | Who the key belongs to                                                                      |
| `simulation`  | the bots API at `bots.hok-scrim-lab.com`                              | What the bots of the game simulation would do, their analyses and the AI (not on this site)  |

The order of the catalogue lists is fixed: **arcana by colour (red, then blue, then green), then by name**; items,
spells, stats and tags by name. (The pages of the site also put the Roaming items by type, Guardian then Crimson Shadow,
when that shop category is chosen; the API sends the items by name and each one carries its `shopCategory`.)

An item, arcana or spell read by its number (`/catalog/:family/:id`) carries everything its page on the site shows; its
stats and tags are given by their number (read them once with `/catalog/stats` and `/catalog/tags`), and its picture is
at `/catalog-images/{imageId}` on the site.

The list of addresses lives in `src/server/features/api-keys/endpoints.js` (each one with its scope, its tool name for
an AI, its query parameters; the example answers are in `endpoint-examples.json`); the gateway forwards a request to the same
router the application uses (`src/server/features/api-keys/gateway.js`), so the rules never drift apart.

Not exposed on purpose: everything under `/api/admin`, sign-in and account security, the lists the staff edit with (the
builds and the official ratings reach the public through the sheet of the hero), anything that writes, and files
(exports, calendars, pictures).

## AI assistants (MCP)

`POST /api/v1/mcp` is a remote [MCP](https://modelcontextprotocol.io) server (Streamable HTTP transport, JSON answers, no
session, protocol versions 2025-06-18, 2025-03-26 and 2024-11-05). It takes the same `Authorization: Bearer` key and
answers `initialize`, `ping`, `tools/list` and `tools/call`. A key sees **one tool per address its scopes open**
(`list_heroes`, `get_hero`, `get_tier_list`, `get_catalog_entry`, `list_series`…, the `operationId`s of the OpenAPI
document), all marked read-only.

A tool call is not answered by the MCP code: it is sent back through the gateway as `GET /api/v1/…` with the same key, so
it passes the same checks (key, scope, allow-list, rate limit). The MCP message counts one request against the key's 120
a minute, and each tool call one more. A refusal of the API (404, 403, 429…) comes back as a tool result with
`isError: true` that the assistant reads; a tool the key does not open is a JSON-RPC error (`-32602`). `GET` on the
address answers 405 (no event stream).

| Assistant      | Setup                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code    | `claude mcp add --transport http hok-api https://YOUR-SITE/api/v1/mcp --header "Authorization: Bearer hok_…"`                                                            |
| Claude Desktop | `claude_desktop_config.json`: `npx -y mcp-remote https://YOUR-SITE/api/v1/mcp --header Authorization:${HOK_API_KEY}` with `HOK_API_KEY=Bearer hok_…` in `env` (Node.js) |
| Cursor         | `.cursor/mcp.json`: `{ "mcpServers": { "hok-api": { "url": "https://YOUR-SITE/api/v1/mcp", "headers": { "Authorization": "Bearer hok_…" } } } }`                        |
| ChatGPT        | A custom GPT: Configure → Create new action → Import from URL `https://YOUR-SITE/api/v1/openapi.json`, Authentication: API key, Bearer                                  |

The same snippets, with the address of the site filled in, are on `/me/api` and `/developers`.

## Share series with a team

The creator of a series who **leads a team (owner, manager or coach)** can put the series on the team. Every member of
the team can then read it, as a viewer, in the application and through their keys; nobody else can. Taking it off the
team, or leaving the team, ends the access at once.

| Request                                | Who                                                       |
| -------------------------------------- | --------------------------------------------------------- |
| `PUT /api/series/:id/teams/:teamId`    | The creator of the series, if they lead the team          |
| `DELETE /api/series/:id/teams/:teamId` | The creator, or a leader of the team                      |
| `GET /api/series/:id/teams`            | The creator: where the series is, and the teams they lead |
| `GET /api/teams/:id/series`            | Any member of the team                                    |

A series can be on 5 teams at most. A shared series is **not** part of a member's "your scrims" statistics: those count
what the person created or played.

## Security notes

- Keys: 256 random bits, stored as SHA-256 (no salt or slow hash is needed at that entropy), unique index on the hash.
  An unknown, revoked or expired key gets one and the same answer.
- The rate limit counts the key, not the address (many keys can share one address, one key can come from many).
- A key is read-only by construction: the gateway answers 405 to anything but `GET`, `HEAD` and `OPTIONS`, and the list of
  addresses is an allow-list (an address that is not in it does not exist for a key).
- A key request is treated as an ordinary account, never as an administrator or an editor, whatever the owner is on the site.
- Creating a key is limited like sign-in (30 / 15 min per address) and logged (`api key created`, `api key revoked`; never
  the secret).
