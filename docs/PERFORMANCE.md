# Performance

What was measured, what was found, what was changed, and what was left alone on purpose. Every number
below comes from a tool that is in the repository (section "Tools") and can be run again.

Revision 25 went through the owner's checklist one item at a time: cache API responses, load balancer,
database indexes, image compression, loading skeletons, expensive queries, N+1 queries, debounced
inputs, code splitting, CDN, server-side caching, pagination, Lighthouse, API payload compression,
unnecessary re-renders, minification, lazy loading, deferred scripts, unused dependencies, connection
pooling. The table gives the verdict for each; the sections after it give the evidence.

## Tools

| Tool                                               | What it does                                                                                                                                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/performance/api-probe.mjs`             | Fills a throw-away database with a large made-up data set, calls the real routes as a "busy" and as a "quiet" person, and reports time, SQL statements, bytes (raw, gzip, brotli) and cache headers. Runs EXPLAIN on every SELECT. |
| `node scripts/performance/input-probe.mjs [--burst]` | Types into the search boxes with the processor four times slower and reports the time one keystroke costs.                                                                                                                         |
| `npm run build`                                    | Bundles, splits, minifies and precompresses the browser code (`dist/`).                                                                                                                                                            |
| `scripts/performance/lighthouse-pages.mjs <folder>`  | Lighthouse (mobile and desktop) on every page of a built instance (see `docs/REPORT.md`, revision 18).                                                                                                                             |
| `src/testing/sql-recorder.js`                    | In a test: the list of SQL statements a piece of code ran, to pin their number.                                                                                                                                                    |

The probe's data set (scale 1): 3 000 people, 30 000 series (20 000 shares), 6 000 tier lists, 60 000
notifications, 100 000 security-log rows, 60 000 reflex runs, 30 000 notes, 600 teams, 20 000 team events,
6 000 scrim posts, 8 000 requests, 20 000 messages, 15 000 saved builds, 800 tournament series
(about 2 800 games). The "busy" person owns 60 series, has 15 shared with them, 250 notifications, 400
reflex runs, 150 notes and a team with 500 events; the "quiet" one owns 2 series. Times are the median of
5 requests after a warm-up, server and MySQL on the same laptop, so they are for comparing a version with
another, not what a visitor over the internet will see.

## The checklist

| #   | Item                       | Verdict                                                                                                                                                                                                                       |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Cache API responses        | **Done where it is safe.** Private data stays `no-store`. The catalogue and the hero list are stored but revalidated (ETag, 304); the popularity pages are public for a minute. An error is never cached. See "HTTP caching". |
| 2   | Load balancer              | **The application is ready; no balancer is deployed here** (no infrastructure to deploy to). Jobs are single-instance by lock, readiness drains, an nginx example is given and **has not been run**. See "Several instances". |
| 3   | Index the database         | **Done.** Two missing indexes found and added (migration 030); the real problem was two queries that no index could serve and that were rewritten. See "Database".                                                            |
| 4   | Compress images, no loss   | **Done** for the catalogue (revision 24: WebP q92, at most 256 px, three served sizes). The static folder holds no image worth touching (the social image is 66 KB, fonts are already WOFF2).                                 |
| 5   | Loading skeletons          | **Done** for the list pages (teams, history, popular, find a scrim, inbox, hero sheet, home, tournaments, notifications): shapes, announced to screen readers, still, with reduced motion.                                    |
| 6   | Cache expensive queries    | **Done** for the popularity pages (one computation per 30 s) and the tournament games; the catalogue was already cached (and its race fixed in revision 24).                                                                  |
| 7   | N+1 queries                | **Checked, one found and fixed** (the reminder loop asked once per event, every minute). No route repeats a statement for each row of a list (the probe now reports it and a test pins it).                                   |
| 8   | Debounce input handlers    | **Done where it costs**: catalogue filter and hero search (68 % and 75 % less work for a burst of typing). The searches that call the server were already debounced; the others cost under 20 ms a letter and were left.      |
| 9   | Split code into chunks     | **Already done** (esbuild splitting: one entry, 24 shared chunks, one chunk per lazy page). Verified.                                                                                                                         |
| 10  | CDN                        | **Not added** (it needs an account and a domain). The site is ready for one: immutable hashed files, no `Vary` on files and pictures, errors not cacheable. See "CDN".                                                        |
| 11  | Server-side caching        | See 6.                                                                                                                                                                                                                        |
| 12  | Paginate large lists       | **Checked: every list is paginated or capped.** No change needed. See "Lists".                                                                                                                                                |
| 13  | Lighthouse audit           | See "Lighthouse".                                                                                                                                                                                                             |
| 14  | Compress API payloads      | **Already on** (brotli/gzip above 1 KB, 7 to 9 times smaller on the big lists). Verified with the probe.                                                                                                                      |
| 15  | Unnecessary re-renders     | **Checked.** No render loop; the online-series poll now stops for a hidden tab. See "The browser".                                                                                                                            |
| 16  | Minify JS and CSS          | **Already done** (esbuild `minify`). Added: best-level brotli and gzip copies made by the build and served as they are.                                                                                                       |
| 17  | Lazy loading               | **Checked**: every list image is `loading="lazy"` with its size; one was missing and was added.                                                                                                                               |
| 18  | Defer non-critical scripts | **Already done**: the page paints from inline critical CSS, the scripts and the stylesheet are requested after the first paint. Verified.                                                                                     |
| 19  | Unused dependencies        | **None**: all 8 runtime and 7 development dependencies are imported somewhere.                                                                                                                                                |
| 20  | Connection pooling         | **Already there; now configurable** (`DB_POOL_SIZE`, `DB_QUEUE_LIMIT`, `DB_CONNECT_TIMEOUT_MS`). See "Connection pool".                                                                                                       |

## Database

**What the probe found** (first run, before any change): on 30 000 series, the page "Scrims" took 224 ms
for a person who owns two of them, and the statistics pages 180 ms for everybody. The cost followed the
size of the whole table, not the size of what the person owns: it would have been a second at 300 000
series. The cause was `WHERE owner = ? OR member IS NOT NULL` over a join: MySQL cannot use an index for
an `OR` across two tables and read every row of `series`. The same pattern was in the tier lists, the
statistics (`owner OR team_b`) and the request list (`from IN (subquery) OR to IN (subquery)`).

**The fix** is to ask the two index lookups separately and join their ids (`UNION` of
`series.owner_user_id` and `series_members.user_id`, then the PK join), and, for requests, to read the
person's staff teams first and give the lists to the query. No behaviour changes: tests compare what is
shown (`src/server/platform/database/query-performance.test.js`). The sort of the series list also gained the id as a
tie-break, so that two series saved in the same millisecond keep their place from one page to the next.

| Route (median ms, busy / quiet) | Before    | After   |
| ------------------------------- | --------- | ------- |
| Scrims list                     | 110 / 228 | 16 / 11 |
| Scrims list, summary view       | 120 / 228 | 12 / 9  |
| Tier lists                      | 44 / 42   | 11 / 8  |
| Overview (home)                 | 94 / 130  | 13 / 11 |
| Statistics: overview            | 202 / 182 | 7 / 6   |
| Statistics: heroes              | 191 / 187 | 9 / 9   |
| Requests                        | 20 / 11   | 12 / 6  |

(Final run of the probe, after all the changes of the revision.) EXPLAIN flagged 11 statements before and 3 after. The 3 left are explained, not hidden: the scrim post
list (7 ms; the optimizer reads the table because 47 % of the made-up posts are open, with real data the
index `(closed, ends_at)` applies) and the team directory (3 ms for 600 teams, sorted by name). Nothing else reads more than 5 000 rows.

**Two indexes** (migration 030, additive):

- `team_events(starts_at)`: the reminder loop runs every minute and asks "which events start in the next
  six hours", all teams together. The only index began with the team, so it read the whole table
  (20 311 rows) and, because the query ends in `FOR UPDATE`, locked every row it read. It now reads the 88
  events of the window.
- `scrim_requests(awaiting_team_id, status)`: the menu badge "requests waiting for your answer" is counted
  on every page. It read every request of the site (8 383 rows); it now reads 13.

Three more came from reading the SQL (migration 031, below).

**Reading the SQL.** The probe only exercises what it calls, so a second reader (a helper agent, read
only) went through every SQL statement of the server (427) against the real index list, looking for what
scales with the size of a table: `OR` across tables, `LIKE '%x%'`, sorts without an index, big columns in
lists, a query per row, locks over scans, cascades. Result, each point checked in the code before acting:

- **Accepted and fixed** (migration 031, measured on 150 000 users, 120 000 reflex runs and 120 000
  notifications): `users(is_guest)` (the hourly purge of guests read all 149 094 users and locked them
  while it ran; plan `ALL` → `ref`, it reads the 1 500 guests), `reflex_runs(user_id, exercise, score)` (best
  score and number of runs of a player: 21.6 → 3.5 ms for 20 000 runs, answered from the index alone) and
  `notifications(user_id, created_at)` (the list sorted every notification of the person to keep fifty:
  70 → 1.9 ms). Also the games of the popularity pages are now kept per month instead of per date chosen by
  the visitor (a loop over the calendar could fill the memory with copies of the table), and a stuck
  computation can no longer block a cache key for everybody (`maxWaitMs`).
- **Rejected, with the reason.** "Drop `FOR UPDATE` from the reminder query": the 0.7 s of locks per minute
  were extrapolated from the backlog run; a quiet minute measures 7 ms and 2 statements, and the claim of
  each reminder is decided by what was read under that lock (changing it is a change of logic in code that
  sends messages, for a gain that is not measured). "Two ordered branches for the request list": EXPLAIN
  already shows an index merge on a handful of rows.
- **Known, not done.** The team search is `LIKE '%q%'` on the name (fine up to some tens of thousands of
  teams, then a FULLTEXT index); the reflex submission runs about one statement per goal and per team the
  player belongs to (a few dozen at most); the admin list of reports reads 1 + 100 statements; purges have
  no `LIMIT`. And one thing the probe could not show: its series are empty documents (0.3 KB), a finished
  best-of-5 is 15 to 20 KB, so `GET /api/series?pageSize=100`, which every page preloads, is 100 times
  heavier for an active account than the table above says. The next step there is the `summary` view for
  lists (the client keeps full documents today).

**N+1.** The probe counts the statements of each request and lists any that runs three times or more
inside one request; the "busy" and the "quiet" person must cost the same number of statements (the
first request of a minute also pays for the caches). One place repeats a statement: the catalogue reads
the tags of items, arcana and heroes with the same SELECT three times (once per kind, at most every
30 s): constant, not per row. The only per-row loop found was the reminder loop (below).

**Periodic jobs** are in the probe too (they run on timers, so no route reaches them). The reminder loop
asked "what did I already send for this event" once per event, every minute, even when nothing was due:
one query for the whole window now (`src/server/platform/database/query-performance.test.js` pins one lookup for five
events). The probe runs each job twice, the first time on a backlog (everything made up is due) and the
second time as every following minute would: reminders 770 ms and 450 statements before, 474 ms and
266 statements after on the backlog, and **7 ms and 2 statements** for a quiet minute; the weekly digest
3 ms; the hourly purge 0.7 s the first time (75 000 expired security-log rows), 30 ms after.

## HTTP caching

The default for `/api` and `/auth` stays `no-store`: private data is never stored. Five things changed,
each in `src/server/platform/http/cache-control.js` and called only once the answer is known to be good:

- `GET /api/catalog` is `public, no-cache`: a browser or CDN may keep it but asks again every time; the
  ETag turns that into a 304 while nothing changed, and a staff edit is seen at once (tested).
- `GET /api/heroes` and `/api/backgrounds` are `private, no-cache` (they depend on the language).
- `GET /api/popular/drafts` and `/heroes` are `public, max-age=60, stale-while-revalidate=300`.
- Pictures, scripts and styles no longer carry `Vary: Accept-Language, Cookie` (the global default added
  for the pages and the API). On a picture or a script it made a browser forget its cached copy each time
  the visitor logged in or changed language, and a CDN keep one copy per visitor. Pages and the API keep
  it, except the two public answers above (the catalogue and the popularity pages), which are the same
  for everybody.
- A public answer never carries a session cookie. The identity middleware renews the cookie of a session
  that is more than an hour old on ANY request, public ones included; a shared cache that kept that
  `Set-Cookie` would give one person's session to the next visitor. `sameForEveryone` removes it (tested:
  a private route still renews an old session, the public ones do not).
- The error handler now sets `Cache-Control: no-store` on every error. The picture routes announce
  `public, max-age=31536000, immutable` _before_ they build the picture, so a failure used to be sent with
  that header (tested with a corrupted picture).

Note for anyone testing revalidation: Node's `fetch()` adds `Cache-Control: no-cache` to a request that
carries `If-None-Match` (the Fetch standard does), which Express reads as a forced reload and answers with
a full 200. Use `node:http` (the tests do), or a real browser.

## Server-side caching

`src/server/platform/cache.js` (`createTtlCache`): entries expire, the least recently used goes past a limit
(a visitor cannot grow it with new query strings), people asking for the same thing at the same time share
ONE computation, a failure is not kept, and `clear()` also forgets the computations in flight (a read that
began before a write is not stored after it). Used by the tournament store: the games, the summary and
the popularity pages for 30 s, dropped by any tournament write. Measured on 2 800 games, with answers of
the same length (the probe asks for different end dates): a request that has to compute costs 16 ms
(drafts) and 32 ms (heroes, 168 KB of JSON) of the one thread, one that finds the answer kept 13 and
16 ms (what is left is serialising, hashing and compressing the answer). So the memory halves the work
of the heroes page and makes it independent of the number of visitors; for the drafts page the gain is
small, the aggregation was cheap. `src/server/platform/http/http-caching.test.js` counts the computations, and the
`Cache-Control: public, max-age=60` below means that a browser does not even ask for a minute.

Limit: the cache belongs to one process. Behind a balancer each instance has its own, so a tournament edit
is seen at once on the instance that took it and within 30 s on the others.

## The browser

- **Debounce** (`src/client/lib/debounce.js`): `scripts/performance/input-probe.mjs` types into each search
  box with the processor four times slower, on an idle machine. One letter costs 49 ms in the catalogue
  filter (the whole page is redrawn), 27 ms in the hero search (110 cards hidden and shown), 8 ms in the
  build lab. A burst of 12 letters typed at once, work done on every letter against now: catalogue
  376 → 120 ms, heroes 377 → 93 ms. Those two now wait 150 and 120 ms for a pause; the state is updated
  at once (a click on a lane chip reads the typed text), only the drawing waits. The build lab search
  (8 ms) and the ones that call the server (already debounced at 250 ms) were left. A browser test counts
  the redraws of a burst (1, not 8) and fails when the wait is taken out.
- **Skeletons** (`src/client/lib/skeleton.js`, `styles/components/skeleton.css`): rows, cards or a page head
  where the content will be, announced once (`role="status"`), hidden from screen readers otherwise,
  motionless with the reduced-motion setting, never scrolling the page sideways (browser test). Each one
  keeps the `loading-line` bar: hydration and the pre-renderer recognise a page that is still waiting by it.
- **Lazy loading**: hero, item, arcana and map pictures in lists are `loading="lazy" decoding="async"`
  with their width and height; hero banners use `srcset`. One 52 px picture was missing the attribute.
- **Re-renders**: pages redraw on a state change only; the online-series poll compares versions and
  redraws only when the version changed. It now also skips the tick of a hidden tab. The other timers
  (inbox, home carousel, badges) already checked visibility.
- **Scripts**: the first paint needs no script. `src/server/platform/http/first-paint.js` requests the stylesheet,
  the entry module (`modulepreload`) and the API calls of the page right after the first contentful paint.
- **Chunks and minification**: `scripts/build/build.mjs` builds one entry (112 KB), 24 shared chunks and the
  lazy pages with esbuild (`splitting`, `minify`, names hashed by content). It also writes a `.br` (level 11) and a `.gz` (level 9) copy next to every script and style, and `src/server/platform/http/assets.js`
  serves them as they are: entry script 114 KB → **30 KB** (the server's own quick brotli gave 35),
  stylesheet 158 KB → **26 KB** (32), no compression work per request. Brotli is preferred whatever the
  order of the visitor's header (browsers list gzip first).
- Not done, measured: the 15 language catalogues (`public/locales/*.js`, 146 to 235 KB, 40 to 53 KB
  compressed) are compressed quickly on the fly; the best level would save 7 to 12 KB per visit in
  another language than English. They are not content-hashed, so a precompressed copy could go stale;
  left for a hashed-name change.

## Lists

| List                                   | Bound                                                                |
| -------------------------------------- | -------------------------------------------------------------------- |
| Series, tier lists, teams, scrim posts | `page` / `pageSize` (50 or 100 at most, depending on the list)       |
| Tournaments, translations (admin)      | `LIMIT ? OFFSET ?`                                                   |
| Notifications, requests                | `LIMIT 50`, `LIMIT 100`                                              |
| Training notes                         | 300 per person (checked on insert), `LIMIT 300`                      |
| Saved builds, share links, focus       | a count checked on insert                                            |
| Team events                            | 500 per team (checked on insert) and a window (60 days, 366 at most) |
| Agenda of a person                     | a window (62 days by default, 366 at most)                           |
| Reflex runs                            | `LIMIT 400`                                                          |
| Popular drafts and heroes              | the 20 best                                                          |

The probe confirms the biggest answers are the "busy" person's agenda (101 KB, 15 KB compressed), team
events (62 KB, at the cap of 500), notes (63 KB) and their space (78 KB): bounded by the rules above, and
5 to 9 times smaller on the wire.

## Connection pool

`mysql2` pool, `waitForConnections: true`, 10 connections by default, TCP keep-alive on (mysql2's
default). New: `DB_POOL_SIZE` (1 to 100), `DB_QUEUE_LIMIT` (0 = unlimited; above 0 a request fails at once
when that many are already waiting instead of waiting behind a database that does not answer) and
`DB_CONNECT_TIMEOUT_MS`. A value that makes no sense falls back to the default, never half-applied.
Behind a balancer: instances × `DB_POOL_SIZE` must stay under MySQL's `max_connections` (151 by default).
A request needs 2 to 11 statements, a few milliseconds of database time in all (probe), and one Node
process computes one request at a time, so ten connections are rarely all busy. This has not been
measured under concurrent load here. The advisory locks of the jobs (`store.runExclusive`, and the
translation one) live on a connection of their own, NOT on one of the pool: a job that held a pooled
connection for minutes while it needs the pool itself (the roster sync reads and writes the heroes) would
have starved it, for good with `DB_POOL_SIZE=1` (found by the review, tested with a pool of one).

## Several instances (load balancer)

Audited for what breaks when two copies of the server run behind a balancer:

| What              | Behind a balancer                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sessions          | In MySQL: any instance can serve any request. **Fine.**                                                                                                                                                                                                                                                                                             |
| Uploads, pictures | In MySQL. **Fine.** (`PORTRAIT_CACHE_DIR` is only a cache of Camp portraits; each instance fills its own.)                                                                                                                                                                                                                                          |
| Secrets           | `MFA_ENCRYPTION_KEY` must be the **same** on every instance (it is required in production).                                                                                                                                                                                                                                                         |
| Scheduled jobs    | Every instance has the timers. The hero roster sync and the hero sheet crawl now take a MySQL advisory lock (`store.runExclusive`): one instance at a time asks Camp. Translation was already locked (one process translates, so the daily quota is not spent twice). Reminders are safe (`FOR UPDATE` + `INSERT IGNORE`), the purge is idempotent. |
| In-memory caches  | Per instance: the catalogue and tournament caches (30 s), the pre-rendered pages (10 minutes), the image variants. A write is seen at once by the instance that took it, within that delay by the others.                                                                                                                                           |
| Rate limits       | In memory **per instance**: with N instances the limits are N times looser. Make the balancer send a client to the same instance (`ip_hash` below), or accept it. Set `TRUST_PROXY` so the client address is the real one.                                                                                                                          |
| Health            | `GET /api/health/live` (process) and `GET /api/health` (MySQL answers, and **503 once the instance is leaving**).                                                                                                                                                                                                                                   |
| Rolling deploy    | `SHUTDOWN_DRAIN_SECONDS=8`: on `SIGTERM` readiness turns 503 at once and the server keeps listening for 8 s, so the balancer has moved on before connections close. `docker-compose.yml` gives the container `stop_grace_period: 30s` (drain + the 10 s of patience are more than Docker's default 10 s before it kills the process).               |

An nginx example (**written from the nginx documentation and not run here**; test it with `nginx -t`):

```nginx
upstream hok {
    ip_hash;                       # same client, same instance: keeps the per-instance rate limits meaningful
    server 10.0.0.11:3000 max_fails=2 fail_timeout=5s;
    server 10.0.0.12:3000 max_fails=2 fail_timeout=5s;
    keepalive 32;
}
server {
    listen 443 ssl http2;
    server_name example.org;
    # ssl_certificate ... ssl_certificate_key ...

    location / {
        proxy_pass http://hok;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_next_upstream error timeout http_503;   # a draining instance answers 503
    }
}
```

With the application behind it: `TRUST_PROXY=1`, `APP_ORIGIN=https://example.org`, `COOKIE_SECURE` left on.
For active checks use `GET /api/health` (nginx Plus, HAProxy, a cloud balancer).

## CDN

Not added: it needs an account, a domain and DNS. What a CDN needs from the origin is there:

- `/dist/*`: content-hashed names, `public, max-age=31536000, immutable`, no `Vary` on cookie or language,
  precompressed copies. Cache by URL, ignore cookies.
- `/catalog-images/*`, `/avatars/*`, `/team-logos/*`, `/training-maps/*`, `/media/img`: the same.
- `/fonts/*`, `/icons/*`: one year, immutable.
- `/api/*`, `/auth/*`: do not cache (private data), except `GET /api/popular/*` (60 s) if you want to.
- HTML pages: `Vary: Accept-Language, Cookie`, so a CDN should pass them through (or be told to cache by
  the language cookie only).

## Lighthouse

Run of the whole site (`scripts/performance/lighthouse-pages.mjs`, production build, the instance of the
demonstration data, 64 pages, mobile and desktop = 128 reports) and a second run, alone, of the pages
that were low or touched by a fix.

- Desktop: **performance 100 on 64 of 64 pages**, accessibility 100 everywhere, best practices 96 on the
  two hero sheets (as in revision 18), SEO 100 except the pages that are deliberately not indexed (69, 61).
- Phone: accessibility 100 and best practices 100 (96 on the 404 page and the admin hero sheet) everywhere;
  performance 100 on 34 pages, 90 to 99 on the others (simulated LCP of 2.6 to 2.8 s on the draft pages,
  total blocking time on the pages with 800 or more elements). Worst layout shift: 0.002 after the fix.
- **A real defect found and fixed:** the page of a series whose clock had run out (`draft-complete-result-form`)
  scored 83 with a layout shift of 0.2. The server only moves a draft on when somebody asks; the page drew
  the old state, asked, then drew again, and the whole board moved. It now asks before its first drawing
  (`settleActiveSeries`; browser test `draft-settle`: the request goes out before the board is drawn, and
  the test fails without the fix). Second run: 96, shift 0.002.
- **Two scores that were measurement noise:** `visitor-build-lab` 77 and `visitor-history` 90 had a total
  blocking time of 1 057 and 393 ms while helper agents were reading files on the same machine; alone, 99 and 99
  (TBT 126 and 108 ms). Lesson: run Lighthouse with nothing else on the machine, and rerun any outlier alone.
- Compared with revision 18 (REPORT, "Lighthouse page par page"): the draft pages are 95 to 97 (96 then),
  the visitor hero sheet 93 (95 then, TBT 308 ms: one of the two lowest, 812 elements to draw), everything
  else equal or within 1 point. I did not find a regression caused by this revision's changes; the figures
  are one run each, and Lighthouse varies by a point or two between runs.

### Revision 29: the redesigned pages

Run of the whole site again (`scripts/performance/lighthouse-pages.mjs`, production build, the demonstration instance, 34 pages, mobile and
desktop = 68 reports), after the fixes below, with nothing else running on the machine.

- **Desktop: performance 99 to 100 on 34 of 34 pages** (worst layout shift 0.011, total blocking time 0 to 6 ms), accessibility 98 to 100,
  best practices 100 (96 on the 404 page: the browser logs the 404 of the page itself, which is what that page is), SEO 100 on the public
  pages and 61 to 69 on the pages that are deliberately not indexed (the account and staff pages, the 404).
- **Phone, the pages a visitor opens (the ones the server draws): performance 97 to 100 on 16 of 16** (largest paint 1.2 to 1.7 s, total
  blocking time 13 to 200 ms), accessibility 98 to 100 (the 98s are two heading-order defects, fixed after the run and now held by
  `src/client/styles/contrast.e2e.mjs`; build lab 95 before its tab list was fixed).
- **Phone, the pages of a signed-in person or of the staff (not drawn by the server: their first screen needs the scripts and the person's
  data): performance 86 to 100.** Nine are at 99 or 100, four at 93 to 98, and five lower: training 86, series in progress 88, reports 89,
  settings 90, space 90. What costs the points there is the largest paint (3.0 to 4.0 s on the simulated slow phone, the content only exists
  once the scripts and the data have arrived); total blocking time is 31 to 251 ms. Not fixed: the way to a better score is to draw something
  of those pages before the data arrives, or to draw them on the server for a person, which is a design change of its own.
- **Where the points were, found with Chrome traces (processor slowed 4 times).** On the visitors' pages the phone scores were 86 to 99 before the
  fixes (hero sheet 86, build lab 88), 96 to 100 after, from three causes: the server inlined the whole stylesheet in every drawn page (a
  document of 380 KB: now 83 to 197 KB, see ARCHITECTURE, "The first paint of a page the server draws"); the web-font faces sat in a stylesheet
  loaded after the first paint, so the browser laid the whole page out a second time when the preloaded fonts were applied (387 ms at 4x on the
  home page: the faces are now in the critical CSS); and the client rewrote `lang`, `dir` and `data-theme` on `<html>` at start-up even when they
  had not changed, which restyles the whole page (only a change is written now). How to measure the same way: `scripts/performance/trace-load.mjs`
  (`--why` names the functions that invalidate style); it takes the minimum of five runs, the median of three was useless (114 to 460 ms for the same page).

### Revision 29, evening: all 48 pages, after the layout fixes of the day

Run of the whole site (`scripts/performance/lighthouse-pages.mjs`, production build, the demonstration instance, **48 pages**: 21 that a
visitor opens, 21 of a captain, 6 of the staff; mobile and desktop = 96 reports), with nothing else running on the machine, after the
fixes of the day (the sheet of the pieces on a phone, the banner of the home page, the welcome pages with reduced motion, the keyboard order
of the shell, the guide editor's picker, the pool of the ratings, the top bar of a small phone: see DECISIONS, revision 29).

- **Desktop: performance 99 to 100 on 48 of 48** (largest paint 0.3 to 1.0 s, worst layout shift 0.012, total blocking time 0 ms),
  **accessibility 100 on 48 of 48**, best practices 100 (96 on the 404 page: the browser logs the 404 of the page itself), SEO 100 on the public
  pages and 61 to 69 on the pages that are deliberately not indexed (the account and staff pages, the 404).
- **Phone: accessibility 100 and best practices 100 on 48 of 48** (96 on the 404 page). Performance: **35 pages at 98 to 100** (24 at 100), every
  page a visitor opens included (the ones the server draws: largest paint 1.4 to 1.7 s, total blocking time 38 to 166 ms); **13 pages at 88 to 95**,
  all of them pages of a signed-in person or of the staff, which the server does not draw: tournaments 95, history (captain) 94, scrims (captain)
  94, shared space 94, reports 93, space 93, guides editor 92, settings 92, training notebook 92, training scenarios 91, series in progress 90,
  live draft 89, training 88. Worst layout shift 0.023, worst total blocking time 228 ms (live draft).
- **Against the first run of the day** the five lowest pages gained 2 to 4 points: training 86 to 88, series in progress 88 to 90, reports 89 to 93,
  settings 90 to 92, space 90 to 93 (the page chunk is preloaded with the HTML, and the shell no longer rewrites `<html>` at start-up).
- **What the 13 pages wait for.** Their largest paint is a line of text (a sentence, the timer of the draft) that only exists once the scripts and
  three levels of requests have come back: the preferences of the person and the community summary, then the data of the page, then the cards of
  the heroes it shows. The same page, measured without throttling, paints its text 0.35 to 0.41 s after the first byte; the 2.9 to 3.7 s are the
  simulated slow phone (4x slower processor, 150 ms round trips). Not changed: the way to gain the last points is to start the data of the page
  together with the preferences instead of after them (one round trip fewer in the simulation) or to draw the page on the server for a person.
  Both touch how every page loads its data and read the preferences, so they are a change of their own, to be made with the browser tests of all
  the pages at hand, not at the end of a day of fixes.
- **No defect left in this run:** accessibility 100 everywhere, no layout shift above 0.023, and the contrast, hit and first-paint browser tests
  (`src/client/styles/contrast.e2e.mjs`, `hit-test.mjs`, `first-paint.mjs`) pass on the same 48 pages.

### Revision 30: loading in one wave, frames for signed-in people, all 48 pages (12 October)

Run of the whole site (`scripts/performance/lighthouse-pages.mjs`, production build, demonstration instance, 48 pages, mobile and desktop = 96 reports), nothing else on the machine, one run.

- **Desktop: performance 100 on 45 of 48** (99 on the live draft, the series in progress and the space), accessibility 100 on 48 of 48, best practices 100 (96 on the 404 page only: the browser logs the 404 of the page itself; the game data pages were 96 for a square picture drawn in a 62 x 88 box, fixed), SEO 100 on the public pages and 61 to 69 on the pages that are deliberately `noindex`.
- **Phone: performance 100 on 25 of 48, 98 or 99 on 19 more** (the differences are total blocking time of 90 to 160 ms, which moves by a point or two from one run to the next), accessibility 100 on 48 of 48. **Four pages stay lower: the live draft 88 and the series in progress 89** (the largest paint is the clock of the board, 3.2 s simulated: the board has no frame, it only exists once the series is there), **training 92** (total blocking time 331 ms: the list of 120 heroes and the notebook are drawn in one go) and **scrims of a captain 93** (largest paint 2.3 s simulated). Before this revision the phone had 13 pages at 88 to 95; the pages that gained are the public game data (items, arcana, spells, popular: now drawn by the server) and every page a signed-in person opens (a frame, or the boot loader again).
- **What did not work, measured and removed.** Starting the pages the server does not draw with static `preload` and `modulepreload` tags instead of the boot loader looked faster on a real connection, but the preloads share the bandwidth with the first paint: in the simulation the first contentful paint went from 0.8 s to 2.2 s and 16 pages dropped from 97–100 to 92–94. Back to the boot loader (97–100 again on the six pages re-measured). **A frame must be checked by looking at it:** the guide editor of a hero had a layout shift of 0.25 because its first-paint pack lacked the workspace sheet (the frame was drawn unstyled for a moment, then moved when the whole stylesheet arrived); the frames test checked the heading only. The pack is fixed (0.002), and the catalog and the official ratings have no frame (their page draws nothing before its data).
- **What is left to reach 100 everywhere on a phone**: a frame for the draft board (the clock, `#draft-timer`), lazy-loading the 135 KB chunk shared by home, tier lists, scrims, heroes and history (their handlers are global, so it is a delicate change), and drawing the list of heroes of the training in slices. None of them is a defect for a person: the content is on the screen in under 1.5 s measured without throttling.

## Not done, on purpose

- No CDN, no deployed balancer, no Redis (rate limits and caches stay per process, written down above).
- No statement timeout on the database (`max_execution_time`): nothing measured needs it, and a limit that
  is too low would fail a legitimate export.
- The language catalogues are not precompressed (see "The browser").
- The scrim post list is not "fixed": the plan is right for the made-up data.

### Revision 31: the mobile pages under 100 (12 October)

Asked for by the owner. Method: CPU profile at 4x slowdown and traces of the pages that stayed under 100, then one change at a time, measured with the same tool as before (`lighthouse-pages.mjs --presets=mobile --only=…`), production build, demonstration instance.

- **The draft room has a frame.** `live` (88) and `series-live` (89) were bound by the largest paint, the clock `#draft-timer`, which only exists once the series is there (3.2 s simulated). A signed-in person who opens a series whose game is in progress (or `/live`) now receives the room drawn: both sides with their bans and picks, the clock, empty; the real board takes it over without replacing it (same nodes). The largest paint is now the clock at 1.6 s simulated.
- **Intl formatters are cached** (`src/shared/i18n.js`): the profile showed the number and date formatting as the first function of the page's own script time (a new `Intl.NumberFormat` for every number drawn).
- **Guide editor**: the list of 120 heroes is no longer drawn twice at start, and opening a hero moves a mark instead of drawing the list again.
- **Draft pool**: `content-visibility: auto` on the 120 hero cards (what is out of the scrolled box is neither laid out nor painted).
- **Result of the whole run again (48 pages, phone, one run)**: **performance 100 on 28 pages** (25 before), 98–99 on 18, 94–97 on 2; the lowest are `live` 94 and `spells` 97 (the others of the four that were low: series in progress 98, training 99, scrims of a captain 99, guides 98). Accessibility 100 on 48, best practices 100 on 47 (the 404 page, 96, by design). The measure moves by one or two points from one run to the next: **`live` swung between 90 and 96** over four runs, because on the demonstration data the clock of the draft is already out when the page opens, the server moves the game on, and the board then moves once (a layout shift of 0.09 in one run in two, 0.01 in the others).
- **What did not work, measured and left out**: removing the module preloads (no gain in total blocking time); looking for one cause of the first layout (about 40 ms unthrottled for the 560 elements of the home page, the same cost whatever is removed: fonts, SVG, images, buttons, forms, `text-wrap`, `letter-spacing`, `hyphens`, the export dialog, `content-visibility` on the home grid); none of them moved it.
- **Left at 98–99**: pages whose total blocking time is 70–200 ms, which is the first layout and the first script run on a processor 4 times slower. They cannot reach 100 without drawing fewer elements on the first screen. None is a defect for a person (the content is on the screen in under 1.2 s measured without throttling).

### Revision 45: pictures and animations (25 October)

- **The 404 page lost its `noindex`.** A real 404 is not indexed by a search engine, so `noindex, nofollow` on it was redundant and failed Lighthouse's `is-crawlable`. Measured on `not-found`, phone and desktop: **SEO 92 (was 61)**, best practices 96 (the browser logs the 404 of the page itself); the rest of the lost points is the HTTP status code, which is the price of a real 404.
- **Hero pictures are enlarged by the server, not by the browser.** Camp's hero icons are 128 px square and the cards draw them 1.3 to 3.5 times larger (3:4, `object-fit: cover`), which the browser does with a bilinear filter. `/media/img` now enlarges a source of 256 px or less by at most 2.5 (Lanczos 3, then a light sharpening) and never enlarges a large one; WebP quality 84 up to 480 px wide, 78 above, chroma kept. The recipe number (`PICTURE_RECIPE`) is in every picture address (`&v=2`) and in the key of the copy on disk, so a change of recipe is a new picture even though the pictures are served `immutable`. Cost in bytes: a 160 px icon 9 to 11 KB, a 640 px cover 24 to 29 KB (+20 %). **Lighthouse cannot see this**: the demonstration instance uses the test image proxy (a one-pixel PNG).
- **The live draft no longer animates layout.** At idle (nothing touched, CPU x4, headless, software rendering, so relative numbers), the main thread of the live draft was busy 3 804 ms in 5 s on desktop and 2 223 ms on a phone profile; ordinary pages sit at about 1 ms. The clock bar transitioned its `width` (restarted every second, so a layout every frame) and the slot to play pulsed a `box-shadow` for ever. The bar is now a `transform: scaleX()`, the pulse and the flash of a taken slot are layers of which only the opacity changes: **308 ms and 242 ms (-92 % and -89 %)**, scroll and pointer 95th percentile 17 ms.
- **Left as they are, measured as small**: the skeleton `shimmer` (moves a background), `glowPulse` (drop target of the tournaments, `box-shadow`), `edge-fade` (scroll-driven mask), `backdrop-filter` on the top and tab bars, 19 implicit `transition: <time>` rules.
- **Lighthouse after these changes, 25 of the 48 pages** (the run was stopped by the system for lack of memory and not started again): desktop performance 100 on 25 of 25; phone 100 on 23 of 25 and 99 on `hero-sheet` and `series-live` (as before: first layout and script on a processor 4 times slower); accessibility 100 everywhere; best practices 100 except `not-found` 96; SEO 100 except `not-found` 92. The 23 pages not measured (mostly signed-in pages: `live`, `agenda`, `training*`, `space`, `settings`, `account`, `guides`, `tournaments`) are to be measured again alone on a quiet machine.

### Revision 46: a frame regression of revision 45 found by Lighthouse, smoothness measured page by page, the skeleton on a layer (25 October)

- **Regression found and fixed: the server drew the frame of a signed-in page in 5.6 s instead of 0.6 s.** The 23 pages that revision 45 had not measured came out at 85 to 92 on a phone for 8 of them (`training` 85; `guides`, `training-notebook`, `training-scenarios` 88; `history-captain` 89; `space`, `reports` 90; `tournaments` 92; revision 31 had them at 98–99), and the "server response time" audit of the first request was 3 512 to 3 566 ms on 11 pages (the same value within 50 ms: a capped wait, `waitMs = 3500` in `prerender.get`) against 8 ms for the next measure of the same page. The first request got the plain shell, the next one the frame. Cause: since `a825e6b` `html[data-ready]` means "the page of the address is drawn", and the server-side render of a frame waited for that flag, while a frame holds back every request for data (`frameAnswer`): the flag only came with the client's own limit (`READY_LIMIT_MS`, 5 s). Cold first request of 13 signed-in pages on the demonstration instance: 2.8 to 3.5 s waiting for a shell, frame served 1.1 s later (render 5.6 s) before; **0.6 to 0.7 s with the frame served, page sizes unchanged (88 to 240 KB), after**. A frame is now taken once its heading is drawn (what the comment in the code already said). The render also had 0.4 s of margin under the 6 s limit of a frame: a cold timed render took 7.4 s, which fails and leaves the page without a frame for 5 minutes. `frames.e2e.mjs` could not see it (it asks again up to ten times, 1.5 s apart); the unit test `what a render waits for` pins the two wait conditions.

- **Every page, measured for frames.** Headless Chromium, CPU x4, software rendering (relative numbers, not the frames per second of a real phone): `requestAnimationFrame` on the main thread during the entrance, at idle for 3 s, and while scrolling, 48 pages, desktop and phone, direct load. Nearly everything sits at the 17 ms frame (the 60 Hz ceiling) through entrance, idle and scroll; ordinary pages keep the thread busy 85 to 300 ms per 3 s at idle. The live draft pages (`series-live`, `live`) stand out at 520 to 610 ms per 3 s (a metric that counts every thread), but the main thread is only about 5 % busy there (211 ms in 4 s in a trace) and every infinite animation left on them is compositor-only (`pulse`, `dr-pulse`, the clock bar's `transform`).
- **The skeleton light slides on a layer.** `.skeleton` moved a `background-position`, which the main thread repaints on every frame for every placeholder on the page. It is now a `::after` that moves with `transform` (the placeholder clips it, `overflow: hidden`; mirrored in `rtl`; paused by `.is-quiet`). `skeleton.e2e.mjs` checks the layer itself, not only that reduced motion stops it (it used to pass for nothing there).
- **`glowPulse` removed: it drew nothing.** Sampled across its duration in a browser, its `box-shadow` stays `rgba(0, 0, 0, 0)` the whole way (the keyframes go from no shadow to a transparent colour), so the drop target of the tournaments never showed a halo, but it forced a paint on every frame while a hero was dragged. The brand-coloured border is what shows the target and stays.
- **19 bare `transition: <time>` rules name what they animate.** `--fx` in `tokens.css` (colours, border, shadow, opacity, `transform`; the team lanes add `filter`). A bare duration transitions every property, layout ones included; none of these rules animated anything else.
- **Measured and left as they are.** `backdrop-filter` on the bars: phone scrolling, alternated twice with and without it, same results within the noise (`series-live` 9 then 7 long frames with, 7 and 7 without). `edge-fade` (scroll-driven mask): 16.8 ms per frame with and without it on strips forced to overflow.
- **Not fixed: entering a heavy page by a click.** In-app navigation is the only place the `.is-entering` cascade runs (a server-rendered first load uses `.ssr-first`, animation durations 0). The main thread stays busy for 1.5 s after the click on `series-live` (1 905 ms, 6 frames over 50 ms, the worst 817 ms), `live` (1 541), `training` (1 308), `guides` (1 217), `hero-sheet` (1 162) and `history-captain` (1 042); other pages 200 to 750 ms. A trace of those entries: layout 580 ms, style 350 ms, paint 320 ms, script 17 ms. Removing one CSS family at a time and tracing the same navigation (balanced wrapping, filters and blurs, containment and `content-visibility`, animations and transitions, container queries, shadows and masks) gave 2 236 to 2 289 ms every time against 2 287 and 2 289 for the baseline, so none of them is the cost. It is the pages: 1 300 to 2 000 elements, 1 100 to 1 400 of them in a grid of 120 hero cards (9 elements per card, already one HTML parse and `content-visibility: auto`). Going lower means drawing only the visible cards (a windowed grid), a structural change that was not made.
- **Cover art for the cards: tried on paper, not used.** A montage of 12 heroes taken along the roster (server-enlarged icon, cover cropped 3:4 at the draft's focal point, centred crop) shows close-up faces on the icons and a tiny face in a busy composition on the covers, some of them cut by the crop. Covers weigh 40 to 637 KB, are 750 x 422 or 1275 x 718, and exist only in each hero's own sheet (one request per hero to fill a grid of 120). The live draft already uses them where they pay off (`pk-cover` in the pick slots).
- **Camp sheet sync no longer waits 30 s per silent hero.** `stall-guard.js`: after 3 silent heroes in a row a fresh page is opened, after 9 the run ends with an error and the next scheduled pass takes the rest; an answer, an HTTP error included, resets the count. Before, `ru` (81 of 85), `tr` (73 of 77) and `zh` (47 of 94) each waited the 30 s `waitForResponse` timeout for every remaining hero while holding the sync lock, close to three hours; the visitor-driven refreshes queue behind that lock. The failures follow the hour, not the language (the same languages read at about 1.5 s per sheet on a quiet host and 6 of 6 in 27 s in the container), and the container's server-side renders failed in the same hours. A slow page could also reject a `waitForResponse` nobody was awaiting yet (two `unhandled promise rejection` lines in the log); it now has a handler.
- **Slow site reported by the owner during this work (15:05 local): two causes, one fixed in the code, one that I caused.** (1) The container had just been restarted on the old image: server render warm-up (visitor pages in 15 languages, frames for signed-in people at 5.6 s each with the defect above) and the Russian Camp resync with its 30 s wait per silent hero; meanwhile a hero page answered 500 (`/api/heroes/192`, "The computation took too long", `cache.js`): a sheet refresh asked by a visitor queues behind the sync lock, which the Russian loop held. Both fixes (frame in 0.6 s, a silent page given up on) are in the new image, rebuilt at 15:11. (2) **My test chain was running on the same machine at the same time**: the home page took 58 s, 0.3 s as soon as the chain was stopped. Run no tests or measurements while the container runs, and look at `docker compose ps` before starting the chain.
- **Lighthouse on the 23 pages that revision 45 did not measure**: after the frame fix, **phone: performance 100 on 17 pages and 99 on 6** (`inbox`, `live`, `team`, `tier-lists-captain`, `training`, `training-notebook`: total blocking time 77 to 123 ms, the first draw and the first script on a processor 4 times slower), accessibility, best practices and SEO 100 everywhere, largest paint 1.2 to 1.7 s, worst layout shift 0.030; **desktop: 100 on 21 pages, 99 on `training-notebook`, 94 on `live`** (layout shift 0.158, below), accessibility, best practices and SEO 100. Before the fix the same measure gave 85 to 100 on a phone (eight pages at 85–92): those eight went from 85–92 to 99–100.
- **Not fixed, measured: a layout shift of the draft room on desktop (`live` 0.155; `series-live` too, less often).** One large shift, `.series-board`, when the real board takes the place of the frame (the frame-by-frame capture shows the empty "0 – 0" frame replaced in one frame by the whole board: two-part band, clock, hero grid). Lighthouse gave it 3 times out of 3 for `live` desktop (0.156, 0.158, 0.158); in a browser on the same page, three loads in a row: 5 of 25 reproduce it (0.155 against 0.02), `live` and `series-live` together, and every load at 0.02 follows the same two-step path (a first shift of 0.007 when `--sbw` is set, then the slots that move for 0.011). The largest distance of the big shift is 225 px, and I did not find which element moves 225 px (the trace only names the board, whose rectangle does not change). **Cause not established**: the order of the steps depends on how fast the page goes (script ready, data there before a frame is drawn). The likeliest lead is `--sbw` (the scrollbar width, set by the script at the moment the board replaces the frame, while the frame is drawn 10 px too wide), but I did not prove it. Not treated: nothing visibly jumps in the capture, and a fix without a known cause could move the problem.
