# /casino: the composition roulette (design)

Owner's request (2026-11-07, csc): "une nouvelle fonctionnalité qui n'a pas besoin de compte (un peu une machine à sous) : sans compte, quelqu'un peut faire une roulette de compositions (selon un pool de héros par lane de son choix) et ce serait un lien /casino qu'il peut partager avec d'autres personnes pour qu'ils voient sans compte. Et il peut relancer la roulette en live pour un des héros ou plus, s'il a été ban etc."

Design approved on csc the same day ("OK tel quel (spectateurs en lecture seule)").

## What it is

A page of Scrim Lab that needs no account. Someone builds a hero pool for each of the five lanes, spins, and gets one hero per lane. They share a link: the people watching see the same result, live, without an account. The creator can respin one lane, several lanes, or all five. When a hero gets banned in their real draft, they mark it banned and its lane is respun.

## Pages

| Address | Who | Indexed | What it shows |
|---|---|---|---|
| `/casino` | everyone | yes | what the roulette does, and a "Create a roulette" button |
| `/casino/<id>` | the creator (with the key) | no (`noindex`) | the pools, the spin buttons, the result, the bans, the history |
| `/casino/<id>` | everyone else | no (`noindex`) | the result, the bans and the history, read only, refreshed live |

`<id>` is a 10-character random code (letters and digits), unguessable enough that a roulette is only seen by people who have its link.

## The creator's key

- Creating a roulette returns its `id` and a secret `key` (32 random bytes, base64url). The server stores only its SHA-256.
- The browser keeps the key in `localStorage` under `casino-key:<id>`. That browser is the creator, with no account and no cookie.
- The creator's page shows a private "control link" (`/casino/<id>#key=<key>`) to open the roulette on another device (phone, stream PC). The key sits after `#`, so the browser never sends it to the server and it appears in no log. On opening, the page stores it and removes it from the address bar.
- Every change (spin, pools, ban) sends the key in an `X-Casino-Key` header. A wrong or missing key gets 403 and changes nothing.
- The share link (`/casino/<id>`) never contains the key.

## Pools

- Five columns: Clash, Jungle, Mid, Farm, Roam (the site's lane icons and names).
- By default each lane's pool holds every hero the site lists for that lane (the hero's `lanes`).
- The creator checks and unchecks heroes per lane, and has "all" and "none" buttons per lane plus a search box.
- A hero who plays several lanes can be in several pools.

## The spin

- **The server draws** (`crypto.randomInt`), so the result is fair, cannot be forced from the browser, and everyone sees the same one.
- "Spin" draws all five lanes. "Respin" draws only the lanes the creator ticked (1 to 5).
- **No duplicates**: a hero already shown in another lane is left out of a lane's draw. Lanes being respun are drawn one after the other in lane order, each excluding what is already shown.
- **Empty pool**: when a lane has no hero left to draw (all unchecked, banned or already shown), that lane is not drawn. It shows "No hero left in this pool" and the other lanes are drawn normally.
- Each spin bumps the roulette's `version` and goes into the history.

## Bans

- A "Banned" button on each hero shown in the result. The hero leaves every pool of this roulette (the "banned" list) and its lane is respun at once.
- The "Banned" list is shown to everyone. The creator can put a hero back (to undo a mistake). Putting a hero back respins nothing.

## History

The last 10 spins, newest first: the time, the five heroes, and which lanes were drawn (a full spin, "Respin: Mid, Farm", or "Ban: X → Mid respun").

## Live view for spectators

- The spectator's page asks `GET /api/casino/<id>?since=<version>` every 2 seconds (the live draft's rhythm). The server answers `304` when nothing changed. Polling pauses while the tab is hidden.
- When the version changes, the lanes that were drawn play the reel animation, for spectators too.

## The animation

- The drawn lanes spin like slot-machine reels for about 1.5 s (portraits scrolling, slowing down, stopping on the hero). Lanes not drawn stay still.
- `transform` and `opacity` only. With reduced motion the result appears at once.
- The result is shown even if the animation is cut short (switching tab, a new spin arriving).

## Server

- **Table** `casino_rolls` (migration 043, additive): `id CHAR(10) PRIMARY KEY`, `key_hash CHAR(64)`, `pools_json TEXT`, `banned_json TEXT`, `result_json TEXT`, `history_json TEXT`, `version INT`, `created_at`, `updated_at` (indexed).
- **Routes** (`src/server/features/casino/`):
  - `POST /api/casino`: create. Body: the pools, or none for the defaults. Returns `{ id, key, state }`.
  - `GET /api/casino/:id`: public state without the key. Supports `?since=` with a `304`.
  - `PUT /api/casino/:id/pools`: replace the pools (key).
  - `POST /api/casino/:id/spin`, body `{ lanes: [...] }`: draw (key).
  - `POST /api/casino/:id/ban`, body `{ lane }`: ban the hero shown in that lane and respin it (key).
  - `DELETE /api/casino/:id/ban/:heroId`: put a hero back (key).
- **Validation** in `casino-domain.js`: known lanes only, hero ids that exist, at most 200 heroes per pool. Errors use the site's usual codes.
- **No account, no cookie**: these routes never call `identity.ensureUser`. In `route-access.test.js` they are classified as public, with the key as their guard.
- **Abuse**: new limiters, `casinoCreate` (20 an hour per address) and `casinoAction` (120 a minute per address). The polling `GET` uses the existing `media` limiter (1200 a minute).
- **Cleanup**: a roulette untouched for 7 days is deleted. The server deletes them at start-up and then once a day.

## Client

- `src/shared/routes-table.js`: `/casino` (`index: true`) and `/casino/<id>` (`index: false`).
- `src/client/features/casino/`, following `docs/PAGE-ANATOMY.md`: the page, the markup, the reels, the polling, the actions. Declared in `lazy-pages.js` and `lazy-views.js`, with a README.
- The site's current design (the owner keeps it): its tokens, buttons, lane icons and hero portraits. Lighthouse 100 is the target, as on every page.
- Every text goes through `t()` and gets its translations in the site's 15 languages (the i18n add tool).
- A link to `/casino` is added in the site's menu. Which menu exactly is for the owner to place.

## Tests

- **Unit** (`casino-domain.test.js`): a draw takes only from the pool; no hero twice in a composition; a respin keeps the lanes not ticked; an empty pool leaves its lane empty with its message; a banned hero is never drawn; the history keeps 10.
- **Routes** (`casino-routes.test.js`, `startTestServer`): create without an account; read without the key hides the key; a change without the key or with a wrong one gets 403 and nothing changes; `since` gives 304; the limits apply.
- **Migration**: `migrations.test.js` replays 043.
- **Browser** (`casino.e2e.mjs`): create, spin and see five heroes. A second browser with the share link sees the same five without an account and has no spin button. Respin Mid only, and the second browser sees the new Mid within 3 s. Ban a hero and its lane changes; the control link opens control on another browser. Checked at 390 px, with motion allowed and reduced, and with the hit test.
- **Architecture**: files under 400 lines, functions under 120.

## Out of scope

- Spectators spinning (the owner chose read only).
- Accounts, saving a roulette to one's space, naming roulettes.
- Weights, odds per hero, or a "no repeat across spins" rule.
- Sound.
