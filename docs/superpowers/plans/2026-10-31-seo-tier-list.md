# Référencement, tier list publique et popularité : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sortir dans Google sur les recherches HOK de chaque fonction du site (tier list d'abord), dans les 15 langues, avec des classements de popularité plus justes.

**Architecture:** Un calcul pur commun (`popular-score.js`) donne le score bayésien pesé par la récence ; `popular.js` et la nouvelle tier list publique (`public-tier-list.js`) s'en servent, le cache du store (30 s, vidé à chaque écriture) fait la mise à jour automatique. Les pages publiques gagnent titres « HOK », `h1`, introduction et données structurées ; une adresse par langue (`/fr/…`) est décidée par un module partagé, lue par le serveur (langue, hreflang, sitemap) et par le navigateur (liens, changement de langue).

**Tech Stack:** Express 5 ESM, MySQL 8, client vanilla JS, `node --test`, e2e Playwright (`src/testing/run-e2e.mjs`), rendu serveur Chromium (`prerender.js`).

**Spec:** `docs/superpowers/specs/2026-10-31-seo-tier-list-design.md` (validée le 2026-10-31, avec les pages par objet, arcane et sort).

## Global Constraints

- Fichiers ≤ 400 lignes, fonctions ≤ 120, CSS ≤ 600 (`src/architecture.test.js`) ; prettier + eslint (`curly: all`).
- Pas de `style=""` (CSP) ; garder le design actuel ; composants de tier : `components/tier-board.css`, `domain/tier-labels.js`.
- Textes nouveaux : anglais dans le code, traduits dans les 15 langues par `node scripts/i18n/add.mjs` ; `node scripts/i18n/keys.mjs` ne doit rien signaler.
- Migrations jamais modifiées une fois sorties ; aucune nouvelle table n'est nécessaire.
- Tournois seulement (`competitive_games`), jamais les scrims.
- `docker compose ps` avant les e2e ; `node scripts/database/drop-test-databases.mjs --apply --younger-than=0` avant et après les tests avec base.
- Commits par chemins explicites, jamais `git add -A` ; pas de push avant la fin de tout (le propriétaire fait le bilan à la fin).
- Réglages provisoires (`guess`) listés pour le propriétaire : demi-vie 30 j, k = 10, `minGames` 10.

## Review Focus

1. Une voie sans aucun héros au-dessus de `minGames` (base neuve, période vide) : la tier list se rabat entièrement sur les notes à la main, sans division par zéro (meilleur = pire).
2. Un seul héros classé par les tournois dans une voie : il est SS, pas NaN.
3. Une partie sans voies saisies (`pickLanes` null) : comptée dans la présence (bans) et les duos « toutes voies », jamais placée dans une voie.
4. Une adresse `/xx/...` avec un code qui n'est pas une langue (`/zz/heroes`) : 404, pas une page anglaise en double.
5. Un robot sans cookie ni `Accept-Language` sur `/heroes` : 200 en anglais, jamais de redirection.

---

### Task 1: Le score commun (récence, patch, bayésien)

**Files:** Create `src/server/features/tournaments/popular-score.js`, `popular-score.test.js`.

**Interfaces — Produces:**
- `recencyWeight(playedOn: "YYYY-MM-DD", today: "YYYY-MM-DD", halfLifeDays = 30) -> number` = `0.5 ** (âge / demi-vie)`, 1 le jour même, jamais > 1.
- `heroWeight(playedOn, today, lastChange: string|null) -> number` = recencyWeight × (0.5 si `playedOn < lastChange`).
- `bayesian(wins, games, prior, k = 10) -> number` = `(wins + k*prior) / (games + k)` ; `games = 0` → `prior`.
- `lastChanges(detailsByHero: {[heroId]: {adjustments?: [{publishedAt}]}}) -> {[heroId]: "YYYY-MM-DD"}` (dernier `publishedAt` passé).
- `SCORE = { halfLife: 30, k: 10, minGames: 10 }`.

- [ ] Tests : `recencyWeight` 1 aujourd'hui, 0,5 à 30 j, 0,25 à 60 j ; `heroWeight` moitié avant le patch ; `bayesian(0,0,0.5)=0.5`, `bayesian(10,10,0.5)=0.75`, monotone ; `lastChanges` prend le plus récent et ignore le futur.
- [ ] Run `node --test src/server/features/tournaments/popular-score.test.js` → FAIL (module absent).
- [ ] Implémenter ; relancer → PASS.
- [ ] Commit `feat(popular): one score for heroes and drafts, recent games first`.

### Task 2: Héros populaires — score, présence, bans

**Files:** Modify `src/server/features/tournaments/popular.js` (split into `popular-heroes.js` if > 400 lines), `popular.test.js`, `popular-routes.js`; store: lecture des `adjustments` (`store.readHeroDetailsAdjustments()` ou existant `getHeroDetails`) mise en cache.

**Interfaces — Produces:** `popularHeroes(games, { minGames, limit, today, lastChange = {} })` → par voie : entrées `{ heroId, games, wins, winRate, weightedGames, score, pickRate, banRate, presence, whenWon, whenLost, lastPlayed }` ; coupes `byWinRate` (score), `byPlays` (weightedGames), `byPresence` (presence). `prior` = taux moyen pesé de la voie. Un ban compte dans la présence de chaque voie du héros (`heroLanes: {[heroId]: lanes[]}` en option).

- [ ] Tests : une partie récente pèse plus qu'une ancienne dans `score` ; un héros 1/1 ne passe pas devant un 18/25 ; un héros banni à chaque partie et jamais joué a `presence = 1`, `banRate = 1` ; partie sans voies : bans comptés, picks non placés (Review Focus 3) ; même entrée → même sortie.
- [ ] FAIL puis implémenter, PASS ; route : `today` = date du serveur, `lastChange` depuis les fiches.
- [ ] Commit `feat(popular): heroes ranked by a recent, fair score, with bans and presence`.

### Task 3: Compositions — regroupement par voie, duos, phases de pick

**Files:** Modify `popular.js` (or new `popular-drafts.js`, `popular-duos.js`), tests ; reuse the pick sequence of `tournament-stats.js` `pickOrderStats`.

**Interfaces — Produces:**
- `groupDrafts(drafts)` : ressemblance = même héros dans la même voie quand les deux compos ont leurs voies, sinon héros en commun (règle actuelle) ; ≥ 3 ; meneur = meilleur `score` pesé, puis plus joué ; groupe montré si `games ≥ minGames`.
- `popularDuos(games, { minGames, limit, today })` → `{ all: [...], byLanes: {"Jungle+Roamer": [...]} }`, entrées `{ heroes:[a,b], lanes, games, wins, score }`.
- `draftPhases(games)` pour un groupe : par héros `{ phase: "first"|"early"|"late"|"last", counterTo: heroId|null }` (seulement les parties `pickOrderKnown`).

- [ ] Tests : deux compos identiques sauf deux héros mais à des voies différentes ne sont pas groupées quand les voies sont connues ; le meneur est le meilleur score ; duo jungle+roam trouvé ; phase « first » pour le 1er pick bleu ; contre-pick = héros adverse pris juste avant.
- [ ] FAIL → implémenter → PASS. Route `/popular` renvoie `duos` et `phases`.
- [ ] Commit `feat(popular): drafts grouped by lane, best duos and pick phases`.

### Task 4: La page Populaires montre tout ça

**Files:** Modify `src/client/features/popular/popular-page-*.js`, CSS de la page, locales (via `add.mjs`), `popular.e2e.mjs`.

- [ ] e2e : onglet « Duos », tri « Présence », taux de ban et de pick visibles sur une carte héros, phase et contre-pick sur une carte compo.
- [ ] Run `node src/testing/run-e2e.mjs popular` → FAIL ; implémenter ; PASS.
- [ ] Commit `feat(popular): duos, presence and pick phases on the popular pages`.

### Task 5: Le calcul de la tier list publique

**Files:** Create `src/server/features/tier-lists/public-tier-list.js`, `public-tier-list.test.js`.

**Interfaces — Produces:** `publicTierList({ lanes: popularHeroes(...).lanes, official: documents, heroes, minGames }) -> { lanes: [{ lane, slug, tiers: [{ label, heroes: [{ heroId, source: "tournaments"|"editors", games, winRate, pickRate, score }] }], unranked: [heroId] }], updatedAt }`. Bandes : `t = (score - pire) / (meilleur - pire)` ; SS si t ≥ 5/6, S ≥ 4/6, A ≥ 3/6, B ≥ 2/6, C ≥ 1/6, sinon D ; meilleur = pire → SS. `LANE_SLUGS = { "Clash Lane": "clash", Jungle: "jungle", "Mid Lane": "mid", "Farm Lane": "farm", Roamer: "roam" }`.

- [ ] Tests : meilleur SS, pire D ; sous `minGames` → note à la main avec `source: "editors"` ; note à la main ignorée au-dessus ; ni l'un ni l'autre → `unranked` ; Review Focus 1 et 2 ; ordre stable (score puis nom).
- [ ] FAIL → implémenter → PASS ; commit `feat(tier-list): the public tier list, tournaments first, editors next`.

### Task 6: API, fiche du héros, éditeur

**Files:** Create `src/server/features/tier-lists/public-routes.js` (`GET /api/tier-list`, public, `publicFor` cache) ; Modify `hero-routes-health-heroes.js` (`ratings` → `{ [lane]: { tier, source } }`), `official-routes.js` (GET renvoie `computed: { [heroId]: tier }` des héros classés par les tournois), client hero page (origine du tier) et `src/client/features/ratings/*` (héros classés grisés, tier calculé affiché), tests serveur existants (`tiers.test.js`, routes) et `ratings.e2e.mjs`, `docs/API.md`.

- [ ] Tests : `/api/tier-list` sans session ; la fiche du héros donne le même tier que la liste ; l'éditeur reçoit `computed` ; une série importée change le résultat (cache vidé par l'écriture).
- [ ] FAIL → implémenter → PASS (serveur + `run-e2e.mjs ratings`).
- [ ] Commit `feat(tier-list): the same tier on the hero page and in the editor`.

### Task 7: La page /tier-list

**Files:** Modify `src/shared/routes-table.js` (route `/^\/tier-list(?:\/(clash|jungle|mid|farm|roam))?$/`, view `tier-list`, param `lane`, index true), `routes.js` `pathFor` (WITH_SECTION-like), `page-handler-views.js` (SSR_VIEWS), `page-handler-parts.js` (titre avec le mois et la voie), `page-handler-seo.js` (`ItemList` + fil d'Ariane, sitemap des 6 adresses, llms.txt), `client/app/lazy-pages.js`, menu (`shell/menu.js`), accueil (lien) ; Create `src/client/features/tier-list/` (`tier-list-public-page.js`, `-markup.js`, README) et son e2e `tier-list-public.e2e.mjs` ; `/tier-lists` retitré « Tier list maker » avec lien vers `/tier-list`.

Titre : « HOK Tier List ({month}) — best Honor of Kings heroes for every lane | {site} » ; voie : « HOK {lane} Tier List ({month}) — best Honor of Kings {lane} heroes | {site} ». Mois dans la langue de la page (`Intl.DateTimeFormat`).

- [ ] e2e : le HTML servi (sans JS) contient `h1`, les noms des héros en texte et les tiers ; liens vers les fiches ; filtre par voie ; « Mis à jour le » ; JSON-LD `ItemList` parsable.
- [ ] FAIL → implémenter → PASS ; commit `feat(tier-list): the public tier list page, one per lane`.

### Task 8: Pages par objet, arcane et sort

**Files:** Modify `routes-table.js` (`/items/:id`, `/arcana/:id`, `/spells/:id`, ids du catalogue), `page-handler-parts.js` (titre « HOK {name} — Honor of Kings item: stats, price and passive | {site} », etc.), `page-handler-seo.js` (sitemap, fil d'Ariane), `page-handler-views.js` (SSR), `src/client/features/gamedata/*` (vue détail, liens depuis les listes et depuis le build lab), `gamedata.e2e.mjs`.

- [ ] e2e : `/items/<id>` rendu serveur avec nom, prix, stats, passif en texte ; 404 pour un id inconnu ; chaque carte de `/items` est un lien.
- [ ] FAIL → implémenter → PASS ; commit `feat(gamedata): a page for every item, arcana and spell`.

### Task 9: Titres « HOK », h1, introductions, fiches héros (B + E)

**Files:** Modify `routes-table.js` (titres du tableau de la spec E), `page-handler-parts.js` + `client/app/router.js` `setTitle` (titre héros « {name} build, skills and counters — HOK Honor of Kings | {site} » selon ce que la fiche contient ; description avec voie, rôle, tier, taux de victoire), markup des pages (`heroes`, `gamedata`, `build-lab`, `popular`, `scrims`, `training`, `tier-lists`) pour `h1` + introduction ; `training` : vue visiteur = présentation (combos, réflexes, situations) ; `page-handler-seo.js` : `CollectionPage`/`WebApplication` + fil d'Ariane, sitemap (+ `/training`, `/scrims`, pages de détail), llms.txt ; Create `src/server/platform/http/seo-titles.test.js`.

- [ ] Tests : chaque route publique indexée a un titre contenant « HOK » et « Honor of Kings » ; sitemap contient `/training`, `/scrims`, `/tier-list/jungle`, une page d'objet ; e2e : `h1` et introduction dans le HTML servi de chaque page publique.
- [ ] FAIL → implémenter → PASS ; commit `feat(seo): every public page aimed at its HOK search`.

### Task 10: Les adresses par langue — module partagé

**Files:** Create `src/shared/locale-path.js`, `locale-path.test.js`.

**Interfaces — Produces:** `splitLanguage(pathname) -> { language: code|null, path }` (`/fr/heroes` → `{fr, /heroes}`, `/fr` → `{fr, /}`, `/zz/heroes` → `{null, /zz/heroes}`, `/en/...` → `{null, /en/...}` : l'anglais n'a pas de préfixe) ; `localePath(path, language)` (inverse ; `en` → path) ; `alternates(path) -> [{ language, path }]` des 15 langues.

- [ ] Tests des cas ci-dessus, aller-retour, RTL sans effet. FAIL → implémenter → PASS ; commit `feat(i18n): one address per language`.

### Task 11: Le serveur parle par adresse

**Files:** Modify `page-handler.js`, `page-handler-decide.js`, `server-i18n.js` (`requestLanguage` prend le préfixe d'abord), `page-handler-seo.js` (`<link rel="alternate" hreflang>` ×15 + `x-default`, canonique dans la langue, sitemap avec `xhtml:link`), `prerender*.js` (rendu de l'adresse préfixée), tests serveur (page handler, SEO).

- [ ] Tests : `/fr/heroes` → 200, `lang="fr"`, canonique `/fr/heroes`, 16 alternates réciproques ; `/zz/heroes` → 404 ; `/heroes` sans cookie ni langue → 200 anglais ; avec cookie `fr` → 302 `/fr/heroes`, `Vary: Cookie, Accept-Language` ; sitemap : chaque adresse avec ses 15 versions ; pages privées `noindex` même préfixées.
- [ ] FAIL → implémenter → PASS ; commit `feat(i18n): the server answers each language at its own address`.

### Task 12: Le navigateur garde la langue de l'adresse

**Files:** Modify `client/app/router.js` (`matchRoute(splitLanguage(location.pathname).path)`, `syncUrl` via `localePath`), le changement de langue (settings / menu : aller à la même page sous le nouveau préfixe), une passe `localizeLinks(root, language)` après chaque rendu (liens `a[href^="/"]` internes préfixés, aussi dans la capture du rendu serveur) ; e2e `i18n-addresses.e2e.mjs`.

- [ ] e2e : ouvrir `/fr/tier-list`, cliquer un héros → `/fr/heroes/<id>` en français ; changer de langue → `/es/heroes/<id>` ; HTML servi de `/fr/items` : liens internes en `/fr/`.
- [ ] FAIL → implémenter → PASS ; commit `feat(i18n): links and the language menu keep the address language`.

### Task 13: Traductions, vérifications finales, doc

- [ ] `node scripts/i18n/add.mjs` pour tous les textes nouveaux ; `keys.mjs` propre.
- [ ] `npm test` (unit), chaîne e2e complète, Lighthouse SEO sur `/tier-list` et `/fr/tier-list` (desktop + mobile, VS Code fermé si possible).
- [ ] `docs/DECISIONS.md` : révision (notes officielles publiées en liste, tournois d'abord, adresses par langue, réglages `guess`) ; `docs/API.md` ; READMEs des dossiers touchés.
- [ ] Commit `docs(seo): decisions and API of the public tier list and the language addresses`.
