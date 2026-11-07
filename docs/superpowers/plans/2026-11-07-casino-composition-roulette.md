# /casino composition roulette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A no-account page `/casino` where anyone builds per-lane hero pools, has the server draw one hero per lane, respins or bans live, and shares a read-only link that spectators watch update.

**Architecture:** A new server slice `src/server/features/casino/` (pure draw rules in `casino-domain.js`, SQL in `casino-store.js`, routes in `casino-routes.js`) on a new table `casino_rolls` (migration 043). Control is proven by a secret key whose SHA-256 is stored, sent in `X-Casino-Key`. A new lazy client page `src/client/features/casino/` renders the landing, the creator's controls and the spectator view, and polls `GET /api/casino/:id?since=` every 2 s.

**Tech Stack:** Node (Express, mysql2, `node:crypto`), vanilla JS client (the site's `t()`, `view.esc`, `onAction`), `node:test`, the site's e2e runner (Playwright).

**Spec:** `docs/superpowers/specs/2026-11-07-casino-composition-roulette-design.md` (owner approved 2026-11-07; link in the main menu).

## Global Constraints

- No account and no cookie: the casino routes never call `identity.ensureUser`.
- `<id>`: 10 characters, letters and digits, random (`crypto.randomInt` over `[A-Za-z0-9]`).
- Key: 32 random bytes, base64url; only its SHA-256 (hex, 64 chars) is stored; sent in the `X-Casino-Key` header; wrong or missing → 403, nothing changes.
- Lanes, in this order everywhere: `clash`, `jungle`, `mid`, `farm`, `roam` (from the site's `"Clash Lane"`, `"Jungle"`, `"Mid Lane"`, `"Farm Lane"`, `"Roamer"`).
- At most 200 heroes per pool; history keeps the last 10 spins; a roulette untouched for 7 days is deleted.
- Limiters: `casinoCreate` 20 per hour per address, `casinoAction` 120 per minute per address; the polling GET uses `media`.
- Spectators poll every 2 s, paused while the tab is hidden; `304` when `since` equals the current version.
- Reels: about 1.5 s, `transform`/`opacity` only, instant with `prefers-reduced-motion: reduce`.
- `/casino` indexed; `/casino/<id>` not indexed.
- Every visible text through `t()`, translated into the site's 15 languages (`scripts/i18n/sync.mjs`, `scripts/i18n/add.mjs`).
- Files ≤ 400 lines, functions ≤ 120, stylesheets ≤ 600 (`src/architecture.test.js`); every new folder has a `README.md` in the site's format.
- The site's current design (tokens in `src/client/styles/base/tokens.css`, `.btn` classes, lane icons, hero portraits); no inline styles (CSP).
- Run `docker compose ps` before any test run that needs the database; never restart Docker or WSL.
- No commit and no push without the owner's word (session rule): the "Commit" steps below are done only once he says so; until then the step is "stage nothing, note the files in the ledger".

## Review Focus

1. Two control devices acting at the same moment (a spin from the phone and a ban from the PC): neither change is lost and the version only moves forward. Pinned in Task 2 (`update` refuses a stale version) and Task 3 (route retries once on a version clash).
2. A hero removed from the site's roster after a pool was saved: never drawn, and the pool editor does not show a ghost. Pinned in Task 1 (`draw` takes a `known` set).
3. An unknown or expired id (`/casino/zzzzzzzzzz`): the API answers 404 and the page shows "This roulette does not exist or has expired" with a "Create a roulette" button, no endless polling. Pinned in Task 3 and Task 6.
4. A control link with a wrong key, or a browser where `localStorage` throws (private mode): the page falls back to the spectator view with "This control link is not valid" for a wrong key, and keeps the key in memory for the tab when storage fails. Pinned in Task 5.
5. A spectator tab hidden for a while then shown again: it fetches at once and lands on the latest result without replaying stale reels. Pinned in Task 6.

---

### Task 1: Draw rules (pure domain)

**Files:**
- Create: `src/server/features/casino/casino-domain.js`
- Test: `src/server/features/casino/casino-domain.test.js`

**Interfaces:**
- Produces (all exported from `casino-domain.js`):
  - `LANE_KEYS: string[]` = `["clash","jungle","mid","farm","roam"]`
  - `laneKeyOf(siteLane: string): string|null` (`"Roamer"` → `"roam"`, unknown → `null`)
  - `defaultPools(heroes: {id, lanes: string[]}[]): Record<lane, string[]>` (every hero in each of its lanes, ids sorted)
  - `parsePools(body: unknown, known: Set<string>): Record<lane, string[]>` (throws `badRequest(..., "invalid_pools")`; unknown ids dropped; duplicates removed; > 200 in a lane → throws)
  - `parseLanes(body: unknown): string[]` (1-5 distinct lane keys, in `LANE_KEYS` order; else throws `badRequest(..., "invalid_lanes")`)
  - `emptyState(pools): State` with `State = { pools, banned: string[], result: Record<lane, string|null>, drawn: string[], history: Entry[] }`, `Entry = { at: number, kind: "spin"|"respin"|"ban", lanes: string[], result: Record<lane,string|null>, hero?: string }`
  - `draw(state: State, lanes: string[], { known: Set<string>, pick: (n:number)=>number, now: number, kind: "spin"|"respin"|"ban", hero?: string }): State` (returns a new state; never mutates)
  - `banLane(state, lane, opts): State` (adds the hero shown in `lane` to `banned`, then `draw` that lane with `kind: "ban", hero`; a lane showing nobody → throws `badRequest(..., "nothing_to_ban")`)
  - `unban(state, heroId): State` (removes from `banned`; no draw; unknown → unchanged)

- [ ] **Step 1: Write the failing tests** (`describe("casino draw")`, a seeded `pick` such as `n => 0` and a counter-based one)
  - `"a full spin takes each lane's hero from that lane's pool"`: pools `{clash:["a"], jungle:["b"], mid:["c"], farm:["d"], roam:["e"]}` → result `{clash:"a",…,roam:"e"}`, `drawn` = all five, `history[0].kind === "spin"`.
  - `"no hero twice in a composition"`: every pool `["a","b","c","d","e"]`, 200 draws with a random `pick` → the five results are always distinct.
  - `"a respin keeps the lanes not ticked"`: draw all, then `draw(state, ["mid"], …)` → only `mid` may change, `drawn` = `["mid"]`, and the new mid is not one of the four kept heroes.
  - `"an empty pool leaves its lane empty"`: `roam: []` → `result.roam === null`, the other four filled.
  - `"a banned hero is never drawn"`: `banned: ["a"]`, pool `["a","b"]` → 50 draws never give `"a"`.
  - `"a hero no longer on the site is never drawn"` (Review Focus 2): pool `["gone","b"]`, `known = new Set(["b",…])` → always `"b"`.
  - `"banLane bans the shown hero and respins its lane"`: result mid `"c"` → after `banLane(state,"mid",…)`, `banned` includes `"c"`, mid ≠ `"c"`, `history[0]` = `{ kind: "ban", hero: "c", lanes: ["mid"] }`.
  - `"unban puts a hero back without drawing"`: result unchanged, history unchanged, `banned` without it.
  - `"the history keeps the last 10, newest first"`: 12 spins → length 10, `history[0].at` is the 12th `now`.
  - `"parseLanes refuses unknown, empty and repeated lanes"`; `"parsePools drops unknown ids and refuses more than 200 in a lane"`; `"defaultPools puts a two-lane hero in both pools"`.

- [ ] **Step 2: Run them, expect FAIL** (module not found)
  Run: `node --test src/server/features/casino/casino-domain.test.js`

- [ ] **Step 3: Implement `casino-domain.js`**
  Draw lanes one after the other in `LANE_KEYS` order; each excludes `banned`, ids not in `known`, and every hero currently shown in any other lane (kept lanes and lanes already drawn in this call). `pick(n)` returns an index in `[0, n)`; the routes pass `n => crypto.randomInt(n)`.

- [ ] **Step 4: Run them, expect PASS**
  Run: `node --test src/server/features/casino/casino-domain.test.js`

- [ ] **Step 5: Commit** (see Global Constraints): `feat(casino): the roulette's draw rules`

### Task 2: Table and store

**Files:**
- Create: `src/server/platform/database/migrations/043-casino-rolls.js`
- Modify: `src/server/platform/database/migrations/index.js` (import and list 043 after 042)
- Create: `src/server/features/casino/casino-store.js`
- Modify: `src/server/platform/database/store.js` (spread `...createCasinoStore(context)` next to `createContactStore`)
- Test: `src/server/features/casino/casino-store.test.js`

**Interfaces:**
- Consumes: `State` from Task 1.
- Produces (`createCasinoStore({ pool })`):
  - `createCasino({ id, keyHash, state }, now = Date.now()): Promise<void>`
  - `readCasino(id): Promise<{ id, keyHash, version: number, state: State, updatedAt: number } | null>`
  - `updateCasino(id, version, state, now = Date.now()): Promise<boolean>` (one `UPDATE … SET …, version = version + 1 WHERE id = ? AND version = ?`; false when the version moved)
  - `purgeCasinos(now = Date.now()): Promise<number>` (deletes rows with `updated_at < now - 7 days`, returns the count)

- [ ] **Step 1: Write the failing tests** (database through `startTestServer()`; skip the file when it returns `null`, as the other store tests do)
  - `"a roulette is created, read back and updated"`: version 0 after create; `updateCasino(id, 0, s)` → true, version 1, state round-trips.
  - `"a stale version does not overwrite"` (Review Focus 1): two `updateCasino(id, 1, …)` → first true, second false, stored state is the first.
  - `"a roulette untouched for 7 days is purged"`: created at `now - 7 days - 1 ms` → `purgeCasinos(now)` = 1 and `readCasino` = null; one created at `now - 6 days` stays.
  - Migrations: `node --test src/server/platform/database/migrations/migrations.test.js` replays 043.

- [ ] **Step 2: Run, expect FAIL**
  Run: `docker compose ps` (the database container is up), then `node --test src/server/features/casino/casino-store.test.js`

- [ ] **Step 3: Implement**
  Migration 043 (additive, the 042 model): `casino_rolls (id CHAR(10) PRIMARY KEY, key_hash CHAR(64) NOT NULL, state_json MEDIUMTEXT NOT NULL, version INT UNSIGNED NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, INDEX idx_casino_updated (updated_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`. Ruling against the spec's five JSON columns: one `state_json` holds pools, banned, result, history (they are always read and written together); record it in the ledger.

- [ ] **Step 4: Run, expect PASS** (store tests and `migrations.test.js`)

- [ ] **Step 5: Commit**: `feat(casino): the casino_rolls table and its store`

### Task 3: API routes, limits, access, cleanup

**Files:**
- Create: `src/server/features/casino/casino-routes.js`, `src/server/features/casino/README.md`
- Modify: `src/server/app-api.js` (`api.use(createCasinoRouter({ store, limiters }))`)
- Modify: `src/server/platform/http/rate-limits.js` (`casinoCreate: { windowMs: 60 * MINUTE, limit: 20 }`, `casinoAction: { windowMs: MINUTE, limit: 120 }`)
- Modify: `src/server/route-access.test.js` (`EXPECTED`: the six routes as `"open"`, with a comment that the key guards changes)
- Modify: `src/server/server.js` (call `store.purgeCasinos()` once at start-up and inside the existing hourly `purgeTimer` callback; log the count when > 0)
- Test: `src/server/features/casino/casino-routes.test.js`

**Interfaces:**
- Consumes: Task 1 functions; Task 2 store; `store.readHeroes()` for `known` and `defaultPools`.
- Produces (HTTP, JSON; the public state is `{ id, version, pools, banned, result, drawn, history, updatedAt }`, never the key):
  - `POST /api/casino` (`casinoCreate`) body `{ pools? }` → `201 { id, key, state }`
  - `GET /api/casino/:id` (`media`) `?since=<n>` → `200 state`, or `304` when `since === version`; unknown → `404`
  - `PUT /api/casino/:id/pools` (`casinoAction`) body `{ pools }` → `200 state`
  - `POST /api/casino/:id/spin` (`casinoAction`) body `{ lanes }` → `200 state` (`kind` = `"spin"` when 5 lanes, else `"respin"`)
  - `POST /api/casino/:id/ban` (`casinoAction`) body `{ lane }` → `200 state`
  - `DELETE /api/casino/:id/ban/:heroId` (`casinoAction`) → `200 state`
  - `:id` not matching `/^[A-Za-z0-9]{10}$/` → `404`; the key compared with `crypto.timingSafeEqual` on the hashes.

- [ ] **Step 1: Write the failing tests** (`startTestServer()`, anonymous `browser()`)
  - `"anyone creates a roulette without an account, with every hero of each lane by default"`: `POST /api/casino {}` → 201, 10-char id, 43-char key, `pools.roam` = the sample heroes whose lane is `"Roamer"`; no `set-cookie` header.
  - `"a spectator reads the state and never the key"`: `GET` → 200, the body has no `key`/`keyHash` field.
  - `"a change without the key or with a wrong one is refused and changes nothing"`: spin without header → 403; with a wrong key → 403; `version` unchanged.
  - `"the creator spins, respins one lane and bans"`: spin 5 lanes → 5 heroes; `spin {lanes:["mid"]}` → only mid may differ; `ban {lane:"farm"}` → farm hero in `banned`, farm changed.
  - `"since answers 304 when nothing changed"`.
  - `"an unknown id answers 404"` (Review Focus 3): `GET /api/casino/zzzzzzzzzz` → 404; `GET /api/casino/bad` → 404.
  - `"two actions at once both land"` (Review Focus 1): `Promise.all([spin mid, ban farm])` → both 200, final `version === 2` (start 0), `history.length === 2`. The route reads, applies, `updateCasino`; on `false` it reads again and applies once more, then gives `409` if it still clashes.
  - `"the limits apply"`: a `startTestServer({ limiters: createLimiters({ overrides: { casinoCreate: { limit: 1 } } }) })` → second create is 429.

- [ ] **Step 2: Run, expect FAIL**: `node --test src/server/features/casino/casino-routes.test.js src/server/route-access.test.js`

- [ ] **Step 3: Implement the router** (the contact router as the model: `wrap`, limiters first, validation in the domain file).

- [ ] **Step 4: Run, expect PASS**: the same two files, then `node --test src/server` (whole server suite).

- [ ] **Step 5: Commit**: `feat(casino): the roulette API, no account, a key for the creator`

### Task 4: Routes, menu link and the read-only page

**Files:**
- Modify: `src/shared/routes-table.js` (two entries after `/simulation`):
  - `/^\/casino$/`, view `"casino"`, `index: true`, title `"HOK composition roulette — random Honor of Kings team per lane | {site}"`, description `"Spin a random Honor of Kings composition, one hero per lane from the pools you choose, respin a lane when a hero is banned, and share the live link."`
  - `/^\/casino\/([A-Za-z0-9]{10})$/`, view `"casino-roll"`, `index: false`, `param: "casinoId"`, title `"Composition roulette | {site}"`, description `"A live Honor of Kings composition roulette."`
- Modify: `src/client/index.html` (in `#nav-play`, after Game Simulation: `<a class="nav-link" data-view="casino" href="/casino">{{i:dice i--duo}}<span>{{t:Composition roulette}}</span></a>`; if the icon set has no `dice`, add one to the icon sprite in the same file's style)
- Modify: `src/client/shell/menu.js` (`MENU_ENTRY["casino-roll"] = "casino"`)
- Modify: `src/client/app/router.js` (`state.casinoId = route.view === "casino-roll" ? route.casinoId : null`)
- Modify: `src/client/app/lazy-pages.js` (`loadCasino`), `src/client/app/lazy-views.js` (`casino` and `casino-roll` → `page.show(app, state.casinoId)`)
- Modify: `src/server/platform/http/page-handler-views.js` (both views public)
- Create: `src/client/features/casino/casino-page.js` (`createCasinoPage(parts)` → `{ show(app, casinoId) }`), `casino-markup.js` (pure functions), `README.md`
- Create: `src/client/styles/pages/casino.css` (wired the way other pages' sheets are, `stylesheet-loading.js`)
- Test: `src/client/features/casino/casino-markup.test.js` (fake-dom + snapshot, the `team-view.test.js` model)

**Interfaces:**
- Consumes: the public state of Task 3; `state.heroes` (`roster-data.js`, `/api/heroes`) for names and portraits.
- Produces (`casino-markup.js`):
  - `landingMarkup(view): string` (what it does, a `data-action="casino-create"` button)
  - `rollMarkup(view, state, heroesById, { control: boolean }): string` (five lane slots with `data-lane`, each `<div class="casino-reel">` holding the hero card; "No hero left in this pool" for `null`; the "Banned" list; the history; control buttons only when `control`)
  - `missingMarkup(view): string` (Review Focus 3: "This roulette does not exist or has expired" + the create button)

- [ ] **Step 1: Write the failing tests**
  - `"the routes: /casino is indexed, /casino/<id> is not and carries the id"` in `src/shared/routes.test.js` style: `matchRoute("/casino/Ab3dE5gH9k")` → `{ view: "casino-roll", casinoId: "Ab3dE5gH9k" }`, `matchRoute("/casino/short")` → not-found.
  - `"a spectator sees five heroes and no control"`: `rollMarkup(…, { control: false })` has 5 `.casino-reel`, no `data-action="casino-spin"`.
  - `"the creator sees spin, the lane ticks and Banned buttons"`: `control: true` → `data-action="casino-spin"`, 5 `input[name="casino-lane"]`, 5 `data-action="casino-ban"`.
  - `"an empty lane says so"`; `"hero names are escaped"` (a name `<img onerror>` stays text); `"the missing roulette offers to create one"`.

- [ ] **Step 2: Run, expect FAIL**: `node --test src/client/features/casino/casino-markup.test.js src/shared`

- [ ] **Step 3: Implement**; `show(app, null)` paints the landing; `show(app, id)` fetches `GET /api/casino/:id` and paints `rollMarkup` (or `missingMarkup` on 404). Server first paint: the landing only (`/casino`); `/casino/<id>` paints a skeleton.

- [ ] **Step 4: Run, expect PASS**, plus `node --test src/shared/view-modules.test.js src/server/platform/http src/architecture.test.js`, then `UPDATE_SNAPSHOTS=1` only for the new snapshot, read it before keeping it.

- [ ] **Step 5: Commit**: `feat(casino): the /casino pages and their place in the Play menu`

### Task 5: The creator's controls

**Files:**
- Create: `src/client/features/casino/casino-actions.js` (the actions), `casino-key.js` (the key), `casino-pools.js` (the pool editor markup and its filter)
- Modify: `src/client/app/lazy-actions.js` (add `casino-create`, `casino-spin`, `casino-ban`, `casino-unban`, `casino-pools-save`, `casino-pool-all`, `casino-pool-none`, `casino-copy-link`, `casino-copy-control`)
- Test: `src/client/features/casino/casino-key.test.js`, `casino-pools.test.js`

**Interfaces:**
- Consumes: Task 3 API, Task 4 markup and `show`.
- Produces:
  - `casino-key.js`: `readKey(id): string|null`, `saveKey(id, key): void`, `takeKeyFromHash(id, location, history): string|null` (reads `#key=…`, saves it, removes the hash with `history.replaceState`), `controlLink(id, key): string` (`${origin}/casino/${id}#key=${key}`). Storage key `casino-key:<id>`. `saveKey`/`readKey` fall back to an in-memory `Map` when `localStorage` throws (Review Focus 4).
  - `casino-pools.js`: `poolsMarkup(view, heroes, pools): string` (five columns, one checkbox per hero of that lane, "All"/"None" per lane, one search box filtering by name), `readPools(form): Record<lane, string[]>`.

- [ ] **Step 1: Write the failing tests**
  - `"the control link's key is kept and taken out of the address"`: fake `location.hash = "#key=abc"` → `takeKeyFromHash` returns `"abc"`, `readKey` → `"abc"`, `replaceState` called with the path and no hash.
  - `"the key lives in memory when storage refuses"` (Review Focus 4): a `localStorage` whose `setItem` throws → `saveKey` then `readKey` gives the key.
  - `"the pool editor lists a hero in each of its lanes and reads back what is ticked"`.
- [ ] **Step 2: Run, expect FAIL**: `node --test src/client/features/casino`
- [ ] **Step 3: Implement.** Every API call sends `X-Casino-Key`. A 403 drops the stored key, repaints as spectator and says "This control link is not valid" (Review Focus 4). Create → `saveKey`, `history.pushState` to `/casino/<id>`. The control link and the share link each have a copy button.
- [ ] **Step 4: Run, expect PASS**: `node --test src/client/features/casino src/client/app/lazy-actions.test.js`
- [ ] **Step 5: Commit**: `feat(casino): spin, respin, ban and the pools, for the creator`

### Task 6: Live view and reels

**Files:**
- Create: `src/client/features/casino/casino-live.js` (polling), `casino-reels.js` (animation)
- Modify: `src/client/styles/pages/casino.css` (reel keyframes, the `prefers-reduced-motion` override)
- Test: `src/client/features/casino/casino-live.test.js`

**Interfaces:**
- Produces:
  - `startLive({ id, fetchState: (since) => Promise<{status, body}>, onState: (state, previous) => void, every = 2000, doc = document, clock = { setTimeout, clearTimeout } }): () => void` (returns stop; skips ticks while `doc.hidden`; on `visibilitychange` to visible fetches at once; on 404 calls `onState(null)` and stops, Review Focus 3)
  - `spinReels(root, lanes: string[], heroesById, { reduced: boolean }): Promise<void>` (only the given lanes' `.casino-reel` move; resolves after ~1500 ms, at once when `reduced`; a new call cancels the running one and shows its final heroes)

- [ ] **Step 1: Write the failing tests** (fake clock and document)
  - `"it asks every 2 s with the version it has, and paints only a new version"`.
  - `"a hidden tab stops asking, and asks at once when shown again"` (Review Focus 5): hidden for 10 ticks → 0 calls; `visibilitychange` visible → 1 call immediately; the newer version is painted once, with `drawn` of that version only.
  - `"a roulette gone stops the polling and shows the missing page"`.
- [ ] **Step 2: Run, expect FAIL**: `node --test src/client/features/casino/casino-live.test.js`
- [ ] **Step 3: Implement**; `show` starts `startLive` for spectators and the creator alike (a second control device sees the first one's spins), stops it when the view changes. A new version spins only its `drawn` lanes.
- [ ] **Step 4: Run, expect PASS**: `node --test src/client/features/casino`
- [ ] **Step 5: Commit**: `feat(casino): the live view and the reels`

### Task 7: Translations, browser scenario, layout checks

**Files:**
- Create: `src/client/features/casino/casino.e2e.mjs`
- Modify: `src/translations/*` through the i18n tools; `scripts/dev/demo-data.mjs` (`demoPages` gets `/casino` and one seeded `/casino/<id>` so `contrast.e2e.mjs`, `layout-lint.e2e.mjs` and `hit-test.e2e.mjs` crawl them)
- Modify: `docs/HOW-TO.md` only if a recipe changed (none expected)

- [ ] **Step 1: Write the browser scenario** (`casino.e2e.mjs`, two browser contexts, no sign-in):
  - A creates a roulette from `/casino`, lands on `/casino/<id>`, spins: 5 heroes shown, all distinct.
  - B opens the share link: the same 5 names, no `[data-action="casino-spin"]`.
  - A ticks Mid only and respins: B shows the new Mid within 3 s; the other four unchanged in B.
  - A clicks Banned on Farm: the hero appears under Banned in A and B, Farm changes.
  - C opens the control link (`#key=`): the address has no hash afterwards and C has the spin button.
  - D opens a control link with a wrong key and clicks spin: "This control link is not valid", spectator view.
  - At 390 px wide, with motion allowed and with `reducedMotion: "reduce"`: no element overflows the viewport, and `hit-test` finds no covered control.
- [ ] **Step 2: Run, expect FAIL** before the translations and demo pages exist: `docker compose ps`, then `node src/testing/run-e2e.mjs casino`
- [ ] **Step 3: Translations**: `node scripts/i18n/sync.mjs`, a JSON of the new texts in the 15 languages, `node scripts/i18n/add.mjs <file>`, `sync` again; seed the demo roulette.
- [ ] **Step 4: Run, expect PASS**: `node --test src/shared/i18n.test.js`, `node src/testing/run-e2e.mjs casino contrast layout-lint hit-test ssr first-paint`, `npm run lint`, `node --test src/architecture.test.js`; then Lighthouse on `/casino` and one `/casino/<id>` (the session's recipe, VS Code closed for the mobile run), target 100.
- [ ] **Step 5: Commit**: `feat(casino): translations and the browser scenario`
