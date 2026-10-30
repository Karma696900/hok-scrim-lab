# HOK Global Scrim Lab

A draft, scrim and tier-list workspace for **Honor of Kings Global** (not the Chinese version, not Arena of Valor).
Express 5 (ESM) + MySQL 8, vanilla JS front end. Run drafts alone, hand the device to a second player, or play online
with an invited opponent; keep series history, share series and tier lists by link, export to JSON or PDF.

Data rules the app enforces: **Global only**, **no ranked data anywhere**, **nothing invented** — where there is no
verified source the UI says _Data unavailable_; statistics are computed from _your_ scrims and show _Insufficient sample_
below a threshold (30 games by default).

## Quick start (development, Docker)

```powershell
copy .env.example .env      # then edit: Google keys (optional), ADMIN_EMAILS
docker compose up --build   # app on http://localhost:3000, MySQL on 127.0.0.1:8080
```

The development compose file has convenient **insecure** defaults for the database passwords. Never use it as is on a server.

## Quick start (npm, MySQL from Docker)

```powershell
docker compose up -d mysql
npm ci
# .env needs DB_HOST=127.0.0.1, DB_PORT=8080, DB_NAME, DB_USER, DB_PASSWORD (see .env.example)
npx playwright install chromium    # roster sync and PDF export
npm start
```

`DB_PASSWORD` has **no built-in default**: the server refuses to start without it.

### A world to look at (development)

`node scripts/dev/demo-data.mjs seed` fills the development database with ten demo people (`*@demo.test`), two teams,
series (finished, in progress, one shared with the team), tier lists, an agenda, scrim announcements and tournaments, all made
through the running server's own API; `node scripts/dev/demo-data.mjs remove` takes everything away. It writes the session
cookies of the demo people to a file, so that a browser (or Playwright) can open the site as any of them. For the administrator
pages start the server with `ADMIN_EMAILS` containing `demoadmin@demo.test`. `node scripts/dev/shot.mjs <picture.png> /heroes --as captain --width 390 --theme light --lang ar` takes a picture of a page of the running server as one of them (as a visitor without `--as`).

## Configuration

| Variable                                                                                                                                      | Default                                    | Meaning                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                                                                                                                        | `3000`                                     | HTTP port                                                                                                                                                                                                                                                                                     |
| `NODE_ENV`                                                                                                                                    | `development`                              | `production` turns on the strict startup checks below                                                                                                                                                                                                                                         |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD`                                                                                         | `127.0.0.1` `8080` `hok_scrim` `hok_app` — | MySQL connection (`DB_PASSWORD` required)                                                                                                                                                                                                                                                     |
| `DB_POOL_SIZE` `DB_QUEUE_LIMIT` `DB_CONNECT_TIMEOUT_MS`                                                                                       | `10` `0` `10000`                           | The MySQL connection pool of one process (1 to 100 connections; a queue limit above 0 makes a request fail at once when that many already wait; ms to connect). Behind a load balancer, instances × `DB_POOL_SIZE` must stay under MySQL's `max_connections` (151). See `docs/PERFORMANCE.md` |
| `SHUTDOWN_DRAIN_SECONDS`                                                                                                                      | `0`                                        | Behind a load balancer: seconds between « this instance is leaving » (`GET /api/health` answers 503) and the moment it stops listening (5 to 10 is usual). `0` for a single instance                                                                                                          |
| `PRERENDER_WARM_ALL` `DETAILS_SYNC_STARTUP_DELAY_SECONDS` | production: `true` `60`; otherwise `false` `600` | Start-up work of the server: draw the public pages in every language (`true`) or in English only (`false`, so that a small development machine is not kept busy for minutes), and seconds before the Camp sheet crawl begins |
| `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` `GOOGLE_REDIRECT_URI`                                                                               | —                                          | Google sign-in (PKCE). Without them the app works with guest identities                                                                                                                                                                                                                       |
| `DISCORD_PUBLIC_KEY` `DISCORD_BOT_REDIRECT_URI`                                                                                               | —                                          | Discord buttons / slash commands (public key) and the return address when a team adds the bot to its server                                                                                                                                                                                   |
| `DISCORD_CLIENT_ID` `DISCORD_CLIENT_SECRET` `DISCORD_REDIRECT_URI`                                                                            | —                                          | Optional Discord account linking (OAuth2 `identify` only). `DISCORD_BOT_TOKEN` additionally lets the server send direct messages (notifications) to people who linked Discord and asked for them                                                                                              |
| `ADMIN_EMAILS`                                                                                                                                | —                                          | Comma-separated **verified Google emails** allowed to sync the roster, import competitive data and add manual lanes                                                                                                                                                                           |
| `COOKIE_SECURE`                                                                                                                               | `true` in production, else `false`         | Secure cookies; `__Host-` prefixed names when secure                                                                                                                                                                                                                                          |
| `APP_ORIGIN`                                                                                                                                  | —                                          | Public origin (required in production); used by the cross-origin check                                                                                                                                                                                                                        |
| `TRUST_PROXY`                                                                                                                                 | off                                        | Number of reverse-proxy hops (e.g. `1`) so rate limits see real client IPs                                                                                                                                                                                                                    |
| `MIN_SAMPLE_GAMES`                                                                                                                            | `30`                                       | Minimum games before a win rate / synergy / matchup percentage is shown                                                                                                                                                                                                                       |
| `ROSTER_SYNC_COOLDOWN_SECONDS`                                                                                                                | `600`                                      | Minimum delay between manual roster syncs                                                                                                                                                                                                                                                     |
| `DEEPL_API_KEY`                                                                                                                               | —                                          | Your DeepL key (a free one ends with `:fx`): **this one line turns on the automatic translation** of what the staff writes. See [Automatic translation](#automatic-translation-of-what-the-staff-writes)                                                                                      |
| `TRANSLATION_PROVIDER` `TRANSLATION_API_KEY` `TRANSLATION_ENDPOINT` `TRANSLATION_MODEL` `TRANSLATION_DAILY_CHARS` `TRANSLATION_SWEEP_SECONDS` | —                                          | Optional: another service (`anthropic`, `libretranslate`) or `off`; the older names of the DeepL key; a daily limit of characters; the seconds between two rounds (300)                                                                                                                       |
| `EXPORT_CONCURRENCY` `EXPORT_MAX_QUEUED`                                                                                                      | `1` `4`                                    | PDF export queue                                                                                                                                                                                                                                                                              |
| `PORTRAIT_CACHE_DIR`                                                                                                                          | system temp                                | Local cache of hero portraits used by the PDF export                                                                                                                                                                                                                                          |
| `CHROMIUM_NO_SANDBOX`                                                                                                                         | `false` (`true` in the Docker image)       | Chromium sandbox flag; the container is the sandbox                                                                                                                                                                                                                                           |
| `RATE_LIMIT_DISABLED`                                                                                                                         | `false`                                    | Only for tests                                                                                                                                                                                                                                                                                |
| `LOG_LEVEL`                                                                                                                                   | `info`                                     | `debug`, `info`, `warn`, `error`                                                                                                                                                                                                                                                              |

**Production refuses to start** with a missing/default/short (< 12) database password, with `COOKIE_SECURE=false`, or with a
non-https `GOOGLE_REDIRECT_URI`.

## Who sees what

- Everyone sees **only their own** series and tier lists, plus those received through an invitation link.
- Without an account you get an anonymous **guest identity** (random 256-bit httpOnly cookie) that owns your data. When you
  sign in with Google the guest's data moves to your account.
- **Sharing**: _Copy view link_ / _Copy edit link_ on a series or tier list. Links are single use and expire after 7 days. Online
  series can only be shared read-only. Only the creator can delete or share.
- **Online series** need a Google account. Roles: the creator starts games, records results and edits durations; either player runs
  the ready check and game timers; picks and bans belong to the player whose side is on turn; spectators are read-only.

### Attaching series created before ownership existed

Rows created by older versions have no owner and are invisible to everybody until you claim them (once, after signing in once with Google):

```powershell
node --env-file=.env tools\accounts\claim-legacy.js --email you@gmail.com            # dry run: counts only
node --env-file=.env tools\accounts\claim-legacy.js --email you@gmail.com --apply    # attaches them
```

In Docker: `docker compose exec hok-scrim-lab node scripts/accounts/claim-legacy.js --email you@gmail.com --apply`.

## Features

- 20-action competitive draft, role-priority swaps (picks sit under the lane the server assigned), random lane-valid pick on timeout,
  ready check, three-state clock (normal / last 5 s / time up) on the server's clock, game timer, BO1–BO7 and custom formats.
- Global Ban & Pick (a team can use a hero once per series; **one Flowborn form per team in the whole series**, any of the five, counting the current game) or Free For All.
  The rule is enforced on live picks and auto-picks, on corrections of a finished draft, on series imports (JSON, PDF/PNG) and on tournaments entered by an admin.
- Series board with scoreboard, per-game navigation (read-only replay of finished drafts), history. Series are exported **only as styled PDF or PNG** (button next to every series; choose the file name and add a comment printed in the file) and those files can be **imported back** (they carry the series data).
- **Tier lists** per lane or _All Roles_, drag and drop, sharing, JSON export/import. Flowborn: one entry named _Flowborn_ in a lane list;
  five entries (lane badge) in All Roles. A new list starts with the six tiers **SS, S, A, B, C, D** (rename, add, remove or move them as you like); a tier is drawn in the colour of its name, the same colours as the ratings, and the official ratings are drawn on this very board.
- **Heroes**: roster and full hero sheets from HOK Camp Global (skills with videos, lore, artwork, patch history with before/after numbers; no ranked data), _Tes scrims_ statistics, imported competitive statistics (with source, patch, region, licence and attribution) or _Data unavailable_. Admins fetch the sheets with **Sync hero sheets from Camp** (also runs daily).
- **Overview** and **History** with server-side filters (status, hero rule, team, date range) and pagination.
- **PDF export** of your series (max **100 series** per export), rendered by headless Chromium from a dedicated template with the network cut off.

### Administrators

Set `ADMIN_EMAILS`. Admins get: **Sync roster** (single flight, cooldown), the **Tournaments** page, the **hero guides** (recommended builds and combos, shared with the Contributors: see _Editors_ below) and
manual extra lanes for multi-lane heroes (Flowborn forms included, from the hero sheet; a lane tier list still shows the one form whose own Camp lane it is). Nothing competitive is ever fetched automatically.

### Tournaments (administrators)

`/tournaments` is where real played series are entered, as fast as possible: no timer, no turn order. A series is its event, stage, date, patch (optional), two teams, best-of, an optional source address and note; each game is _who was blue_, _who won_, an optional duration and the ten picks (bans optional). Type a hero name and press **Enter**: the pick goes in the next free slot (picks before bans), so a game is about ten key presses; **Ctrl+Enter** saves; _Save and enter the next series_ keeps the event, stage, date, patch and source. Sides are stored as _A/B_ in the editor, so renaming a team renames it in every game. Series can be added, edited, renamed and deleted at any time (`GET/POST /api/admin/tournaments`, `GET/PUT/DELETE /api/admin/tournaments/:id`; writing replaces the whole series, in one transaction).

The hero sheet is computed from those games only (never from ranked data, never estimated): **Competitive statistics** (pick, ban and presence rates, win rate with a win/loss ring, blue/red split) and **Pairings** (avatars of the three heroes most often on its side, and the three most often against it, in the games it won, with counts). The **Period** selector (all time, this year, last 12/6/3 months, from a date) is kept in the browser and sent as `?since=YYYY-MM-DD`. Counts are always shown and a note appears under 10 games. The old JSON import of external competitive statistics is no longer shown (its API stays).

### Catalog and builds

No free, open and up-to-date source of Global items and arcana exists (see `docs/DECISIONS.md`), so an administrator writes them. The **Catalog** page (`/catalog`, administrators) has five tabs:

- **Stats**: the stats of the game (Max HP, Physical Defense, Crit Rate, Attack range…). Each one has a **kind**: a number (decimals allowed), a **whole number**, a **percentage**, or a **choice** among options the administrator writes (for the attack range: _Melee_ and _Ranged_). Items, arcana and heroes are written with this list, so every stat is displayed properly. A stat that is used by an item, an arcana, a hero or a condition cannot be deleted or change kind.
- **Tags**: labels (colour, short description) applicable to items, arcana and heroes. They are labels only for now: builds are **not rated** (deciding whether a build is "good" is left for later; each tag can already list the tags it clashes with in the API).
- **Items**: picture (uploaded, kept up to 256 px as WebP, transparency kept), name, the **slot** it goes in (boots / item / utility / late-game), its **category** in the shop (Physical, Magical, Defense, Movement, Jungling, Roaming: one at most), price, description, the stats it gives, any number of **passives and actives** (an active has a cooldown) and tags.
- **Arcana**: picture (made 128 px when it was drawn smaller), colour (red / blue / green), up to 4 stats (none yet is fine: the lab then counts nothing for it) and tags.
- **Translations**: the state of the automatic translation of everything above (see [Automatic translation](#automatic-translation-of-what-the-staff-writes)).

**Two ways to sort an item.** The **slot** (`category` in the API: `boots`, `regular`, `utility`, `late`) is what a build has room for: six main slots (one pair of boots at most, two or three of the six marked as core), two late-game slots and two utility slots. The **category** (`shopCategory`: `physical`, `magical`, `defense`, `movement`, `jungling`, `roaming`) is the tab of the shop an item is found under: one at most, chosen or left empty. The two are independent (a utility item can be Roaming, boots are usually Movement). To sort many items in a few clicks open **Sort several** in the Items tab: filter on _No category yet_ to see what is left, tick the items (or _Select all shown_) and click a category or a slot; one request, all of them or none (`POST /api/admin/catalog/items/bulk` with `{ ids, shopCategory?, category? }`). The slot of an item cannot change while a recommended build uses it (the build would break); its category can. The build lab shows the categories as chips under the groups of slots as soon as some items are sorted.

**Pictures.** A picture is kept up to 256 px (it used to be shrunk to 128 px) as WebP with its transparency, and the site asks for the size it draws: `/catalog-images/<id>?w=64`, `?w=128` or `?w=256` (a list of fifty items does not download fifty close-ups). An arcana drawn smaller than 128 px is made 128 px with Lanczos resampling and a light sharpening: this makes the badge crisp, it does not add detail that was never drawn (a real gain would take an AI upscaler, which was not wanted).

**Importing a folder of pictures.** `node --env-file=.env scripts/catalog/import-images.mjs --items <folder> --arcana <folder>` shows what it would do and writes nothing; add `--apply` to create one item per picture of the first folder and one arcana per picture of the second, each with its picture (back the database up first: `scripts/database/backup-mysql.ps1`). It creates the entries and their pictures and **nothing else**: no stat, price, category or description (an administrator writes those in the Catalog). A name comes from the file (`Axe_Of_Torment.png` becomes _Axe of Torment_, `Mind%27s_Eye_Lv_V.webp` becomes _Mind's Eye_; nothing is guessed: a word the file lost stays lost), an item is a boots item when its name says so and a regular item otherwise, and the colour of an arcana is read from its picture (and left out, with a message, when the picture is not clear). A name already in the catalogue is skipped, never changed. A manifest is written to `backups/`, and `--undo <manifest.json> --apply` takes the import back (an entry that a recommended build uses is kept, and said).

On a hero sheet an administrator opens **Edit hero data**: the real base stats (value at level 1 and growth per level, or the option of a choice stat: _Ranged_), tags and, for each spell, the cooldown and cost by level, range, cast time and each effect with its values and scaling (shown in the skill panel). Nothing is invented: a hero without data says so.

**Values that depend on the hero.** Many items do not give the same thing to every hero, so the catalog can say so:

- A stat line of an item or an arcana can be **temporary** (it lasts a number of seconds, with a note such as _after using the active_): the build lab lists it apart and keeps it out of the total. A choice stat can be given by an item too (an item that makes the hero _Ranged_).
- A stat line, a passive and an active can each carry **conditions**, written on the page with no code: _the hero's stat is_ (for instance _Attack range is Melee_, or _Max HP is at least 3000_), _has the tag_, _class_, _lane_, _is one of these heroes_ (20 at most), _level_ (at least, at most, more than, less than or exactly), and groups that need **all** or **any** of their conditions (nested up to three deep, 12 conditions in all). Any condition can be negated (_is not_, _does not have_). They are checked on the server when saved, and only ever read as data (no code is run from them).
- The build lab counts only what **applies to the hero of the build**, at the level chosen: a line for melee heroes is left out for a ranged one, and the page says how many values did not apply, which are temporary and which could not be checked. A condition is answered _yes_, _no_ or _cannot be known_ (the data of the hero lacks the stat or the lane): an unknown answer is **never read as no**, so what depends on it is not counted and is shown as such. With no hero chosen, only what has no condition counts, and what waits for a hero is listed.

A **build** has 6 items (boots included, one pair at most), of which **2 or 3 are marked as core items** (the ones the hero cannot do without: shown with a star; a recommended build must mark them, a visitor's build may), 2 utility items, 2 late-game items, and up to 10 arcana of each colour counted with quantities (×7 of one, ×3 of another), displayed colour first then biggest quantity first. The **Build lab** (`/build-lab`, **no account needed**) lets anybody pick a hero and a level, add pieces (pictures, details on click), see the total stats (hero base at that level + items + arcana × quantity) and copy a link that carries the build. The two **recommended builds** of a hero (shown with pictures on the hero sheet) are written by the **editors** on `/guides` (next section); the lab itself has no administrator form any more. **My builds**, under the lab: anybody keeps as many builds as they want (30 per hero, 300 in all) under a name, in their own browser, no account needed; with an account a build can also be kept in [My space](#my-space). API: `GET /api/catalog` (public), `/api/admin/catalog/{stats,tags,items,arcana}`, `POST /api/admin/catalog/images`, `PUT /api/admin/heroes/:id/profile`. A stat or a piece used somewhere cannot be deleted.

## Game data: items, arcana and spells

Three public pages show what the staff entered in the Catalog, like the shop of the game: `/items` (filters by slot and by shop category), `/arcana` (by colour) and `/spells` (what each spell does and its cooldown). One menu entry, « Game data ». A build holds **one or two spells** (the build lab has a Spells tab; the shared link keeps them as `s=7.8`; the recommended builds of the heroes too), and an administrator writes them in Catalog → Spells like the items. A spell used by a recommended build cannot be deleted. The cooldown and the unlock level are optional: nothing is guessed, and a value nobody entered is not shown.

**Filling the catalogue from saved pages** (`items.html` of the Fandom wiki, `arcana.html` and `spells.html` of hokstats.gg): `scripts/catalog/import-data.mjs`. It reads the pages, plans (nothing is written without `--apply`), never replaces what is written, lists what it could not read with certainty, writes a manifest in `backups/` and can undo itself (`--undo`). Spell icons are only downloaded with `--fetch-spell-icons`, from the game's own image host. What is still missing is in `MISSING.md`. The values come from fan sites: check them against the game.

```powershell
# back the database up first (scripts/database/backup-mysql.ps1), with DB_* in the environment
node scripts/catalog/import-data.mjs --items items.html --arcana arcana.html --spells spells.html            # what it would do
node scripts/catalog/import-data.mjs --items items.html --arcana arcana.html --spells spells.html --apply --fetch-spell-icons
node scripts/catalog/import-data.mjs --undo backups/catalog-data-<stamp>.json --apply
```

## Editors: guides, ratings and combos

The **editors** are the administrators and the people an administrator gave the **Contributor** label to (player page → Labels). They get a group in the menu and nothing else of the administration: the catalog, the tournaments and the reports stay the administrators' own. The label is the permission, so taking it away closes the pages at once.

- **Hero guides** (`/guides`, `/guides/<hero id>`): the heroes with how many builds and combos each has, and for the chosen hero either its two **recommended builds** (name, note, source, the build; the rules are listed and checked while writing: 2 or 3 core items, at least one piece) or its **combos** (`?tab=combos`). A combo is a name, a note and 1 to 12 steps; each step is a skill of the hero (the passive and the ultimate included; the pictures come from its Camp sheet) with a short hint. A hero has as many combos as the editors want, in the order they choose. API (editors): `GET /api/builds`, `PUT/DELETE /api/builds/:heroId/:variant`, `GET /api/combos`, `POST /api/combos/:heroId`, `PUT /api/combos/:heroId/order`, `PUT/DELETE /api/combos/:heroId/:id`. The combos come with `GET /api/heroes/:id`.
- **Combos** on the hero sheet: a card with the first four combos open and the others folded. In **Training**, a signed-in player validates each combo in two forms, **normal** and **animation cancel** (`GET /api/training/combos`, `PUT /api/training/combos/:id`; personal). A combo that was acquired **comes back to be checked** after 1, 3, 7, 14, then 30 days (spaced repetition, five boxes): the top of Training lists the **Combos to check today** (_Still sharp_ moves the combo to the next box, _Rusty_ starts it again from the first one) and, below, the **Combos to learn** (the ones of the heroes you work on and of the heroes your teams ask for, that you have not acquired in any form yet). Un-ticking the last form takes the combo out of the schedule. API: `GET /api/training/combos/review`, `POST /api/training/combos/:id/review` (`{ "sharp": true | false }`).
- **Official ratings** (`/ratings`): one list per lane with the tiers **SS, S, A, B, C, D** (drag and drop, or click a hero then a tier). The lists are **not shown to anybody else as lists**: the hero sheet shows the rating next to each lane of the hero (a hero that is Clash and Jungle gets two separate ratings). A list is saved with its version number, so two editors cannot overwrite each other without being told. The page is drawn on **the same board as the tier lists** (the same colours for SS to D, the same round portraits, the same dashed Unranked row), with a toolbar for the lane, Reset and Save; a hero picked with a click gets a ring and a bar that sends it to a tier. API (editors): `GET /api/official-tiers`, `PUT /api/official-tiers/:lane`.

## Public API and API keys

Everything a signed-in person can read in the application can be read from their own programs with an **API key**:
Settings → **API keys** makes one (a name, what it can read, how long it lives; the secret is shown **once**). The API
`/api/v1` only **reads** and sees exactly what the key's owner sees: their series (and the ones a team of theirs
shared), their tier lists, their own statistics, the game data (heroes, items, arcana, spells), the tournaments and the
popularity of drafts. `curl -H "Authorization: Bearer hok_…" https://your-site/api/v1/heroes`. The addresses, scopes,
errors and security notes are in [docs/API.md](docs/API.md).

A **team** leader (owner, manager or coach) who created a series can put it on the team: every member then reads it, in
the application and through their keys (`PUT /api/series/:id/teams/:teamId`).

## Popular drafts and heroes

`/popular` (drafts) and `/popular/heroes`, computed from the **tournament** games only, never from scrims. The drafts page ranks the five-hero compositions by win rate or by games played, for each side (blue, red), with the three heroes most often played **against** them when they won and when they lost; the heroes page ranks the top 20 of each lane the same way. The **period** is chosen (3, 6, 12 months, since the first game, or two dates): never shorter than **3 months** and never before the first competitive game; a minimum number of games hides the rates that rest on too few. API (public): `GET /api/popular/drafts`, `GET /api/popular/heroes` (`from`, `to`, `rule`, `minGames`).

## Training, onboarding and settings

- **Draft rules.** Global Ban & Pick (20 actions), Free For All (10 picks, no bans: 1 Blue, 2 Red, 2 Blue, 2 Red, 2 Blue, 1 Red; never the same hero on both sides) and **Classic** (the same ten picks in the same order, but both sides may pick the same hero; in an online duo each player only sees their own picks until the draft ends — the server leaves the others out of its answers). The live draft board is also reachable from **Live draft** in the menu.
- **Training** (`/training`): the heroes you work on with quick access to their skills and stats, a private **notebook** (goals, mechanics, combos drawn with the skill pictures of the hero, video reviews), and **situations** prepared by administrators on a map: hero pins (side, dead or alive) and pins of the game (camp, buff, objective, tower, bush). **The game map is not shipped**: an administrator uploads the picture (Training → Situations → Maps) and places the pins; names are typed by them, nothing is hard-coded.
- **Video reviews** (a kind of note in the notebook): always linked to a hero, with the **link of a video** (an `https://` address of any site; the server never fetches it) and the **moments to look at again**, typed one per line (`12:30 late rotation`, `1:02:03 - lost the objective`; at most 30, put in the order of the video). Each moment is a link that opens the video at that time on YouTube, Twitch (videos) and bilibili, and at the start on any other site. The statuses read _To watch_, _Being reviewed_, _Reviewed_. Like the rest of the notebook it is private, and it is part of the training sheet of a shared space (the link and the moments are then visible to whoever has the space link, see [Security](docs/SECURITY.md)). `training_notes.url` and `marks_json` (migration 025). Also fixed on the way: the status of a goal or a mechanic could not be changed from its card (the page sent back an empty list of steps, which was refused).
- **Reflex training** (`/training/reflex`): eight short exercises that run in the browser and **send nothing while they are played**. No request, the video behind the page is paused and the animations that never end stop (`app/app-state.js`); only the result is sent, once the run is over. A run has the whole screen (a dark play screen in both themes, with a bar: the way out, a counter, the lives and a thin progress line; Escape stops it) and the result comes back in the page. They are reaction time, sequence memory, the chimp test, an aim trainer, tracking (follow the lit balls), friend or foe, last hit (strike when the life bar goes under the notch) and skill keys. Each keeps the best score, the latest scores, today's and this week's work and the streak of days. A team's **owner, managers and coaches** can ask the players (players, substitutes and captains) for a number of **runs or minutes** each **day or week**, for one exercise or any: the goals are on the team page (Training tab), where the staff sees how far each player is and a player sees their own line; a player also sees them above the exercises. A day, and a week from Monday, follow the clock of the team's time zone; at most 10 goals per team. API: `GET /api/training/reflex`, `POST /api/training/reflex/runs`, `GET /api/teams/:id/training`, `POST/PUT/DELETE /api/teams/:id/training/goals[/:goalId]`.
- **Routines** (`/training/reflex/routine`): several exercises one after the other. Four are proposed (a warm-up of 3 exercises, mechanics of 4, focus of 3, all eight) and a person can tick their own (at least two). A bar shows the steps; each step ends on its result and the next one can be started once the run is saved; a step can be skipped and the routine stopped; the summary lists the score of each exercise played. The list of exercises marks the ones already played **today**. The same rule as everywhere: nothing is requested while an exercise runs.
- **Team ranking** (team page → Training, staff and, when the staff opens it, the players): the best score of each player who is asked to train, in the exercise that is chosen, over **this week** (from Monday, on the clock of the team) or **all time**; the lowest time or the highest level comes first, a tie shares the place and the next place is skipped. It is **closed to the players until the staff ticks "Show the ranking to the players"** (`team_training_settings`). API: `PUT /api/teams/:id/training/settings`, `GET /api/teams/:id/training/ranking?exercise=&period=week|all`.
- **Heroes to master** (goals about heroes): the staff asks every player of a team to acquire **all the combos of a hero**, in one form (normal or animation cancel) or in both, up to 10 heroes per team (`team_hero_goals`; only the heroes that have combos can be chosen, and the combos are the ones the editors wrote). The progress of each player is shown beside the reflex goals in the table of the team page; a player finds their heroes at the top of **Training** (_Heroes to master_, with how far they are and a _Practise_ button that opens the hero below). API: `POST/DELETE /api/teams/:id/training/hero-goals[/:goalId]`, `GET /api/training/assigned`.
- **Welcome pages** (`/welcome`) ask which optional parts to show (Scrims and drafts, Tier lists, Heroes and builds, Training); the community is always on. **Settings** (`/settings`) change that later, and set the defaults of a new series, the start page and reduced animations. Hidden parts still open from their address.
- **Lanes.** Everywhere a hero's lanes are shown they are the lane logos (a hero can have several). On a hero's sheet an administrator can add a lane or take one away, Camp's included, but a hero always keeps at least one; the change reaches the lane filters, the draft pool and auto-pick and the tier lists of that lane at once. In the Tournaments editor, once the five heroes of a side are chosen, lane logos are slid onto them to say which lane each was played in (a lane once per side; nothing is guessed).
- Design: the product was redesigned from scratch on 2026-10-11 (top navigation in five groups; the earlier interactive mock-up and its notes were removed, they stay in the git history up to commit `30ba879`). `PRODUCT.md` is the product record, `design/DESIGN.md` the visual rules.

## My space

`/space` (account needed) is where a person finds what they keep on the site: their **tier lists**, their **builds** (kept from the build lab with the button on each saved build: a copy goes to the account, the one of the browser stays) and their **training sheet** (heroes worked on, notebook, combos acquired in each form, best reflex scores). **The only way a space is shared is a link**: the person gives as many as they want (20 at most), each for the parts they choose, read only, with no end or an end (7, 30 or 90 days), and removes any of them at once. The link is `/space/shared#<token>`: the token is after the `#`, so it never reaches a server or a log; it is shown **once** (only its hash is kept); whoever has it sees the space without an account and without any cookie. The e-mail address and the answers to the training situations are never part of it, and the page is not indexed. The invitation links of a series or of a tier list (viewer and editor roles) are another thing and are unchanged. API: `GET /api/space`, `POST /api/space/builds`, `DELETE /api/space/builds/:id`, `POST /api/space/links`, `DELETE /api/space/links/:id`, `POST /api/space/open` (migration 024).

## Community

Everything below needs an account except browsing teams, announcements and player pages. All of it is stored in MySQL (migrations 012–016, additive).

- **Teams** (`/teams`): name and tag (unique), level, region, time zone, languages, **member limit 7–20**, square **logo**. Roles: owner, manager, coach, captain, analyst, player (with a lane), substitute. The owner and the managers run the roster; nobody is added without **accepting an invitation** (sent by player tag). 5 teams per person at most.
- **Agenda**: each team has events (scrim, tournament match, practice, VOD review, meeting, available, unavailable; weekly repetition up to 12 times). Members see everything and answer **going / maybe / can't**; strangers only see the windows marked available (without notes). `/agenda` shows the events of all your teams (month and list), exports `.ics`, and a scrim event can pre-fill a new series. A reminder is sent once, one hour before an event.
- **Find a scrim** (`/find`): open announcements (a time window, a format, a hero rule, a control mode) filtered by date, length, level, region, format, rule and control; **requests** between teams: pending → accepted / declined / cancelled, or a **counter-proposal** that passes the turn; accepting puts the scrim in both agendas. 5 requests per team and day; a team can block another; any conversation can be reported (administrators read `/api/admin/reports`).
- **Inbox** (`/inbox`): the conversation of each request and the notifications (request, answer, message, invitation, reminder).
- **Player pages** (`/players/<tag>`): optional bio, lane, time zone, languages and up to 3 main heroes chosen by the player; team chips; **labels** (Verified, Moderator, Organiser, Contributor) given by administrators; the e-mail is never published.
- **Discord** (`/discord`, step-by-step setup in `docs/DISCORD_SETUP.md`): optional. On top of the account link and direct messages below, the bot posts **reminders 6 h, 4 h and 2 h before** each event, **confirmed scrims** and a **Monday digest** in the channel a team's owner/managers chose (team page → Discord card); under a request in a direct message, **Accept / Decline buttons** answer through the same rules as the site, and `/agenda` and `/requests` list what is planned or waiting (signed interactions endpoint `/discord/interactions`). With the three OAuth variables a person can link their Discord account (only the id, name and avatar are asked). With `DISCORD_BOT_TOKEN` the server also sends direct messages for the kinds of notification the person chose (plain REST calls; no bot process and no message reading). Without any variable everything stays on the site. `node --env-file=.env scripts/discord/check.mjs` asks Discord, with the calls the site makes, whether the application is sound (secret, token, public key, public bot), and on the page **Discord → Send me a test message** says in words what Discord answered (the usual refusal: a bot can only write to people who share a server with it).

## Profiles

Every account has a unique, permanent 6-character **tag** (shown as `#TAG`, never changed by the client). Clicking the avatar opens the profile dialog: change the **pseudo**, upload a photo (PNG/JPEG/WebP/GIF, 4 MB, cropped to a 256 px WebP and served at `/avatars/:tag`), use the Google photo or none. A Google sign-in never uses Google's name: a new Google account first chooses a pseudo and a password (twice), then enrols the authenticator.

## Languages

The whole site, the API messages and the PDF/PNG reports follow the visitor's language: 15 languages (English, Français, Español, Português, Deutsch, Italiano, Русский, Türkçe, Bahasa Indonesia, Tiếng Việt, ไทย, العربية (right-to-left), 日本語, 한국어, 简体中文).

- **Choice:** the picker in the header, else the browser's languages (`Accept-Language` on the server, so the first byte is already in the right language and `<html lang dir>`, title, description, `og:locale` are right for crawlers), else English. The choice is kept in the `hok_lang` cookie.
- **Texts:** the English sentence is the key (`t("Sign in")`). `src/translations/keys.tsv` lists every key with a stable id, `translations/<lang>.txt` holds `id|translation`; `npm run i18n` regenerates `public/locales/<lang>.js`. `src/shared/i18n.test.js` fails when a catalog misses a key, keeps a stale one, or changes a `{placeholder}`; plurals use each language's CLDR categories (Russian, Arabic…).
- **Layout:** logical CSS properties everywhere (the page mirrors by itself in Arabic), a font stack per script, no letter-spacing or capitals where the script has none, Latin digits so clocks and scores agree. `src/client/language.e2e.mjs` opens 7 pages in all 15 languages on a phone and a desktop width and fails on any horizontal overflow or clipped text.
- **Hero data:** names, classes, skills, lore, patch notes **and the videos** come from Camp Global in the visitor's language (Camp serves `lang_type=<code>`; the skill videos are Camp's own localized cuts under `Global/<LANG>/…`). They are fetched the first time a hero is opened in a language (queue in `details-sync.js`); the English sheet shows with a notice until then. Nothing is translated or invented by us.
- **Subtitles:** Camp publishes no subtitle tracks (checked in its API: no `.vtt`/`.srt`/caption fields), so none are shown; the localized video files are the translation. If Camp ever publishes tracks, `<track>` elements are the place to add them.
- **What the staff writes** (the names and descriptions of stats, items and arcana, builds, combos, training situations…) is translated too, by a translation service you choose: see the next section. Until it is switched on, those texts show as they were typed.

## Automatic translation of what the staff writes

The texts the staff types (names and descriptions of stats, items and arcana, notes, builds, combos, training situations…) are kept **as typed** and translated by **DeepL** into the languages the site is read in. Visitors read them in their own language; until a translation exists they read the text as typed, so nothing is ever missing or broken.

**To turn it on, add one line to `.env` and restart:**

```
DEEPL_API_KEY=your-key
```

A free DeepL key (it ends with `:fx`) is enough. Check it first with `npm run translations:check`: it reads the quota of your account and says which languages DeepL offers (add `-- --translate` to translate one word, five characters). Without a key nothing is sent anywhere, and the **Translations** tab of the Catalog lets the staff translate by hand.

How it spares your quota:

- **A language is translated once somebody asks for it**: a visitor who reads the site in it, or you with the plus buttons of the tab (or _Translate into every language_). Nothing is sent for a language nobody uses, which is most of what a metered service is paid for.
- A text is one key wherever it is used (_Melee_ is sent once). Only what is new or changed is sent, up to 50 texts a request, with some context about the game (DeepL does not bill the context), and a text is never translated into the language it is written in.
- **The quota is read from your DeepL account** and shown in the tab. The translator **stops at 90 %** of it, to leave some for the other uses of your key. When DeepL says the quota is used up it waits (until the end of the period when the account says when, else until tomorrow) instead of trying again every minute. There is no daily number to choose.
- One request goes to DeepL for each language (it translates into one language at a time), four at a time. If DeepL stops half-way (too many requests, quota), what was done is kept and the rest waits.

What else it does:

- A translation is **checked before it is used**: the numbers of the text must all be in it (a damage or a percentage never changes), no markup, not empty, not much longer than the text. Otherwise the row is marked _failed_ with the reason and tried again later (after 5 minutes, then 15, 45… up to 6 hours; once five tries are used, once a week; _Try the failed ones again_ starts them again at once). A key that DeepL refuses stops everything until it is changed. Only one process translates at a time (a MySQL lock).
- A correction written by hand is never overwritten. _Keep as typed_ keeps a name as typed in every language, including a language asked for later; _Back to automatic_ takes the decision back.
- **The Translations tab** (administrators): the service, the quota with its bar, the languages (how far each one is, a plus button for the others), the counts, and a list per language with filters (all, failed, waiting, by hand, automatic) and a search: correct by hand, back to automatic, keep as typed, _Translate now_, _Try the failed ones again_.
- **In the pages**, the browser loads the dictionary of the visitor's language once (`GET /api/content-translations?lang=fr`, an ETag that changes when a translation does) and swaps each text it draws. The forms of the staff always show and save the text **as typed**, so a translation can never be written back into the catalog.
- What players write (tier lists, notebooks, team names, messages, pseudonyms) is **never translated and never sent**, nor are unpublished training situations. What is sent is the text of an entry and the target language, with the game context; DeepL's own terms apply to it.
- **Other services and settings** (all optional): `TRANSLATION_PROVIDER=anthropic` (with `TRANSLATION_API_KEY` and, to change the model, `TRANSLATION_MODEL`) or `libretranslate` (with `TRANSLATION_ENDPOINT`, a server of yours: nothing leaves it); `TRANSLATION_PROVIDER=off` switches the translation off whatever keys are there; `TRANSLATION_DAILY_CHARS` adds a daily limit (a service that cannot say what is left is held to 400 000 a day unless you write another). The names used before keep working: `TRANSLATION_PROVIDER=deepl` with `TRANSLATION_API_KEY` is the same as `DEEPL_API_KEY`. `TRANSLATION_SWEEP_SECONDS` (300) is the time between two rounds that look for new texts (a round also starts a moment after the staff saves).
- **API:** `GET /api/content-translations` (public), and for administrators `GET /api/admin/translations/status`, `GET /api/admin/translations/texts`, `PUT/DELETE /api/admin/translations/:hash/:language`, `POST /api/admin/translations/:hash/keep`, `POST /api/admin/translations/retry`, `POST /api/admin/translations/sweep`, `POST /api/admin/translations/languages` (`{ "language": "ko" }` or `{ "all": true }`) (migrations 027 and 029). The interface texts of the site itself (buttons, messages) are not part of this: they are the 15 catalogs of the previous section.

## Page background

A muted, dimmed presentation video of a hero (Camp Global) plays behind the pages on screens ≥ 900 px: a random hero for each new session, or the hero chosen with « Use as page background » on its sheet. The header button turns it off. It starts after the page is idle, never for visitors who prefer reduced motion or save data, and pauses when the tab is hidden.

## Performance

- **Images:** Camp publishes artwork at print size (a hero banner is several MB). Every picture goes through `GET /media/img?w=<width>&u=<camp url>`: fetched once from the Camp media hosts only (same allow-list as the sheet data, no redirect, size/pixel/time limits, three at a time), resized from a fixed list of widths and re-encoded as WebP (`sharp`), kept in memory and in `PORTRAIT_CACHE_DIR/webp`, and served with a one-year immutable cache and an ETag. A banner goes from several MB to 20–80 KB. If Camp is unreachable the browser is redirected to the original.
- **Assets:** `npm run build` writes minified, content-hashed files to `dist/` (bundle with code splitting: the account pages, the draft board and the background video are separate chunks; stylesheets; a manifest). The page handler uses them when they exist, the sources otherwise (development, tests: `HOK_SOURCE_ASSETS=true`). The Docker image builds them in its own stage.
- **First paint:** the HTML and an inlined critical CSS (which carries the font faces too) paint the header and the page frame by themselves, with metric-matched fallback fonts (nothing moves when the web fonts arrive, and `font-display: optional` never swaps them in late). A page the server draws also inlines the sheets of its own first screen only (`src/client/styles/first-paint.json`; the whole stylesheet is prefetched and applied when another page is drawn), so its document is 80 to 200 KB, not the 400 KB of every sheet of the site. A small inline loader (allowed by its SHA-256 in the CSP, constant) starts the stylesheet, the script, the page's API calls (as preloads) and the translation catalog right after the browser's own first-contentful-paint, so the first frame never waits for them.
- **Loaded when needed:** videos (`IntersectionObserver`, 300 px early: the profile video alone starts at several MB), gallery images and hero cards below the first rows, the draft board code (Scrims only), the account pages, the background video (after the first interaction, on a fast connection, and only for videos ≤ 20 MB — their size is looked up once with a HEAD request).
- **Interactions:** switching a skill tab rebuilds only the skills block (it used to rebuild the whole sheet, images and videos included); the hero data is requested with the first batch; a click made while the page is still starting is honored.
- **Measured on a large data set (revision 25):** `scripts/performance/api-probe.mjs` fills a throw-away database with 30 000 series, 60 000 notifications and so on, calls the real routes as a busy and as a quiet person and reports time, SQL statements, bytes and EXPLAIN of every SELECT (it found two queries whose cost followed the size of the whole table: 224 ms for someone with two series, now 9 ms); `input-probe.mjs` times a keystroke in a search box with a processor four times slower. The ledger, the numbers, what was done for each item of the checklist and what was left alone: `docs/PERFORMANCE.md`.
- **Caching and compression:** private API answers stay `no-store`; the catalogue and the hero list are stored but revalidated (ETag, 304), the popularity pages are public for a minute and computed once per 30 s; pictures and scripts carry no `Vary` on the cookie; an error is never cached. `npm run build` also writes brotli (level 11) and gzip copies of every script and style, which the server hands out as they are.
- **Loading and typing:** skeleton placeholders while a list page waits for its data; the catalogue filter and the hero search wait for a pause in the typing before they redraw.
- **The consignes** (`scripts/dev/consignes-audit.mjs <address>`): the 20 checks for being found by search engines (read on the raw HTML of the public pages, the way a crawler reads it) and the 19 checks before people sign up (headers, admin routes, secrets, SQL, logs, dependencies), against a running instance; exit code 1 when one fails.
- **Tools** (`scripts/performance/`): `cls-probe.mjs` (which element moves, and when), `lighthouse-pages.mjs` (Lighthouse, mobile and desktop, on every page of a demonstration instance, the pages that need an account included: `npm run build`, then `HOK_TEST_BUILT=true node scripts/performance/lighthouse-pages.mjs <folder>`; `lighthouse-summary.mjs` prints the table), and `serve-built.mjs` (the built app on a throw-away database, with a small test roster, for Lighthouse when no development server is running: `HOK_TEST_BUILT=true node scripts/performance/serve-built.mjs`), and `trace-load.mjs` (the first load of a page, traced in a phone whose processor is 4 times slower: the paints, a stand-in for the blocking time (the minimum of several runs), the tasks over 50 ms and what they are made of, and with `--why` the functions that make the browser restyle the page).

## Tests

```powershell
docker compose up -d mysql    # tests use throw-away databases (hok_test_<random>) on the compose MySQL
npm test                      # 850+ unit and HTTP tests (MySQL tests are skipped if MySQL is unreachable)
npm run test:e2e              # every Chromium (Playwright) browser test, one after the other, with a summary of what failed
node src/testing/run-e2e.mjs draft history   # only some of them
```

Optional environment for the test database: `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_PASSWORD`, `TEST_DB_ROOT_PASSWORD`
(defaults match the development compose file).

A test that is killed (or a browser script stopped half-way) can leave its throw-away database behind. `node scripts/database/drop-test-databases.mjs` lists them and says why each would be kept or dropped (nothing is dropped without `--apply`); it only ever touches names that are exactly `hok_test_` followed by 12 hexadecimal digits, never a database with a connection open on it, and none younger than `--younger-than=<minutes>` (10 by default, so a run in progress is safe): `node scripts/database/drop-test-databases.mjs --apply`. The screenshot and Lighthouse tools that start their own demonstration instance (`capture-pages.mjs --serve`, `lighthouse-pages.mjs`) now stop it properly, which was the cause of the 59 databases found left over on 7 October.

Visual review: `node tests\e2e\screenshots.mjs captures` writes screenshots of the main views; `node tests\e2e\export-preview.mjs preview` renders the PDF template.

Code style: `npm run lint` (ESLint), `npm run format` (Prettier, 100 columns) and `npm run format:check`.

## Database: backups and migrations

Schema changes are **versioned, additive migrations** (`src/server/platform/database/migrations/`, table `schema_migrations`) applied at startup under a MySQL lock.
Back up before upgrading:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\database\backup-mysql.ps1
# restore (stop the app first)
docker compose stop hok-scrim-lab
powershell -NoProfile -ExecutionPolicy Bypass -File tools\database\restore-mysql.ps1 -File backups\hok_scrim-YYYYMMDD-HHMMSS.sql -Yes
```

## Production

```powershell
# .env: MYSQL_ROOT_PASSWORD, MYSQL_PASSWORD (long random), MFA_ENCRYPTION_KEY, GOOGLE_*, GOOGLE_REDIRECT_URI (https), APP_ORIGIN (https), ADMIN_EMAILS, TRUST_PROXY=1
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The production overlay: no default secrets (compose stops if one is missing), MySQL not published, `NODE_ENV=production`, Secure `__Host-` cookies,
read-only root filesystem with a `tmpfs` `/tmp`, all capabilities dropped, `no-new-privileges`, memory/PID limits, healthcheck, graceful
shutdown on `SIGTERM`. Put it behind an HTTPS reverse proxy (set `TRUST_PROXY`). Liveness: `GET /api/health/live`; readiness (checks MySQL): `GET /api/health`. Several instances behind a balancer: see « Several instances » in `docs/PERFORMANCE.md` (jobs are single-instance by lock, `SHUTDOWN_DRAIN_SECONDS`, rate limits per instance).

Security headers (strict CSP, `nosniff`, referrer and permissions policies, HSTS when cookies are Secure), a cross-origin check on all writes, rate limits,
typed JSON errors (details only in the logs) and secret-free JSON logs are built in. See `docs/SECURITY.md` and `docs/DECISIONS.md`.

## Project layout

Two folders hold the code: `src/` (what the application is and everything that checks it) and `scripts/` (what you run by hand).
A test sits next to the code it checks: `x.js` and `x.test.js` (node:test), `x.e2e.mjs` (Playwright, run by `src/testing/run-e2e.mjs`).

```
src/
  server/               the Express app
    app.js                createApp(): middleware, routers, error handler (no side effects at import)
    server.js             config check, migrations, listen, schedules, graceful shutdown
    config.js             environment -> settings, production startup checks
    platform/             http (assets, pages, security, identity, rate limits), database (store, migrations), security, images, errors, validation, i18n
    features/<name>/      one slice per area: routes, store, domain (auth, series, heroes, teams, community, discord, ...)
  client/               the browser app: main.js, app/, lib/, domain/, shell/, features/<name>/, styles/ (the design system)
  shared/               code used by both: i18n runtime, routes, media, build and draft models
  public/               files served as they are: fonts, icons, logo, generated locales
  translations/         translation sources (English text is the key)
  testing/              what the tests share: the test app, the layout lint, run-e2e.mjs
scripts/                build, i18n, accounts, database, data, catalog, brand, dev, performance, vod-drafts (their tests next to them)
```

Outside them only the project files: `package.json`, `Dockerfile`, the compose files, the linter settings, `README.md`, `deploy.md` and `docs/`
(ARCHITECTURE.md, DECISIONS.md, SECURITY.md, set-up guides; `docs/history/` keeps the reports and briefs of earlier rounds).

`docs/ARCHITECTURE.md` explains how the pieces fit.

## Hero roster

The server opens the official HOK Camp Global hero popularity page in headless Chromium and captures the public JSON the page requests (at start-up
when the cache is older than 12 hours, every 12 hours, and on demand for admins). Only identity, class, lane and portrait are kept — the `banRate`,
`showRate`, `winRate` and `tRank` ranked fields are ignored. Source records are validated before an atomic update; on any failure the last valid roster
stays in use, and a response that shrinks the roster by more than 20 % is refused. Heroes missing from a later response are marked unavailable, never
deleted, so old games keep their IDs. Camp's five Flowborn forms stay five heroes (IDs 581–585).

## Licence

The code is free software under the [GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`),
Copyright (C) 2026 Karma: anyone may use, change and share it, and whoever runs a changed copy as a public site
must publish their changes under the same licence. Honor of Kings content (hero names and pictures, the lane icons
in `src/public/icons/`, game videos) belongs to Tencent / TiMi Studio Group and is not covered: see [NOTICE.md](NOTICE.md).
