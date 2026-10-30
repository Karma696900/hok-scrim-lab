# The public API (`/api/v1`)

Everything a signed-in person can read in the application can be read from their own programs with an **API key**. The
API **only reads**: a key never writes, never carries administrator or editor rights, and sees exactly what its owner
sees (the series they created or were given, the series their teams shared, their tier lists, their own statistics, the
data of the game).

## Make a key

Settings → **API keys** (the section exists for a real account; a guest identity cannot hold keys).

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
| 405    | `method_not_allowed` | The API only reads: use `GET` (`Allow: GET, HEAD, OPTIONS`)                       |
| 429    | `rate_limited`       | More than 120 requests a minute for this key (`Retry-After`, `RateLimit` headers) |

Messages come in the language of the request (`Accept-Language`).

## Scopes and addresses

| Scope         | Address                                                                | What it reads                                                                               |
| ------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `game`        | `/heroes`                                                              | The heroes of the Global roster                                                             |
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

The order of the catalogue lists is fixed: **arcana by colour (red, then blue, then green), then by name**; items,
spells, stats and tags by name. (The pages of the site also put the Roaming items by type, Guardian then Crimson Shadow,
when that shop category is chosen; the API sends the items by name and each one carries its `shopCategory`.)

The list of addresses lives in `src/server/features/api-keys/endpoints.js`; the gateway forwards a request to the same
router the application uses (`src/server/features/api-keys/gateway.js`), so the rules never drift apart.

Not exposed on purpose: everything under `/api/admin`, sign-in and account security, the lists the staff edit with (the
builds and the official ratings reach the public through the sheet of the hero), anything that writes, and files
(exports, calendars, pictures).

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
