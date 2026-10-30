# REPORT — refonte HOK Global Scrim Lab

Branche : `refonte`. Rapport mis à jour à la fin de chaque phase.

---

## Étape A — Vérification (aucune modification de code)

Faite le 2026-10-01 sur le dépôt réel : `npm ci` OK (0 vulnérabilité), `npm test` 18/18 verts,
MySQL 8.4 démarré via Docker Compose, app lancée sur un port de test, requêtes SQL exécutées.
Base utilisateur existante : 119 héros, 7 séries locales, 1 tier list, 0 série en ligne.

### Confirmé

| #   | Sév.     | Zone                                                      | Constat                                                                                                                                                                                | Preuve                                                    |
| --- | -------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | CRITICAL | `server.js` `POST /api/series/import`                     | Sans auth, `id` fourni par le client, upsert via `saveSeries` : écrasement de n'importe quelle série.                                                                                  | Lecture du code (aucun garde, `ON DUPLICATE KEY UPDATE`). |
| 2   | CRITICAL | `database.js` `listSeries`, `server.js` `/api/series/:id` | IDOR : `listSeries` ne filtre que les séries online.                                                                                                                                   | `GET /api/series` anonyme renvoie les 7 séries.           |
| 3   | CRITICAL | `/api/tier-lists`                                         | Globales, sans propriétaire, `PUT` crée/écrase n'importe quel ID.                                                                                                                      | `GET /api/tier-lists` anonyme renvoie la tier list.       |
| 4   | HIGH     | `PUT /api/series/:id`                                     | Objet entier accepté ; le front l'utilise aussi pour la durée (état périmé possible, `app.js` l.490) et pour fixer `draftMode` à la création (l.507).                                  | Lecture.                                                  |
| 5   | HIGH     | `server.js`                                               | Verrou mémoire seulement sur `ready` et `advance` ; `action`, `game`, `complete`, `timer/*` non verrouillés ; last-write-wins.                                                         | Lecture.                                                  |
| 6   | HIGH     | `POST /api/roster/sync`                                   | Public, lance Chromium `--no-sandbox`, sans single-flight ni cooldown.                                                                                                                 | Lecture.                                                  |
| 7   | HIGH     | Abus                                                      | Création anonyme illimitée ; `listSeries` charge toute la table ; pas de limite de longueur des noms.                                                                                  | Lecture.                                                  |
| 8   | HIGH     | En ligne                                                  | Tout participant peut supprimer, enregistrer le résultat, piloter les timers.                                                                                                          | Lecture.                                                  |
| 9   | MEDIUM   | Headers                                                   | Aucun header de sécurité ; `X-Powered-By: Express` exposé.                                                                                                                             | `curl -I`.                                                |
| 10  | MEDIUM   | Cookies                                                   | `Secure` seulement si `COOKIE_SECURE=true` ; session fixe 30 j ; aucune purge.                                                                                                         | Lecture.                                                  |
| 11  | MEDIUM   | `route()`                                                 | Renvoie `error.message` brut ; pas de handler global ; `*path` renvoie `index.html` pour `/api/nope` (HTTP 200 text/html).                                                             | `curl`.                                                   |
| 12  | MEDIUM   | Noms d'équipes                                            | Deux équipes de même nom acceptées alors que score/règles se basent sur le nom.                                                                                                        | Lecture `createSeries`.                                   |
| 13  | MEDIUM   | Secrets                                                   | Mot de passe de repli `hok_dev_password` (`database.js` l.8), défauts docker-compose, aucun refus en production.                                                                       | Lecture.                                                  |
| 14  | MEDIUM   | Imports                                                   | Aucune validation de forme.                                                                                                                                                            | Lecture.                                                  |
| 15  | LOW      | OAuth                                                     | `returnTo` par préfixe de chaîne ; pas de PKCE ; pas de rate limit `/auth/*` ; pas de `trust proxy` ; pas de SIGTERM ; Chromium à chaque démarrage ; README cite `docker_compose.yml`. | Lecture.                                                  |

### Hypothèses fonctionnelles

- **6ᵉ Flowborn — CONFIRMÉ, avec nuance.** La source n'est pas seulement `app.js` : la table `heroes`
  contient réellement une ligne legacy `id='flowborn'` (5 lanes, `available_global=0`, `source_ids_json`
  = les 5 IDs). Elle est masquée du roster actif, mais l'unique tier list existante contient
  l'ID `"flowborn"` dans ses listes ; `normalizeTierList` / `currentHero` le conservent, d'où un
  6ᵉ « Flowborn » affiché. Aucune série n'y fait référence. C'est aussi l'unique héros « multi-lane »
  de la base (`multi_lane = 1`). Les 5 formes 581–585 sont correctes (une lane chacune).
- **`pickSlotRow` — CONFIRMÉ par lecture.** Les emplacements sont étiquetés par `PICK_LANES[index]`
  fixe, alors que le serveur échange les lanes (`pickLaneOrder`, `pickAssignments`) : un héros pické
  en 2ᵉ position peut avoir la lane Jungle assignée mais s'afficher dans l'emplacement « Clash ».
  À corriger en phase 6 en lisant `pickAssignments` (test à ajouter avant).
- **XSS — pas d'injection trouvée.** Relecture complète d'`app.js` : toutes les données interpolées
  dans `innerHTML` passent par `escapeHtml` (attributs entre guillemets doubles). `LANE_ICON_URLS`
  vient d'une constante locale. Les images Google (`picture`) sont échappées. Risque résiduel :
  fragilité structurelle (templates), donc CSP en phase 1.
- **Timer client — CONFIRMÉ.** `Date.now()` client contre `deadline` serveur : un décalage d'horloge
  fausse le décompte. Prévoir `serverTime` dans les réponses (phase 1 serveur, phase 6 client).

### Nouveaux problèmes trouvés

| Sév.   | Zone                         | Problème                                                                                                                                                                    | Scénario                                | Correction                                                  | Priorité |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- | -------- |
| MEDIUM | JSON invalide                | `express.json` sans handler d'erreur : la réponse est une page HTML contenant la **stack trace avec chemins absolus** du serveur.                                           | `PUT /api/tier-lists/x` avec corps `{`. | Handler global JSON, erreurs typées.                        | P1       |
| MEDIUM | `server.js` import top-level | `await store.initializeDatabase()` + `listen` à l'import : API non testable.                                                                                                | —                                       | `createApp()` (étape B).                                    | P0       |
| MEDIUM | Roster                       | `saveHeroes` marque `available_global=FALSE` tout héros absent d'une réponse partielle valide (≥ 80 lignes) : un roster tronqué retire des héros sans alerte.               | Camp renvoie 80 lignes sur 118.         | Seuil relatif au dernier roster + journalisation du delta.  | P2       |
| LOW    | `joinOnlineSeries`           | Messages d'erreur `Error` simples → 400 ; la course sur `updatedAt` est correcte (verrou), mais l'invitation reste lisible par l'équipe B après usage.                      | —                                       | N'exposer le code qu'au créateur.                           | P2       |
| LOW    | `draft.js`                   | `applyDraftAction` lève sur pick expiré en appelant `advanceDraft`, mais renvoie sans erreur : le client croit son pick accepté.                                            | Pick tardif sur step pick.              | Test caractérisant le comportement, comportement documenté. | P3       |
| LOW    | CSP                          | 3 attributs `style=""` inline dans `app.js` (l.218, l.285, l.346) à refactorer pour une CSP stricte ; `lanes.js` utilise des `data:` URI (`img-src data:` nécessaire). | —                                       | Classes CSS.                                                | P1       |
| INFO   | Environnement                | `.env` ne définit aucune variable `DB_*` : `npm start` hors Docker échoue (repli `hok_dev_password` ≠ défaut compose `hok_local_app_password`).                             | —                                       | Retrait du repli, doc claire.                               | P1       |

### Points solides confirmés

SQL entièrement paramétré ; tokens de session hachés SHA-256 ; `state` OAuth en `timingSafeEqual` ;
`email_verified` exigé ; cookies HttpOnly + SameSite ; invitations 64 bits ; `joinOnlineSeries`
transactionnel avec `FOR UPDATE`.

Passage à l'étape B autorisé : rapport écrit.

---

## Étape B — Phase 0 : filet de sécurité (terminée)

**Ce qui a été fait**

- `createApp({ store, config, rosterSync })` (`src/app.js`) ; `src/server.js` ne fait plus que démarrer (config, migrations, `listen`, tâches de fond, arrêt propre).
- Suite de tests HTTP exécutée contre une base MySQL **isolée par fichier de test** (`hok_test_<aléa>`, créée puis supprimée), ignorée proprement si MySQL est injoignable.
- Sauvegarde/restauration : `scripts/backup-mysql.ps1`, `scripts/restore-mysql.ps1` (dump vérifié : restauré dans une base de contrôle, 7 séries / 119 héros retrouvés).
- README : nom du fichier compose corrigé.

**Commits** : `c9eb370` (createApp + tests de base), `82ac930` (scripts + README).

**Sauvegarder avant toute migration (PowerShell)**

```powershell
docker compose up -d mysql
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-mysql.ps1
# Restauration (arrêter l'app avant) :
docker compose stop hok-scrim-lab
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\restore-mysql.ps1 -File backups\hok_scrim-AAAAMMJJ-HHMMSS.sql -Yes
```

---

## Étape C — Phase 1 : sécurité et autorisations (terminée)

### Ce qui a changé

| Domaine         | Changement                                                                                                                                                                                                                                                                                                                         | Fichiers                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Migrations      | Table `schema_migrations`, verrou MySQL (un seul migrateur), migrations 001 (baseline) et 002 (propriétaire, `version`, `*_members`, `*_invites`, invités). **Additif** : aucune donnée réécrite.                                                                                                                                  | `src/migrations/*`                             |
| Propriété       | `owner_user_id` sur `series` et `tier_lists` ; **toute** requête filtre par propriétaire ou membre ; 404 sinon. Lignes existantes = orphelines (invisibles), séries en ligne rattachées à leur créateur.                                                                                                                           | `src/database.js`                              |
| Invités         | Cookie httpOnly 256 bits, jeton haché, créé à la première création ; fusion dans le compte Google à la connexion.                                                                                                                                                                                                                  | `src/http/identity.js`, `google-auth.js`       |
| Partage         | Invitations à usage limité, expirantes (7 j par défaut), rôles viewer/editor, révocation, départ d'un membre. Jeton visible une seule fois, haché en base.                                                                                                                                                                         | `src/routes/sharing.js`                        |
| API séries      | `PUT /api/series/:id` **supprimé**. Endpoints ciblés : `PATCH /series/:id/games/:index` (durée), `game`, `ready`, `action`, `advance`, `timer/*`, `complete`. Import : identité requise, nouvel ID, propriétaire serveur, validation stricte (types, tailles, IDs de héros existants, champs inconnus refusés, draft reconstruit). | `src/routes/series.js`, `src/validation.js`    |
| Droits en ligne | Voir `DECISIONS.md` et `src/policy.js`.                                                                                                                                                                                                                                                                                            | `src/policy.js`                                |
| Concurrence     | `SELECT … FOR UPDATE` en transaction sur **toutes** les mutations ; `expectedVersion` optionnel → 409 ; `advance` sans effet n'écrit rien. Plus aucun verrou en mémoire.                                                                                                                                                           | `src/database.js`                              |
| Noms d'équipes  | 1–40 caractères, pas de contrôle ni `<>`, distincts (insensible à la casse).                                                                                                                                                                                                                                                       | `src/domain/series.js`                         |
| Rate limiting   | auth, création, join, actions de draft, import, export (réservé phase 8), sync roster, partage, écritures ; `TRUST_PROXY` configurable.                                                                                                                                                                                            | `src/http/rate-limits.js`                      |
| Headers         | CSP stricte (`script/style/font 'self'`, images Camp + Google + `data:` pour les icônes de lane, `frame-ancestors 'none'`, `object-src 'none'`), `nosniff`, referrer, permissions-policy, COOP/CORP, HSTS si cookies Secure ; `X-Powered-By` retiré ; `Cache-Control: no-store` sur l'API.                                         | `src/http/security.js`                         |
| CSRF            | Refus des mutations cross-site (`Sec-Fetch-Site`, `Origin`).                                                                                                                                                                                                                                                                       | `src/http/security.js`                         |
| Cookies         | `Secure` par défaut en production, `__Host-` quand Secure, sessions glissantes 30 j / 90 j absolu, purge horaire, rotation à la connexion.                                                                                                                                                                                         | `src/http/identity.js`                         |
| OAuth           | PKCE S256, `returnTo` validé par parsing d'URL, rate limit `/auth/*`.                                                                                                                                                                                                                                                              | `google-auth.js`                               |
| Erreurs         | `HttpError`/`DomainError`, JSON partout, 404 JSON pour `/api/*`, 500 générique + `requestId`, détail uniquement dans les logs (clés sensibles masquées). Fin de la stack trace HTML.                                                                                                                                               | `src/errors.js`, `src/app.js`, `src/logger.js` |
| Roster          | Sync **admin**, single-flight, cooldown, garde-fou « roster qui rétrécit », Chromium non lancé à chaque démarrage (attend 12 h depuis la dernière synchro), `--no-sandbox` seulement dans Docker.                                                                                                                                  | `src/services/roster-sync.js`                  |
| Secrets         | Plus de mot de passe de repli ; refus de démarrer en production avec secret par défaut/court. Compose dev / prod séparés.                                                                                                                                                                                                          | `src/config.js`, `docker-compose*.yml`         |
| Front           | API paginée, horloge serveur (`serverTime`), `expectedVersion` sur les picks, création de tier list par `POST`, durée par `PATCH`, boutons de partage, acceptation `?invite=`, plus de `style=""`, polices locales.                                                                                                                | `public/*`                                     |

### Tests ajoutés (85 au total, `npm test` vert)

`security.authz` (IDOR, import écrasant/hostile, tier lists, partage, rôles en ligne, invités, orphelins), `security.http` (headers, erreurs, CSRF, cookies, sessions, rate limit, sync admin/single-flight/cooldown), `concurrency` (picks simultanés, versions, expiration de timer, horloge serveur), `config-and-validation`, `migrations` (base héritée, idempotence, démarrage concurrent), `api.core` (fonctionnel). Vérification navigateur (Chromium/Playwright, hors suite) : chargement, navigation, création de série, draft, tier list, isolation entre deux navigateurs — **aucune erreur console ni violation CSP**.

### Commandes PowerShell pour tester à la main

```powershell
docker compose up -d mysql
npm ci
$env:DB_PASSWORD = "hok_local_app_password"; $env:DB_PORT = "8080"
npm test
npm start            # http://localhost:3000
```

Rattacher vos anciennes données (une seule fois, **après vous être connecté une fois avec Google**) :

```powershell
# 1) comptage sans rien modifier
node --env-file=.env scripts\claim-legacy.js --email ton-adresse@gmail.com
# 2) rattachement
node --env-file=.env scripts\claim-legacy.js --email ton-adresse@gmail.com --apply
```

Pour activer le bouton « Sync roster » : ajoutez `ADMIN_EMAILS=votre.email@gmail.com` dans `.env`.

### Vérification que l'existant fonctionne toujours

Drafts, BO1–BO7, Global Ban & Pick (+ Flowborn), Free For All, draft en ligne (2 joueurs, ready check), timers de game, tier lists, export/import JSON, historique : couverts par `api.core`, `security.authz` (parcours en ligne) et le test navigateur. **Non vérifié ici** : connexion Google réelle (identifiants OAuth externes) et synchro Chromium réelle (couvertes par injection/mocks).

### À vérifier visuellement par vous

- Le bouton « Sync roster » n'apparaît que pour un admin.
- Après `claim-legacy --apply`, vos 7 séries et votre tier list réapparaissent.
- Boutons « Copy view link / Copy edit link » sur une série et une tier list ; ouvrir le lien dans une fenêtre privée.
- Aucune police ni image cassée.

### Limites connues de la phase 1

- Connexion Google non testée de bout en bout (pas d'identifiants de test) ; la fusion invité → compte est testée au niveau base.
- `docker-compose.prod.yml` validé syntaxiquement (refus sans secrets) mais pas lancé en conditions réelles.
- La liste du front est limitée à 100 séries jusqu'à la phase 7.

---

## Phase 2 — Tier lists v2 (terminée)

**Fait**

- Migration 003 : `tier_lists.lane` (`NULL` = All Roles). Toutes les tier lists existantes restent des listes « All Roles », données inchangées.
- `src/domain/tier-list.js` : normalisation **côté serveur** à chaque lecture/écriture : purge de l'ID legacy `"flowborn"` et des IDs inconnus du roster ; liste de lane = héros de la lane uniquement, **un seul Flowborn** (la forme de la lane) ; « All Roles » = les 5 formes (IDs 581–585 conservés) ; un héros n'apparaît qu'une fois ; les nouveaux héros arrivent dans Unranked ; sans roster (jamais synchronisé) rien n'est perdu. La lecture ne réécrit pas la base ; le nettoyage est persisté à la prochaine sauvegarde.
- `GET /api/heroes` expose `displayName` (« Flowborn » pour les 5 formes) et `isFlowborn`. Les noms officiels (« Flowborn (Tank) ») restent en base et dans le draft.
- API : `POST /api/tier-lists` accepte `lane` ; la lane est **immuable** ensuite ; `GET /api/tier-lists?lane=all|<Lane>&q=<nom>`.
- Front : choix de la lane à la création, filtre par lane, badge de lane sur les formes Flowborn dans « All Roles », Unranked en **avatars seuls** (nom en infobulle + `aria-label`), lecture seule pour les spectateurs (viewer), boutons de partage.
- Partage : liens d'invitation viewer/editor (phase 1) intégrés à la barre d'outils.

**Fichiers** : `src/domain/{heroes,tier-list}.js`, `src/migrations/003-tier-list-lane.js`, `src/routes/{tier-lists,heroes}.js`, `src/database.js`, `public/app.js`, `public/styles.css`, `tests/tier-list.test.js`, `tests/e2e/*`.

**Tests** : 102 au total, `npm test` vert (17 nouveaux : normalisation, Flowborn, lane, filtres, ancien format, idempotence). Parcours navigateur `npm run test:e2e` : Flowborn unique en lane, 5 formes + badges en All Roles, aucun « (role) », Unranked sans noms visibles, glisser-déposer persistant, filtre par lane.

**Tester à la main (PowerShell)**

```powershell
npm start
# http://localhost:3000 → Tier Lists → choisir « Mid » puis « New tier list »
npm run test:e2e   # nécessite Chromium Playwright (déjà installé) et MySQL
```

**À vérifier visuellement** : badge de lane sur les Flowborn d'« All Roles » (taille/position), densité des avatars Unranked, rendu de votre ancienne liste après `claim-legacy --apply` (le 6ᵉ Flowborn a disparu).

---

## Phases 3 et 4 — Données héros, import compétitif, pages Heroes et fiche héros (terminées)

**Ce qui est fait**

- **Aucune donnée « ranked »** : `banRate`, `showRate`, `winRate`, `tRank` de Camp sont ignorés par l'adaptateur (test dédié) et n'existent ni en base ni dans l'API.
- **Import compétitif manuel, admin uniquement** (`POST /api/admin/competitive-imports`, JSON ou CSV, bouton « Import competitive data » sur la page Heroes) : provenance obligatoire (`source`, `sourceUrl` https, `region`, `patch`, date, licence CC BY-SA 3.0/4.0, texte d'attribution), **Global uniquement** (`confirmGlobalOnly`, refus des mentions Chine/KPL/AoV/RoV/Garena), **héros identifiés par leur ID Camp** (une ligne sans `heroId` ou avec un ID inconnu est refusée ; les noms ne servent jamais à faire correspondre). Taux calculés depuis les compteurs bruts. Format : `docs/COMPETITIVE_IMPORT.md`.
- **Lanes manuelles** (`POST/DELETE /api/admin/heroes/:id/lanes`) : marquées `manual`, conservées aux synchros, alimentent les tier lists de lane ; Flowborn exclu ; lanes Camp non retirables. Migration 004.
- **Fiche héros** (`GET /api/heroes/:id`) : portrait, classe, lanes (étiquette « manual »), statistiques compétitives **seulement si importées** (avec source, région, patch, licence, attribution), « Tes scrims », « Data unavailable » pour les détails Camp et les ajustements de patch.
- **« Tes scrims »** (`GET /api/heroes/:id/scrims`, `GET /api/stats/heroes`) : calculé uniquement depuis **vos** séries (créées par vous ou jouées en ligne ; les séries simplement partagées sont exclues). Seuil `MIN_SAMPLE_GAMES` (30 par défaut, `?minGames=` pour l'ajuster) : en dessous, les compteurs sont affichés mais les pourcentages sont remplacés par **« Insufficient sample (n/30) »** — win rate, pick rate, synergies et matchups.
- Page Heroes : filtres lane/classe, carte → fiche, outils admin.

**Non fait, faute de ressource externe (voir `DECISIONS.md`)** : détails de héros et ajustements de patch Camp (aucune capture dans `docs/samples/`, endpoints non vérifiés) ; détachement du roster de l'endpoint de classement (pas d'endpoint de liste de héros capturé). `docs/CAMP_CAPTURE.md` explique pas à pas quoi capturer.

**Fichiers** : `src/domain/{competitive,scrim-stats}.js`, `src/routes/{admin,heroes}.js`, `src/migrations/004-hero-data.js`, `src/validation.js`, `src/database.js`, `public/app.js`, `public/styles.css`, `docs/*`, `tests/{hero-data,scrim-stats}.test.js`, `src/client/features/heroes/heroes.e2e.mjs`.

**Tests** : 126 (`npm test` vert) + `npm run test:e2e` (3 parcours navigateur).

**Tester à la main (PowerShell)**

```powershell
# dans .env : ADMIN_EMAILS=votre.email@gmail.com   puis :
npm start
# Heroes → un héros : « Data unavailable » partout sauf « Tes scrims ».
# Admin : « Import competitive data » avec un fichier au format de docs\COMPETITIVE_IMPORT.md
```

**À vérifier visuellement** : mise en page de la fiche héros (sera retravaillée en phase 5), libellés « Insufficient sample ».

---

## Phase 5 — Design system et logo (terminée)

**Fait**

- Jetons de design « Broadcast Arena » dans `public/styles.css` (navy `#070D1F`, électrique `#2D6BFF`, cyan `#29D3FF`, blanc `#F4F8FF`), ancien thème vert citron entièrement retiré. Touches « Crystal Draft » : reflets en facettes sur les cartes de héros, cadre à coins coupés autour du portrait de la fiche héros, surfaces éclairées par le haut.
- **Le bleu de marque est distinct du bleu Blue Team** : en aplat l'interface n'utilise que le cyan (ΔE 64 avec `#2F80FF`) et l'indigo (ΔE 25) ; l'électrique (ΔE 17, contraste 4,2:1 sous du texte) est réservé aux dégradés. `--team-blue` n'est utilisé que dans des règles de contexte d'équipe, toujours avec un libellé de côté. Red Team `#FF4D5E`.
- **Logo « Lames jumelles »** (`src/public/logo.svg`, aussi favicon) : deux lames en miroir découpées (masque SVG, vraie transparence) dans une tuile dégradée ; l'espace négatif dessine un H. Contrôlé à 16/24/32/64/160 px sur fond sombre et clair.
- Accessibilité : lien « Skip to content », focus visible cyan, `prefers-reduced-motion`.
- Documentation : `docs/DESIGN.md` (palette, règles, contrastes, logo).

**Tests** : 135 (`npm test` vert), dont `tests/design.test.js` : valeurs de palette, **toutes les paires de texte ≥ 4,5:1**, ΔE marque/équipe, bleu d'équipe confiné aux règles d'équipe, aucun reste du thème précédent, aucun `style=` inline, logo valide. `npm run test:e2e` : 3 parcours navigateur propres.

**Aperçu visuel** : `node tests\e2e\screenshots.mjs captures` génère des captures (Overview, Heroes, fiche héros, Tier Lists, Scrims, History, mobile) dans le dossier `captures`.

**À vérifier visuellement par vous** : le logo à 16 px dans l'onglet du navigateur ; le rendu des cartes de héros avec les vrais portraits Camp (les captures utilisent un pixel de remplacement) ; l'équilibre cyan/navy sur votre écran.

---

## Phase 6 — Refonte draft / Scrims (terminée)

**Fait**

- **Rendu par slot, sans re-render complet** : `public/draft-view.js` construit le plateau une fois par game puis ne modifie que les slots/textes qui changent ; la page est découpée en régions qui ne sont réécrites que si leur HTML change. Vérifié dans le navigateur : après un pick, les mêmes nœuds DOM (pool de héros, panneaux, champ de recherche) sont conservés ; la recherche garde son texte.
- **Bug `pickSlotRow` confirmé puis corrigé** : un test montre qu'un héros Mid pické en premier apparaissait sous l'étiquette « Clash ». Les picks sont désormais placés selon `pickAssignments` (lane réellement assignée), avec repli sur l'ordre pour les anciennes games.
- **Nouveau bug trouvé et corrigé : le côté Red n'était pas miroir.** Le CSS cumulait `direction: rtl` et `flex-direction: row-reverse` (double inversion = identique à Blue). Le miroir est maintenant obtenu par `flex-direction: row-reverse` + `text-align: right` uniquement ; **aucun `scaleX(-1)`** (vérifié par le test navigateur : aucun `transform` dans le plateau, panneaux de même largeur, slots symétriques par rapport à la colonne centrale).
- **Ready check** pour les deux modes : pastilles « Blue ready / Red ready », bouton « I'm ready » par équipe en ligne, « Start draft » en local ; horloge « idle » tant que le draft n'a pas démarré.
- **Horloge à trois états** (normal / warning ≤ 5 s / expired) + états idle/done ; l'état n'est jamais porté par la couleur seule (« LAST 5 SECONDS », « TIME UP »), annonce vocale aux lecteurs d'écran, temps serveur (`serverTime`), résolution des échéances demandée au serveur au plus 1 fois/s. Le badge « GAME TIMER » s'actualise maintenant aussi en phase de résultat (il restait figé avant).
- **Scoreboard** : score, « First to N · BOn », puce BLUE/RED pour chaque équipe, équipe B en miroir, avatars en ligne.
- **Navigation des games** : puces par game (résultat, durée, côté bleu), clic = plateau en lecture seule avec bans/picks et résultat ; flèches ← → / Début / Fin entre les games ; retour à la game en cours.
- **`prefers-reduced-motion`** : plus d'animation sur l'horloge expirée ni sur les slots.
- **Responsive** : 3 colonnes ≥ 900 px, centre au-dessus en dessous, une colonne sous 560 px ; aucun défilement horizontal à 390 px et 768 px (vérifié).
- Annonces `aria-live`, libellés accessibles par slot, bouton de pick protégé contre le double-clic.

**Tests** : 152 (`npm test` vert) dont `tests/draft-model.test.js` (confirmation du bug, lanes, états d'horloge, disponibilité des héros) ; `npm run test:e2e` : 4 parcours navigateur propres (`src/client/features/draft/draft.e2e.mjs` : 22 vérifications).

**À vérifier visuellement par vous** : le placement des picks sous les bons labels de lane pendant une vraie draft ; le miroir Red/Blue sur votre écran ; la lisibilité de l'horloge à 5 s ; l'affichage téléphone.

---

## Phase 7 — Overview et History (terminée)

- **Filtres et pagination côté serveur** : `GET /api/series` accepte `status`, `mode`, `draftMode`, `q` (nom d'équipe, insensible à la casse, jokers LIKE échappés), `from`/`to` (jours, bornes incluses), `sort`, `page`, `pageSize` (≤ 100), `view=summary`. Valeurs invalides → 400. Migration 005 : colonnes indexées copiées du blob (backfill en lecture seule), tenues à jour à chaque sauvegarde.
- Nouveaux endpoints : `GET /api/overview` (compteurs + 5 séries actives + 5 récentes, résumés légers), `GET /api/stats/overview` (séries/games, durées moyenne/min/max, victoires côté Blue/Red avec seuil), `GET /api/stats/heroes` (paginé, tri `order`, recherche de héros, seuil d'échantillon). Tout est limité à vos scrims.
- Front : l'Overview ne télécharge plus toutes les séries ; la page History a un formulaire de filtres, un pager, des statistiques et un tableau de héros paginés (« Insufficient sample (n/30) » sous le seuil).
- Tests : `tests/history.test.js` (14), `src/client/features/history/history.e2e.mjs` (14 vérifications).

## Phase 8 — Export PDF (terminée)

- `POST /api/export/pdf` : identité requise, **filtre par propriétaire**, rate limit (6/h), **100 séries maximum** (« 100 series maximum per export. Narrow the date range or filters. », HTTP 422), file de génération bornée (1 actif, 4 en attente, 1 par utilisateur, timeout 90 s, 503 + `Retry-After`).
- **Gabarit HTML dédié** (`src/templates/export-report.js`) rendu par Chromium : couverture, tableau récapitulatif, un bloc par série et par game (bans, picks sous leur lane, durée, vainqueur), pied de page numéroté. Polices locales (`public/fonts`), logo, portraits **depuis un cache local** (téléchargés seulement depuis `camp.honorofkings.com`, placeholder sinon). Chromium : JavaScript désactivé, **réseau bloqué** sauf `http://pdf.local` servi depuis disque/mémoire (testé : une image, une feuille de style et un script externes sont avortés et signalés).
- Front : bouton **Export PDF** (History) qui télécharge le fichier ; bouton désactivé et message exact au-delà de 100 séries. **Export JSON conservé** (série, game, tier list).
- Tests : `tests/export.test.js` (20, dont Chromium réel), `src/client/features/history/export.e2e.mjs` (téléchargement réel). Aperçu : `node tests\e2e\export-preview.mjs apercu`.

## Phase 9 — Tests de renfort (terminée)

- `tests/oauth.test.js` : parcours Google complet avec endpoints Google simulés — `state`, **PKCE** (le vérificateur envoyé correspond au challenge), refus sans `state`, fusion invité → compte, **rotation de session**, ancien cookie invité invalidé, e-mail non vérifié / échec d'échange (message générique), `returnTo` hostile → `/`, déconnexion, cookies `__Host-` + Secure en production.
- `tests/robustness.test.js` : **fuzzing déterministe** de tous les endpoints d'écriture (corps JSON hostiles, pollution de prototype, JSON invalide, 3 Mo, imbrication profonde, types de contenu erronés), 300 requêtes de liste aléatoires (injection SQL, jokers…), identifiants de chemin étranges, et **matrice d'autorisation** (toutes les routes d'une série/tier list d'autrui répondent 404/403 ; routes admin 401/403). **A trouvé un vrai défaut** : une URL à pourcentage invalide (`/api/series/%E0%A4%A`) donnait un 500 → corrigé (400).
- `src/client/xss.e2e.mjs` : chaînes hostiles (nom de compte Google, noms de héros et classes du roster, nom de tier list et d'étage, source/attribution d'un import compétitif, URL source) affichées partout comme **texte** : aucun script exécuté, aucun attribut injecté.
- `tests/lifecycle.test.js` (arrêt propre), garde-fous de design (`tests/design.test.js`), modèle de draft (`tests/draft-model.test.js`).

## Phase 10 — Durcissement production (terminée)

- Arrêt propre : `src/lifecycle.js` (SIGTERM/SIGINT → ferme le serveur, libère timers et pool MySQL, délai maximal 10 s, code de sortie 0/1), gestionnaires `unhandledRejection`/`uncaughtException` (journalisés sans secret).
- Santé : `GET /api/health/live` (processus) et `GET /api/health` (MySQL).
- Docker : `.dockerignore` resserré (plus de sauvegardes, docs, tests, captures dans le contexte), labels, `docker-compose.prod.yml` : `read_only`, `tmpfs /tmp`, `cap_drop ALL`, `no-new-privileges`, limites mémoire/PID, healthcheck, secrets obligatoires.
- **Vérifié sur une vraie image** (projet Docker isolé `hokprod`, port 13000, puis supprimé) : build, migrations sur base vierge, utilisateur `node` (non-root), `/app` en lecture seule, `/tmp` inscriptible, HSTS + CSP + `nosniff`, cookie `__Host-hok_session`, **export PDF avec Chromium dans le conteneur durci** (66 Ko), écriture cross-origin refusée (403), `docker stop` → journal « shutting down » et code de sortie 0, refus de démarrer avec `hok_local_app_password` en production.
- Journaux JSON sans secret (clés `cookie`, `authorization`, `token`, `secret`, `password`, `session`, `code` masquées ; test dédié).

---

# Synthèse finale

## État

- Branche `refonte` (jamais poussée). **207 tests unitaires/HTTP verts** (`npm test`) + **94 vérifications navigateur** (`npm run test:e2e`, 7 parcours Chromium) propres.
- Tout l'existant fonctionne : drafts solo / 2 joueurs local / en ligne, BO1–BO7 et formats libres, Global Ban & Pick (+ Flowborn), Free For All, tier lists, synchro du roster, history, export/import JSON, Google auth (testé avec Google simulé).

## Ce que vous devez faire (PowerShell)

```powershell
cd %USERPROFILE%\Documents\drafts_hok
git switch refonte
# dans .env, ajouter :  ADMIN_EMAILS=votre.email@gmail.com
docker compose up -d mysql
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-mysql.ps1
npm ci
$env:DB_PASSWORD = "hok_local_app_password"; $env:DB_PORT = "8080"   # ou les mettre dans .env
npm test
npm start                                  # http://localhost:3000 -> se connecter une fois avec Google
node --env-file=.env scripts\claim-legacy.js --email votre.email@gmail.com           # compte les lignes orphelines
node --env-file=.env scripts\claim-legacy.js --email votre.email@gmail.com --apply   # rattache vos 7 séries et votre tier list
```

Pour tout lancer en Docker : `docker compose up --build`.

## Décisions prises sans vous (détail dans `DECISIONS.md`)

Validation maison (pas de `zod`) · invités = utilisateurs sans Google · import/création exigent une identité (invité ou Google), le jeu en ligne exige Google · droits en ligne explicites (créateur : démarrer/résultat/durée/suppression/partage ; participants : ready, timers, picks de leur côté) · `ADMIN_EMAILS` pour les actions admin · « Tes scrims » = séries créées ou jouées en ligne (pas celles seulement partagées) · seuil d'échantillon 30 sur tous les pourcentages · import compétitif : Global confirmé, par ID Camp uniquement, CC BY-SA obligatoire · IDs inconnus supprimés des tier lists à la normalisation · lane de tier list immuable · polices OFL hébergées localement · export PDF limité à vos séries, POST seulement.

## Limites connues

- **Détails de héros et ajustements de patch Camp : non implémentés** (aucune capture dans `docs/samples/`, endpoints non vérifiés) : « Data unavailable ». Le roster dépend toujours de l'endpoint de classement. Voir `docs/CAMP_CAPTURE.md` pour fournir les captures.
- **Connexion Google réelle et synchro Chromium réelle non exécutées de bout en bout** (pas d'identifiants de test, pas d'accès Camp) : couvertes par simulation et par des tests de logique ; à valider une fois en vrai.
- Aucune statistique compétitive tant que vous n'en importez pas (`docs/COMPETITIVE_IMPORT.md`).
- Le front reste du JS vanilla en `innerHTML` pour les pages hors draft (échappement vérifié par le test XSS, mais pas de framework de rendu).
- Le client charge au plus 100 séries pour la page Scrims ; Overview et History passent par le serveur et ne sont pas limités.
- Les portraits du PDF dépendent d'un accès réseau du serveur vers Camp au premier export (placeholder sinon).
- `docker-compose.prod.yml` est validé sur une image construite, mais pas derrière un vrai reverse proxy HTTPS.

## À vérifier visuellement

Logo à 16 px ; équilibre cyan/navy ; miroir Red/Blue du plateau de draft sur votre écran ; picks sous les bons labels de lane pendant une vraie draft ; horloge à 5 s ; téléphone ; rendu du PDF avec les vrais portraits ; badges de lane des Flowborn en « All Roles ».

## Commandes utiles

```powershell
npm test                                       # unitaires + HTTP (MySQL requis pour une partie)
npm run test:e2e                               # parcours navigateur
node tests\e2e\screenshots.mjs captures       # captures d'écran des vues
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build   # production (secrets requis dans .env)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-mysql.ps1
```

---

# Révision n°2 (après relecture complète des deux prompts et retours page par page)

Relecture faite : `PROMPT_CLAUDE_CODE.md` et le cahier des charges d'origine (`honor_of_kings_global_draft_scrim_prompt (1).txt`, 89 sections). Points du cahier d'origine qui comptent pour cette révision : roster **sans liste codée en dur**, détail héros « sans aucune donnée inventée », durée de game indépendante des timers, export d'une série **et d'une game**, import qui valide tout et **ne reçoit jamais silencieusement un fichier invalide**, Flowborn = règle spéciale, restrictions Global Ban & Pick par équipe.

## 1. Export des séries (Scrims, Overview, History)

- **Bouton « PDF · PNG » à côté de chaque série** (Scrims, Overview, History) + bouton « Export PDF / PNG » dans la série ouverte. Il ouvre un dialogue : **format (PDF ou PNG), nom du fichier (pré-rempli `Equipe_vs_Equipe_BOn`, modifiable), commentaire (500 caractères)**. Le commentaire est **imprimé dans le fichier** (encadré « Note ») et aussi stocké dans les métadonnées PDF. L'export global de l'historique (filtres, 100 séries max, message exact) a le même dialogue (PDF seulement).
- **Seuls PDF et PNG sont proposés** : plus aucun téléchargement JSON de série ni de game. Les noms sont assainis côté serveur (pas de chemin, pas d'injection d'en-tête).
- **Import depuis les fichiers générés** (« Import series » : PDF ou PNG) : chaque fichier embarque les données de la série (pièce jointe PDF `hok-series.json.gz` / bloc `tEXt` PNG). L'import repasse par la validation stricte (héros existants, équipes, structure…) : nouvel ID, propriétaire = l'importeur ; un PDF/PNG étranger, abîmé, forgé ou une « zip bomb » est refusé avec un message clair et ne crée rien. Le type est lu dans les octets, pas dans le `Content-Type`.
- Limite connue : un PNG envoyé par une messagerie qui recompresse l'image perd les données (message explicite) ; un PDF ré-enregistré/imprimé aussi. PNG limité à 15 games (renvoie vers le PDF).
- Tests : `tests/series-files.test.js` (25), `src/client/features/history/export.e2e.mjs` (19 vérifications : boutons sur les 3 pages, dialogue, noms, commentaire, aller-retour PDF et PNG, fichier étranger, message > 100 séries).

## 2. Page Heroes : détails complets (Global, gratuit, sans ranked)

Recherche faite : le site Camp (Global, anglais) sert lui-même les fiches via `herowiki/getherodataall`, la liste via `herowiki/getallherobriefinfo`, l'historique de patchs détaillé via `game/adjust/adjustheroinfo` (appelés par la vraie page dans Chromium, pas de signature rétro-ingéniérée, pas de binaire tiers). Autres sources testées : fandom (402 payant) et honorofkings.com (404) : écartées.
Sur chaque fiche : **profil** (région, identité, taille, énergie, classe, lane, date de sortie Global, vidéo), **compétences** (passif, S1, S2, ultime : icône, coût, recharge, tags, description colorée, **vidéo de démonstration**), **historique des patchs** (saison, date, étiquette, **avant/après chiffrés par compétence**), **artwork officiel**, bannière du héros, puis « Tes scrims » et stats compétitives importées. Filtres : lane + **classes multiples** (cumulables).

- **Jamais gardé** : popularité, taux de victoire/pick/ban, tier, pourcentages de pairings, commentaires de la communauté, galerie communautaire (test dédié). Les attributs de base (PV, attaque…) **n'existent pas** chez Camp Global : « Data unavailable ».
- Le roster vient maintenant de la liste de héros de Camp (plus du classement de popularité) : les 118 héros Global, 118 IDs distincts (Lu Bu 123 / Fatih 128 / Flowborn 581-585 inchangés).
- Synchro : bouton admin « Sync hero sheets from Camp » (en arrière-plan, progression affichée, une fiche enregistrée dès qu'elle arrive, une fiche en échec garde l'ancienne), et automatique quotidienne (fiches manquantes ou de plus d'une semaine). Table `hero_details` (migration 006). **À lancer une fois** après démarrage : ~1 s par héros.
- Vérifié en vrai sur Camp (Agudo, Fatih, Flowborn Tank, Lu Bu) avec captures. CSP : `media-src` limité aux domaines Camp.
- Cinématiques : Camp expose, pour certains héros (ex. Fatih), une vidéo de présentation dont les liens **sont signés et expirent**. Le champ `cinematic` (cover, durées, sources non signées) est déjà stocké ; la lecture dans le fond de page est prévue pour l'étape design.

## 3. Tier lists

- **Un seul contrôle de lane** : onglets `All Roles · Clash · Jungle · Mid · Farm · Support` avec compteurs. L'onglet filtre les listes **et** détermine la lane d'une nouvelle liste (bouton « New Mid tier list + »). Plus de menu déroulant séparé, plus de puces qui ne filtraient pas.
- **Avatars agrandis** : Unranked 68 px (avant 44), héros classés 56 px avec nom. Zone Unranked **collée en bas de l'écran** (plus de long défilement pendant le glisser-déposer).

## 4. Scrims (plateau de draft)

- **Picks ≠ bans** : bans compacts (44 px), **picks qui remplissent tout le bloc** sur les 5 rangs (cartes 4:5).
- **Surbrillance par équipe** : bleu pour Blue, rouge pour Red (panneau actif, groupe d'action, prochain slot).
- Séries téléchargeables en PDF/PNG uniquement (voir 1).

## 5. Stabilité des tests

`npm test` limite la concurrence des fichiers (`--test-concurrency=3`) : en parallèle total, MySQL dans Docker saturait sur les DDL et des fichiers n'en finissaient pas. **252 tests verts**, 8 parcours navigateur propres.

## À faire ensuite (annoncé par l'utilisateur) : phase design

Animations des pages, dispositions, tailles de police, détails, et **vidéo de fond d'un héros** (aléatoire à chaque connexion, ou héros choisi) à partir des **cinématiques de présentation** Camp (liens signés temporaires : il faut un proxy/rafraîchissement côté serveur).

---

## Révision n°3

1. **Scrims : le rang des rôles ne sert plus qu'à l'auto-pick.** En phase 6 j'avais rangé chaque pick sous le rôle assigné par le serveur ; un héros pické « hors rang » changeait donc de case et de libellé. Les picks se rangent maintenant **dans l'ordre de pick** (case 1, 2, 3…), quel que soit le rôle du héros ; une case vide montre le rôle que l'auto-pick prendrait, une case pleine le(s) rôle(s) du héros. Les textes « timeout role » / « Mid lane » qui laissaient croire à une contrainte sont neutralisés, et le pool a un **filtre par type de héros** (classe) en plus du filtre de lane. Vérifié avec le vrai roster Camp : 20 actions de suite en solo et en 2 joueurs, héros de tous rôles dans n'importe quel ordre, + fuzzing de 300 drafts sans refus.
2. **Édition d'une série** : bouton « Edit bans & picks » (liste des games terminées, plateau en lecture seule d'une game, et game en cours une fois sa draft finie). Éditeur : 4 rangées de 5 cases, clic sur une case puis sur un héros, croix pour vider, recherche, « Undo changes ». API : `PATCH /api/series/:id/games/:index/draft` et `PATCH /api/series/:id/game/draft`. Les règles tiennent : héros unique par draft, héros connus, Global Ban & Pick (une équipe ne peut pas reprendre un héros déjà pické dans une autre game, ni un 2ᵉ Flowborn), concurrence optimiste, mêmes droits que l'édition de durée (créateur seul en ligne). Journal d'actions et lanes recalculés ; statistiques, exports et historique utilisent la version corrigée. Tests : `tests/edit-draft.test.js` (16), `src/client/features/draft/edit-draft.e2e.mjs`.
3. **Vidéos des héros** : la 1ʳᵉ image s'affiche à la place de la boîte sombre (`preload="metadata"` + `#t=0.1`, sans « poster » à fabriquer). Vérifié dans Google Chrome sur Agudo (`scripts/dev/video-frame.mjs`) ; Chromium de Playwright ne décode pas le mp4.

## Lighthouse (8 pages, `scripts/lighthouse-all.sh`)

Desktop : 100 partout. Mobile : accessibilité, bonnes pratiques et SEO à 100 sur toutes les pages ; performance 94–99 selon la page (la page héros est limitée par le chargement de la bannière distante Camp, LCP ≈ 2,7 s). Sécurité : `npm audit` sans vulnérabilité, CSP stricte, MFA (voir `docs/SECURITY.md`).

---

## Révision n°4 — langues et design

1. **15 langues** (interface, messages de l'API, PDF/PNG, titres et descriptions SEO) : détection du navigateur + sélecteur, arabe en RTL (propriétés CSS logiques), polices par écriture, sous-ensemble vietnamien. Plus de 750 phrases par langue ; `tests/i18n.test.js` (complétude, placeholders, pluriels), `tests/i18n.http.test.js`, `src/client/language.e2e.mjs` (aucun débordement dans aucune langue, mobile et bureau).
2. **Données Camp localisées** : noms, classes, fiches et vidéos de compétences dans la langue du visiteur (migration 008, file d'attente à la demande). Les traductions de l'interface ont été rédigées par l'assistant : une relecture par des natifs est recommandée avant une diffusion large.
3. **Sous-titres** : Camp n'en publie pas ; non ajoutés (voir DECISIONS).
4. **Design** : fond vidéo (vidéo de présentation d'un héros), couche de mouvement (entrées de page, cartes, boutons, dialogues, compteurs ; désactivée en mouvement réduit), filtres d'historique sur une ligne, grille de statistiques régulière, notice discrète, cartes de héros sans coupure dans les langues longues.
5. Lighthouse : bureau 100 partout ; mobile accessibilité, bonnes pratiques et SEO à 100, performance 93–96.

---

## Révision n°5 — performance

1. **Causes de lenteur trouvées** : visuels Camp de plusieurs Mo (bannière, galerie), vidéo de profil (~2 Mo avant même d'être vue) et vidéos de fond, changement d'onglet de compétence qui reconstruisait toute la fiche, cascade script → API → rendu, polices et feuille de style avant le premier affichage.
2. **Correctifs** : proxy d'images WebP, bundle minifié haché (+ découpage), chargeur post-premier-paint (CSP par hash), données préchargées, chargement à l'approche (vidéos, galerie, cartes), polices de secours à métriques ajustées, rendu partiel des onglets de compétence, 8 pages vérifiées sans requête en double.
3. **Lighthouse** (8 pages, local) : bureau 100 / 100 / 100 / 100 partout ; mobile accessibilité, bonnes pratiques et SEO 100 partout ; **performance mobile 97–99** (fiche héros 98). Le reste est le LCP simulé (≈ 2,3 s) : le contenu est dessiné par JavaScript après les appels API ; descendre sous ~1,3 s demanderait le rendu serveur du contenu de chaque page.

---

## Révision n°6 — rendu serveur, profils, tournois, builds

1. **Rendu côté serveur** (Chromium, anonymes) : pages dessinées dès le premier octet, CSS en ligne, polices après le premier rendu, préchauffage des 15 langues.
2. **Google** : avatar Google conservé, mais le nom affiché est le pseudo choisi (pseudo + mot de passe à confirmer + MFA à la première connexion). **Tag** unique par compte ; clic sur l'avatar : photo (envoi / Google / aucune) et pseudo.
3. **Tournois** (admins) : page de saisie rapide au clavier, modification / renommage / suppression à tout moment ; statistiques compétitives et pairings calculés depuis ces séries, avec fenêtre de récence (tout, année, 12/6/3 mois, date) ; avatars à la place des noms, anneaux et barres SVG.
4. **Pairings** : 3 alliés + 3 adversaires les plus présents dans les victoires du héros. « Base attributes » supprimé.
5. **Builds** : aucune source libre/gratuite/à jour trouvée pour Global (voir DECISIONS) ; saisie administrateur (2 variantes, source obligatoire). Ce point reste à alimenter par vous.
6. **Tests** : suite unitaire (tests/tournaments.test.js, profile, oauth, ssr…) et e2e (src/client/features/tournaments/tournaments.e2e.mjs, heroes.mjs). 15 langues complètes.

---

## Révision n°7 — catalogue, labo de builds, données de héros

1. **Source des builds/objets/arcanes** : aucune source libre et à jour pour Global (voir DECISIONS). Catalogue saisi par l'administrateur.
2. **Page Catalogue** (admins) : stats du jeu, tags, objets (image, catégorie, prix, stats, plusieurs passifs/actifs), arcanes (image, couleur, 1 à 4 stats).
3. **Labo de builds** (public, sans compte) : héros + niveau, 6 objets (bottes incluses) + 2 utilitaires + 2 fin de partie, 10 arcanes par couleur avec quantités (×7 avant ×3), stats totales, lien de partage. Un admin peut enregistrer un build recommandé (2 par héros), affiché en images sur la fiche héros.
4. **Fiche héros** : stats de base réelles (niveau 1 / 15), tags, détails de chaque sort (recharge, coût par niveau, portée, effets avec valeurs et ratios), éditeur « Edit hero data ».
5. **Notation des builds** : volontairement non faite (décision de l'utilisateur).
6. **Tests** : tests/catalog.test.js, e2e catalog / build-lab / hero-editor ; 15 langues complètes.

## Révision n°9 — fidélité à la maquette et performance

- Pages refaites d'après `docs/mockup/tactical-beacon.html` : voir DECISIONS.md (révision n°9). Non repris : tout ce qui relève de la communauté (non construit) ; courbes des cartes de stats = décor sans donnée.
- Tests : `npm test` 423/423 ; e2e (app, tier-lists, heroes, tournaments, catalog, build-lab, hero-editor, draft, history, export, xss, edit-draft, auth, language, ssr) tous propres. Sélecteurs e2e mis à jour (`.hcard` pour l'index des héros, `.series-list + .pager` pour l'historique).
- Lighthouse (serveur local, rendu serveur actif, `scripts/lighthouse-all.sh`) : bureau 100/100/100/100 sur les 9 pages. Mobile : accessibilité, bonnes pratiques et SEO à 100 ; performance 100 sur login, inscription, scrims, tier lists, labo et aperçu selon les passes, 98–99 sur l'historique, 98 sur /heroes et 97–98 sur la fiche héros (LCP simulé 2,2 s : le texte ou la bannière attendent le rendu du squelette sous CPU ×4). Mesures répétées : ±1–2 points. Mobile 100 partout n'est donc **pas** atteint sur ces deux pages.

## Révision n°10 et 11 — communauté et dernier passage

- **Construit** (migrations 012 à 016, additives) : équipes (limite 7–20, logo, invitations à accepter), agenda (répétition hebdomadaire, réponses, `.ics`, rappel une heure avant, vues mois / semaine / liste), annonces et demandes de scrim (contre-proposition, acceptation qui remplit les deux agendas, limites, blocage, signalement), boîte de réception, pages joueur et étiquettes, liaison Discord, page d'administration des signalements.
- **Tests** : `npm test` 463/463 ; les 16 suites e2e (app, tier-lists, heroes, tournaments, catalog, build-lab, hero-editor, draft, history, export, xss, edit-draft, teams, community, auth, language, ssr) passent, dont les parcours équipes, annonces → demande → contre-proposition → acceptation → agenda → réponse → série, signalement → page admin, et le contrôle de débordement à 390 px.
- **Discord** : testé uniquement avec un faux Discord injecté (aucun identifiant fourni). Messages privés en anglais. Non fait : ajout du bot à un serveur d'équipe avec choix du salon, résumé hebdomadaire.
- **Non fait volontairement** : « Follow », équipe « Verified », liens externes d'équipe, bannière téléversée, éditeur de créneaux récurrents par jour de semaine, fil d'activité et builds sauvegardés sur la page joueur (aucune donnée réelle derrière), lecture des conversations par les administrateurs en dehors d'un signalement.
- **Style** : tout le code (`src`, `tests`, `scripts`, `public/*.js|css`) est formaté avec Prettier (`.prettierrc.json`, `.prettierignore` : `public/locales`, `public/dist`, `public/fonts` et `docs/mockup` sont exclus).

## Révision n°13 — draft en direct, Classic, Training, onboarding, paramètres

**Fait**

- Plateau de draft refait d'après la planche (colonnes Blue/Red, lignes de pick larges, chronomètre en anneau), entrée de menu _Live draft_ (`/live`).
- Free For All = 10 picks sans bans ; nouveau mode **Classic** (même héros possible des deux côtés ; en duo en ligne, picks adverses masqués par le serveur jusqu'à la fin).
- **Training** : héros suivis et accès rapide (compétences, stats), carnet (objectifs, mécaniques, combos en images), situations sur carte (éditeur admin : repères héros vivants/morts et repères du jeu, glisser/clavier ; vue joueur ; réponses privées), gestion des cartes. Migration 018.
- **Onboarding** (4 étapes, communauté obligatoire) et **paramètres** (`/settings`) : parties du menu, défauts d'une nouvelle série, page de départ, animations réduites. Migration 019.
- 14 langues complètes (≈ 280 textes ajoutés) ; prompt de design v3 sans identité imposée.

**Limites connues, dites franchement**

- **La vraie carte du jeu n'est pas dans le dépôt** : il faut qu'un administrateur envoie l'image et place les repères (aucune position inventée).
- Classic, deux joueurs sur un même appareil : masquage visuel seulement.
- Les images de compétences viennent des fiches Camp : tant qu'une fiche n'a pas été récupérée, on ne peut pas construire de combo pour ce héros (le message le dit).
- Lighthouse n'a pas été relancé sur les nouvelles pages (training, welcome, settings) : à faire.
- La page `/live` n'est pas un « spectateur » public : elle ouvre la série active de la personne connectée.

## Révision n°14 — logos de rôles, rôles joués en tournoi, rôles d'un héros

**Fait**

- Logos de rôles (plusieurs par héros) dans Heroes, le pool et les lignes du draft, le roster des équipes et la pastille de rôle de la page joueur.
- Tournois : rôle joué par chacun des 5 picks d'un camp, par glisser-déposer ou clic-puis-clic, enregistré dans la partie, relu à l'édition.
- Fiche héros : × sur chaque rôle (Camp compris), jamais le dernier ; ajout/retrait propagés aux listes de tiers, au draft et aux filtres. Migration 020.
- 17 textes traduits dans les 14 langues ; tests : `tests/tournament-lanes.test.js`, nouveaux cas dans `tests/hero-data.test.js`, e2e `hero-lanes` et `tournament-lanes`.

**Limites connues**

- Les statistiques de héros ne se servent pas encore du rôle joué en tournoi (la donnée est enregistrée ; l'afficher sur la fiche est l'étape suivante).
- Le roster des équipes (liste déroulante d'édition) reste du texte.
- Mes changements recouvrent des fichiers modifiés en parallèle par un autre travail (tournois : règle de draft ; stats de héros) : rien n'a été committé tant que ce travail n'est pas terminé.

## Révision n°15 — maquette HTML complète

Une seule maquette navigable, `docs/mockup/maquette/index.html` (25 pages, ouverte par double-clic), construite à partir des cinq planches de `modèles/` : tableau de bord, profil, entraînement et carte tactique, tier list, draft en direct, fiche héros. Les autres pages (scrims, série, historique, équipes, page d'équipe, trouver un scrim, agenda, messagerie, communauté, paramètres, bienvenue, connexion, sécurité, tournois, Build lab, catalogue, signalements, 404) prolongent la même direction.

- **Vrai** : 113 portraits, noms, classes et rôles Global, icônes, recharges, coûts et textes des compétences, étiquettes, bannières et artworks de 17 héros, historiques de patchs, logos de rôle et du projet. **Exemple, signalé** : objets et arcanes (catalogue saisi à la main), statistiques de base, taux de pick / ban / victoire, équipes, joueurs, messages. La carte tactique est un dessin de la maquette : l'image générée de la planche ne sert plus.
- **Interactions réelles** : draft de 20 étapes dans les trois modes (picks cachés en Classic), glisser-déposer des tier lists, pions de la carte (édition, réponse, corrigé), constructeur de combo, ajout / retrait d'un rôle sur la fiche (jamais le dernier), palette de rôles des tournois (glisser ou cliquer-puis-cliquer, un rôle une fois par camp), Build lab, agenda, messagerie, formulaires, mode clair, RTL, aperçu mobile, Ctrl K.
- **Vérifié** : `node scripts/check-maquette.mjs` parcourt les 25 pages à 1440, 1024 et 390 px (aucune erreur de console, aucun débordement horizontal) puis exerce les interactions principales.
- **Palette** : les jetons ont quitté le graphite `#14161a` pour le bleu nuit mesuré sur les planches (`#0a111a`, `#0e1825`, `#243350`) ; l'identité de `docs/DESIGN_PROMPT_V4.md` est à aligner si cette direction est retenue.

**Limites connues**

- Aucun back-end : tout est en mémoire, rien n'est enregistré. L'interface est en français ; choisir l'arabe ne fait que passer la mise en page en RTL.
- Les textes de compétences viennent de Camp en anglais.
- Le rang de la planche profil n'existe pas (aucune donnée classée) : remplacé par la fiabilité.
- Le dossier `docs/mockup/ideas/` (deux maquettes d'essai) est supprimé : tout son contenu est repris dans la maquette complète.

## Révision n°16 — refonte de l'architecture

Réorganisation complète du dépôt, sans changement de comportement. Les décisions sont dans `docs/DECISIONS.md` (révision n°16), la carte du code dans `docs/ARCHITECTURE.md`. Un instantané de l'arbre de travail d'avant la refonte (fichiers non suivis compris) est conservé sous `refs/backup/avant-refonte`.

**Fait**

- Dossiers : `server/` (`platform/` + une tranche `features/<nom>/` par domaine), `client/` (`core/`, `shell/`, `features/`, `styles/`), `shared/`, `static/`, `translations/`, `scripts/`, `design/`, `docs/`, `tests/{unit,e2e,helpers}`, `dist/`. Plus de `src/`, `public/`, `i18n/`, `scripts/` à la racine.
- Le monolithe `public/app.js` (≈ 2 300 lignes) devient `client/main.js` et une trentaine de modules ; le gros écouteur de clic est un registre (`client/core/actions.js`). Le magasin de données unique est composé de magasins par fonctionnalité, celui de la communauté (≈ 1 000 lignes) est lui-même découpé par sujet ; la validation générique est séparée de celle de chaque fonctionnalité ; les règles de draft n'existent plus qu'une fois (`shared/draft-model.js`).
- Feuille de style : 7 833 lignes en 22 partiels ordonnés (même contenu, même ordre : vérifié par comparaison).
- Lisibilité : Prettier à 100 colonnes (l'ancien réglage à 240 produisait des lignes denses), ESLint (accolades obligatoires, `===`, pas de variable inutilisée) : 1 807 constats au départ, 0 à la fin ; commentaires recoupés à 100 colonnes (607 lignes trop longues avant, 56 après). Scripts `npm run lint`, `format`, `format:check`.
- Dockerfile, `.dockerignore`, `.gitignore`, `package.json`, outils et tests mis à jour ; `docs/ARCHITECTURE.md` écrit.

**Vérifié**

- `npm test` : **539 réussis sur 543**. Les 4 échecs sont ceux qui existaient avant la refonte, sur l'instantané d'origine : « a hero reused by the same team in another game is refused » et « a second Flowborn form for the same team is refused » (imports de séries, règle de draft en cours de modification par ailleurs) ; « the channel is chosen from the server's own list… » et « the weekly digest: Monday morning… » (Discord, sensibles à la date). Ils n'ont pas été corrigés : ils ne sont pas liés à la refonte. (Corrigés ensuite : révision n°17.)
- E2E Playwright : **22 scripts sur 23 passent** (app, tier-lists, tournaments, catalog, build-lab, hero-editor, draft, history, export, xss, edit-draft, teams, community, discord-team, auth, language, ssr, hero-lanes, onboarding, tournament-lanes, training, hero-sheet-live). `heroes.mjs` échoue avec la même erreur sur l'instantané d'origine (`#tournament-body .donut` désigne deux éléments : travail en cours sur les statistiques de héros), il n'a donc pas été touché.
- `npm run build` produit le même découpage (bundle 90 Ko, 9 morceaux partagés, feuille 116 Ko, CSS critique 11 Ko).

**Limites connues**

- Les plus gros modules du navigateur (communauté, entraînement, tournois, équipes) ne sont pas découpés : ils sont réécrits page par page avec le redesign (`docs/REDESIGN.md`).
- Les tests restent à plat dans `tests/unit/` (un fichier par sujet).
- Les révisions précédentes de ce rapport citent les chemins de leur époque (`src/`, `public/`…) : voir la table de correspondance de `docs/ARCHITECTURE.md`.

## Révision n°17 — redesign d'après la maquette

Toutes les pages de la maquette (`design/maquette/index.html`) sont portées dans les vues réelles, avec les vraies données ; les blocs de la maquette sans source réelle ne sont pas repris. Le détail page par page, ce qui est réel et ce qui n'est pas repris sont dans `docs/REDESIGN.md` ; les décisions dans `docs/DECISIONS.md` (révision n°17).

**Fait**

- Pages portées sur cette dernière étape : éditeur de données d'un héros, correction d'un draft, résultat d'une partie, nouvelle série, tier lists (en-tête et barre d'outils), historique, statistiques d'un héros, **Tournois** (tableau des séries ; éditeur à la manière de la maquette : une carte par camp, palette de voies, face à face par voie calculé, choix du héros en ligne), après Équipes, communauté, paramètres, bienvenue, connexion et compte, page introuvable, entraînement, série, Build lab et catalogue.
- **L'ancienne couche de styles est supprimée** : 22 feuilles `client/styles/legacy/` (≈ 7 800 lignes) et `components/compat.css`. Il reste un seul système (`base/`, `components/`, `shell/`, `pages/`), sans classe ni composant en double ; les blocs de données sans équivalent dans la maquette ont leurs règles dans `pages/hero-stats.css`, `pages/hero-sections.css` et `shell/background.css`. Les règles qu'aucune vue n'écrit plus (≈ 60 classes issues de la maquette) sont retirées, ainsi que `pages/community.css` que personne n'importait.
- Trouvé par Lighthouse et corrigé : le lien du logo n'avait pas de nom sur téléphone, `small` tombait à 10 px (inscription), les logos de voie répétaient le nom de leur voie, les diapositives de l'accueil avaient un rôle non permis ; et **les pages dessinées par le serveur n'ont plus d'animation d'entrée au premier chargement** (classe `ssr-first` sur `<html>`, retirée par le client au bout de 2,5 s) : le LCP mobile passe de 2,6 s à 1,5 s ; et **le Build lab réutilise la page dessinée par le serveur** comme les autres (il la remplaçait, ce qui recréait le titre et comptait comme un nouveau plus grand affichage : LCP 2,7 s → 1,5 s).
- **Les échecs d'avant la refonte sont corrigés** (détail dans `docs/DECISIONS.md`, révision n°17) : l'import de séries applique enfin la règle Global Ban & Pick (le code l'ignorait, les routes la passaient déjà), le test Discord « the channel is chosen… » ne dépend plus de l'heure réelle (il échouait un lundi après 8 h, et avec lui « weekly digest » le lundi 5 octobre), et `heroes.mjs` vise le bloc « Toutes les règles » de la fiche.
- Traductions : 3 nouvelles clés
- Outils : `scripts/design/capture-pages.mjs` capture aussi sur téléphone et en arabe les pages portées en dernier, signale les boutons restés au style du navigateur et, avec `--styles`, enregistre le style calculé de chaque élément ; `scripts/design/diff-styles.mjs` compare deux séries ; `src/testing/run-e2e.mjs` (`npm run test:e2e`) enchaîne les 24 parcours navigateur sans s'arrêter au premier échec ; `scripts/performance/serve-built.mjs` démarre l'application construite (`dist/`) sur une base jetable avec un petit roster de test, pour y lancer `scripts/performance/lighthouse-all.sh`.
- Trois gardes ajoutées à `src/client/design.test.js` (imports et feuilles orphelines, variables CSS définies, animations avec leurs `@keyframes`) ; deux tests de langue mis à jour pour la nouvelle coque ; 16 scripts de `scripts/` retrouvent leur ligne `#!/usr/bin/env node` (perdue à la refonte précédente).

**Vérifié**

- `npm run lint` et `npm run format:check` : 0 constat.
- `npm test` : **552 réussis sur 552** (`node --test`, aucun test ignoré). 13 tests de plus qu'à la révision n°16 : gardes des feuilles de style, première page dessinée, règle Global Ban & Pick à l'import.
- Parcours navigateur : **24 sur 24** (`npm run test:e2e`, chaîne complète avec `language`). `ssr` compte désormais 42 vérifications, dont « le titre peint par le serveur est le même élément après la prise en main par le script » pour cinq pages.
- `npm run build` : bundle 109 Ko, 14 morceaux partagés, feuille 126 Ko, CSS critique 18 Ko (révision n°16 : 90 Ko, 9 morceaux, 116 Ko, 11 Ko ; les pages de la maquette sont plus riches).
- **Rien n'a été perdu en supprimant l'ancienne couche** : les 116 captures (bureau sombre et clair, téléphone, arabe) ont été prises avant et après, avec le même balisage, et comparées **élément par élément sur les styles calculés** (≈ 106 000 écarts regroupés en 145 types d'éléments en sombre, 144 en clair). Résultat : sept pertes réelles, corrigées (polices, tailles des avatars de héros, bouton du nom d'un héros dans l'historique, ratio et coins des vidéos de la fiche héros, onglets sur une ligne, fil d'Ariane qui se coupait sur téléphone, logos de voie qui prenaient le pointeur au lieu de leur bouton) ; le reste est soit un endroit où l'ancienne couche brouillait la maquette et où la page la suit désormais (réserve du draft, libellés de l'éditeur de tournoi, tableaux, marges des onglets), soit du bruit (couleur héritée, animation en cours). Aucun écart propre au thème clair ni à l'arabe (droite à gauche). Plus aucun bouton au style du navigateur sur les 116 captures. Quatre états ajoutés à la capture (plateau de tier list, carte de sort de l'éditeur de héros, formulaire du catalogue, éditeur de tournoi rempli) ont fait trouver deux défauts plus anciens, corrigés : la carte de sort n'avait ni cadre ni marge, et le filtre du catalogue débordait de sa carte.
- Lighthouse : mesuré sur ce build, servi avec le premier écran dessiné par le serveur (`scripts/performance/serve-built.mjs`), 14 pages (accueil, héros, une fiche héros, tier lists, connexion, inscription, scrims, historique, Build lab, équipes, trouver un scrim, entraînement, paramètres, bienvenue). **Ordinateur : performance, accessibilité, bonnes pratiques et SEO à 100 partout** (LCP au pire 0,7 s, CLS 0). **Téléphone : accessibilité, bonnes pratiques et SEO à 100 partout ; performance 97 à 100** (2 pages à 100, les autres à 97–99 ; LCP au pire 1,7 s, CLS au pire 0,005). **Le 100 n'est donc pas atteint sur la performance mobile de 12 pages sur 14** : il manque 1 à 3 points, tous dus au temps de blocage total (50 à 190 ms avec le ralentissement ×4 du processeur), dont une part vient de la mise en page relancée quand la feuille des polices est appliquée après le premier affichage (choix antérieur à la refonte, gardé : l'inverser retarderait le premier affichage). La mesure se fait sur une base jetable avec un petit roster sans images (les images viennent du site de Camp, injoignable depuis la machine de mesure) : les pages qui montrent des images de héros sont donc mesurées sans leur coût.

**Limites connues**

- Les blocs de la maquette sans donnée réelle ne sont pas repris (`docs/REDESIGN.md`, « Non repris »).
- Les deux feuilles de polices (`client/styles/base/fonts.css` et `static/fonts/fonts.css`) sont deux copies identiques, à garder en phase (l'outil qui les modifie écrit dans les deux).
- Plusieurs gabarits HTML des vues restent de longues lignes : Prettier ne coupe pas le contenu d'un gabarit, et y ajouter des retours à la ligne changerait les espaces entre éléments en ligne.

## Révision n°18 — draft en direct, fuites de styles, Lighthouse sur toutes les pages

Retours du propriétaire après la révision n°17 : les bans n'étaient plus visibles dans la draft en direct, le suivi des étapes devait disparaître, tous les cas de styles et toute l'application devaient être revus, la case d'un ban oublié devait rester vide, et Lighthouse devait être mesuré sur **toutes** les pages (celles qui demandent un compte comprises). Les décisions sont dans `docs/DECISIONS.md` (révision n°18), ce qui n'est pas repris de la maquette dans `docs/REDESIGN.md`.

**Fait**

- **Les bans sont de nouveau visibles en direct.** Cause : une règle d'une autre page (`.slot-row { display: flex }` de la page Tournois) écrasait la rangée de bans de la draft et ses cinq cases tombaient à zéro de large. Règles du tournoi limitées à leur page, classe retirée du plateau.
- **Le suivi des étapes n'est plus affiché** (bandeau, règles et calcul supprimés).
- **Un ban oublié laisse sa case vide** : sur le plateau (la case « suivante » est la bonne : `nextBanIndex`) et dans la carte d'une partie terminée (cinq cases, la vide en pointillés, « Aucun ban »). La rangée de bans de Rouge part du bord extérieur en arabe aussi.
- **Revue des styles.** Deux gardes dans `src/client/design.test.js` (une classe n'a qu'une règle de base ; une feuille de page ne style que les classes écrites par les fonctionnalités de sa page : table `PAGE_FEATURES`). Fuites trouvées et corrigées : `.ring` (l'anneau du profil joueur n'était pas concentrique à l'avatar), `.pick-name` de la draft sur la page Tournois, `.pager`, `.side-chip`, `.subheading`, `.eyebrow` ; la dernière couche de l'ancienne feuille (`base/aliases.css`) est supprimée, ce qui rapproche la hauteur de ligne de quelques titres de celle de la maquette.
- **Lighthouse sur toutes les pages.** Nouveaux outils : `scripts/performance/lighthouse-pages.mjs` (démarre l'instance de démonstration construite, ouvre chaque page avec le bon compte, mobile et ordinateur) et `lighthouse-summary.mjs` (le tableau). Trouvé et corrigé : des images de carte de héros qui répétaient le nom à côté du texte, des titres qui sautaient un niveau (trouver un scrim, équipes, légendes de la carte d'entraînement), une barre de progression sans nom (Discord), des pions de carte sans rôle, un contraste insuffisant (pions « morts »), un rôle non permis (anneaux de statistiques), et un décalage de mise en page de l'agenda sur téléphone (CLS 0,195 → voir ci-dessous).
- Traductions : 1 clé (« No ban », 14 langues).
- Outils de capture : audit de chaque page (contenu écrasé, défilement latéral, texte sous 12 px, erreurs de console), mode `--serve`, plus aucune requête vers le port 3000.
- Base de développement : le compte unique a été supprimé à la demande du propriétaire, après sauvegarde (voir `docs/DECISIONS.md`).

**Vérifié**

- `npm run lint` et `npm run format:check` : 0 constat.
- `npm test` : **555 réussis sur 555** (3 de plus qu'à la révision n°17 : `nextBanIndex` et les deux gardes de `design.test.js`), aucun test ignoré.
- Parcours navigateur : **24 sur 24**. `draft` compte 7 vérifications de plus (un ban a une vraie taille et une image, les cinq cases tiennent sur une ligne, le plateau est aussi inversé de droite à gauche, un ban oublié laisse sa case vide et la case « suivante » est la bonne, plus de bandeau d'étapes). Au premier passage de la chaîne finale, `tournament-lanes` a échoué (quatre glisser-déposer de voies ratés) pendant que les tests unitaires tournaient en parallèle ; sur la même version il passe ensuite quatre fois de suite : ses vrais glisser-déposer sont sensibles à la charge de la machine, ce n'est pas une régression.
- **Les nouveaux contrôles échouent bien quand le défaut revient** : sur une copie figée où le `.slot-row` global de Tournois et la classe sur le plateau sont rétablis, les deux vérifications de taille du test navigateur et le garde des feuilles de `design.test.js` échouent (et le garde nomme `.slot-row` et `.pick-name`).
- `npm run build` : bundle 109 Ko, 14 morceaux partagés, feuille 124 Ko, CSS critique 18 Ko.
- **Captures de toutes les pages** (122 : ordinateur, téléphone, arabe) en thème sombre et en thème clair, avec l'audit de l'outil : aucun contenu écrasé, aucun défilement latéral, aucun texte sous 12 px ; en thème clair, avec les erreurs de console surveillées aussi, aucune (le 404 de la page introuvable mis à part, voulu) ; en sombre, les erreurs de console ont été contrôlées par Lighthouse sur les 56 pages (même résultat). Comparées à la maquette sur huit planches (maquette à gauche, application à droite) : pas de régression.
- **Comparaison des styles calculés avant / après ce lot** (122 captures) : 38 types d'éléments diffèrent, tous expliqués : l'anneau du profil joueur (maintenant concentrique à l'avatar), la marge de `.pick-name` sur Tournois (fuite retirée), la hauteur de ligne de quelques titres (celle de la maquette), les `h3` des blocs de statistiques (corrigés pour garder leurs 14 px), le reste est du bruit d'animation ou une conséquence de ces hauteurs.
- **Lighthouse, 56 pages, mobile et ordinateur** (112 mesures, build de production) : voir le tableau plus bas. **Ordinateur : performance 100 sur 56 pages sur 56 ; accessibilité 100 partout.** **Téléphone : accessibilité 100 partout ; performance 100 sur 28 pages, 99 sur 9, 98 sur 6, 97 sur 3, 96 sur 8, 95 sur 2.**

**Limites connues**

- **Le 100 n'est pas atteint partout, et il ne le sera pas sans décision du propriétaire.** SEO 69 sur 8 pages volontairement non indexées (agenda, Discord, entrée du live, pages de joueur, signalements, tournois, messagerie) et 61 sur la page introuvable (non indexée et code 404) ; bonnes pratiques 96 sur la fiche d'un héros sur ordinateur (le relais d'images de démonstration sert des images de 1 × 1 px) et sur la page introuvable (le 404 est journalisé) ; performance mobile 95 à 99 sur 28 pages : temps de blocage total (100 à 260 ms avec le ralentissement ×4 du processeur, ±100 ms d'une mesure à l'autre) et LCP de 2,5 s des pages connectées dont le plus grand élément arrive après le chargement des données (bandeau du roster, horloge de la draft, sous-titre de Tournois, logo de la présentation). Détail et pistes : `docs/DECISIONS.md`, révision n°18.
- Les mesures se font sur une base jetable avec les images de démonstration (1 × 1 px) et un petit jeu de données : les pages qui montrent beaucoup d'images de héros sont mesurées sans leur coût réel.
- Le garde des feuilles (`PAGE_FEATURES`) se trompe dans un seul sens : il lit les classes écrites entre guillemets dans le code du navigateur (`class="…"`, `className = "…"`) ; une classe construite entièrement à l'exécution lui échappe.
- `tournament-lanes` (vrais glisser-déposer) peut échouer une fois si la machine est très chargée : le relancer seul.

### Lighthouse page par page (56 pages)

Performance / accessibilité / bonnes pratiques / SEO ; le LCP est celui du téléphone. Les pages dont le nom commence par `visitor-` sont vues sans compte (première page dessinée par le serveur), les autres avec le compte de démonstration qui les ouvre.

| Page                              | Adresse                     | Mobile (perf / access. / bonnes prat. / SEO) | LCP mobile | Ordinateur            |
| --------------------------------- | --------------------------- | -------------------------------------------- | ---------- | --------------------- |
| account-security                  | `/account`                  | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| agenda-month                      | `/agenda`                   | 100 / 100 / 100 / 69                         | 1.4 s      | 100 / 100 / 100 / 69  |
| build-lab-with-hero               | `/build-lab`                | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| discord                           | `/discord`                  | 100 / 100 / 100 / 69                         | 1.4 s      | 100 / 100 / 100 / 69  |
| draft-classic-live-solo           | `/scrims/<id>`              | 96 / 100 / 100 / 100                         | 2.6 s      | 100 / 100 / 100 / 100 |
| draft-classic-online-hidden-picks | `/scrims/<id>`              | 96 / 100 / 100 / 100                         | 2.5 s      | 100 / 100 / 100 / 100 |
| draft-complete-result-form        | `/scrims/<id>`              | 96 / 100 / 100 / 100                         | 2.6 s      | 100 / 100 / 100 / 100 |
| draft-free-for-all-live           | `/scrims/<id>`              | 96 / 100 / 100 / 100                         | 2.6 s      | 100 / 100 / 100 / 100 |
| draft-global-ban-pick-live        | `/scrims/<id>`              | 95 / 100 / 100 / 100                         | 2.6 s      | 100 / 100 / 100 / 100 |
| draft-global-ban-pick-ready-check | `/scrims/<id>`              | 98 / 100 / 100 / 100                         | 2.5 s      | 100 / 100 / 100 / 100 |
| draft-global-ban-pick-skipped-ban | `/scrims/<id>`              | 96 / 100 / 100 / 100                         | 2.6 s      | 100 / 100 / 100 / 100 |
| find-a-scrim                      | `/find`                     | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| first-sign-in-welcome             | `/welcome`                  | 96 / 100 / 100 / 100                         | 2.6 s      | 100 / 100 / 100 / 100 |
| hero-sheet-admin                  | `/heroes/533`               | 97 / 100 / 100 / 100                         | 1.4 s      | 100 / 100 / 96 / 100  |
| heroes-admin-tools                | `/heroes`                   | 97 / 100 / 100 / 100                         | 2.6 s      | 100 / 100 / 100 / 100 |
| history                           | `/history`                  | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| home                              | `/`                         | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| live-draft-entry                  | `/scrims/<id>`              | 98 / 100 / 100 / 69                          | 2.5 s      | 100 / 100 / 100 / 69  |
| login                             | `/login`                    | 100 / 100 / 100 / 100                        | 1.5 s      | 100 / 100 / 100 / 100 |
| not-found                         | `/this-page-does-not-exist` | 98 / 100 / 96 / 61                           | 2.4 s      | 100 / 100 / 96 / 61   |
| online-room-waiting-for-opponent  | `/scrims/<id>`              | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| player-page                       | `/players/ERZTEF`           | 100 / 100 / 100 / 69                         | 1.4 s      | 100 / 100 / 100 / 69  |
| register                          | `/register`                 | 100 / 100 / 100 / 100                        | 1.5 s      | 100 / 100 / 100 / 100 |
| reports                           | `/reports`                  | 100 / 100 / 100 / 69                         | 1.4 s      | 100 / 100 / 100 / 69  |
| scrims                            | `/scrims`                   | 98 / 100 / 100 / 100                         | 2.5 s      | 100 / 100 / 100 / 100 |
| series-finished-classic           | `/scrims/<id>`              | 96 / 100 / 100 / 100                         | 1.4 s      | 100 / 100 / 100 / 100 |
| series-finished-free-for-all      | `/scrims/<id>`              | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| series-finished-global-ban-pick   | `/scrims/<id>`              | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| series-finished-skipped-ban       | `/scrims/<id>`              | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| settings                          | `/settings`                 | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| team-page-member                  | `/teams/<id>`               | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| team-page-owner                   | `/teams/<id>`               | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| teams                             | `/teams`                    | 96 / 100 / 100 / 100                         | 1.4 s      | 100 / 100 / 100 / 100 |
| teams-with-invitations            | `/teams`                    | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| tier-lists                        | `/tier-lists`               | 98 / 100 / 100 / 100                         | 2.5 s      | 100 / 100 / 100 / 100 |
| tournaments                       | `/tournaments`              | 97 / 100 / 100 / 69                          | 2.6 s      | 100 / 100 / 100 / 69  |
| training-heroes                   | `/training`                 | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| training-notebook                 | `/training/notebook`        | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| training-situation-viewer         | `/training/scenarios/<id>`  | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| training-situations-admin         | `/training/scenarios`       | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| visitor-build-lab                 | `/build-lab`                | 99 / 100 / 100 / 100                         | 1.6 s      | 100 / 100 / 100 / 100 |
| visitor-find-a-scrim              | `/find`                     | 99 / 100 / 100 / 100                         | 1.5 s      | 100 / 100 / 100 / 100 |
| visitor-hero-sheet                | `/heroes/533`               | 95 / 100 / 100 / 100                         | 1.7 s      | 100 / 100 / 96 / 100  |
| visitor-heroes                    | `/heroes`                   | 99 / 100 / 100 / 100                         | 1.9 s      | 100 / 100 / 100 / 100 |
| visitor-history                   | `/history`                  | 99 / 100 / 100 / 100                         | 1.5 s      | 100 / 100 / 100 / 100 |
| visitor-home                      | `/`                         | 99 / 100 / 100 / 100                         | 1.5 s      | 100 / 100 / 100 / 100 |
| visitor-inbox                     | `/inbox`                    | 100 / 100 / 100 / 69                         | 1.4 s      | 100 / 100 / 100 / 69  |
| visitor-player-page               | `/players/ERZTEF`           | 100 / 100 / 100 / 69                         | 1.4 s      | 100 / 100 / 100 / 69  |
| visitor-scrims                    | `/scrims`                   | 99 / 100 / 100 / 100                         | 1.5 s      | 100 / 100 / 100 / 100 |
| visitor-settings                  | `/settings`                 | 99 / 100 / 100 / 100                         | 1.5 s      | 100 / 100 / 100 / 100 |
| visitor-team-page                 | `/teams/<id>`               | 100 / 100 / 100 / 100                        | 1.4 s      | 100 / 100 / 100 / 100 |
| visitor-teams                     | `/teams`                    | 100 / 100 / 100 / 100                        | 1.5 s      | 100 / 100 / 100 / 100 |
| visitor-tier-lists                | `/tier-lists`               | 99 / 100 / 100 / 100                         | 1.7 s      | 100 / 100 / 100 / 100 |
| visitor-training                  | `/training`                 | 100 / 100 / 100 / 100                        | 1.5 s      | 100 / 100 / 100 / 100 |
| visitor-training-situation        | `/training/scenarios/<id>`  | 98 / 100 / 100 / 100                         | 1.8 s      | 100 / 100 / 100 / 100 |
| visitor-training-situations       | `/training/scenarios`       | 99 / 100 / 100 / 100                         | 1.6 s      | 100 / 100 / 100 / 100 |

## Révision n°19 — guides, notes officielles, populaires, combos, réflexes, espace personnel

Demandes du propriétaire pendant la nuit du 6 au 7 octobre (« tu as carte blanche, je verrai les résultats après »). Les décisions et les points à confirmer sont dans `docs/DECISIONS.md` (révision n°19), les écrans qui n'existent pas dans la maquette dans `docs/REDESIGN.md`, la sécurité des liens dans `docs/SECURITY.md`.

**Fait**

- **Draft en direct** : deux rangées (camp + bans | horloge | camp + bans), picks un quart plus bas, réserve de héros aussi haute que les cinq picks et environ 1,8 fois plus large, bans **au-dessus** des picks et finissant au pied de l'horloge, icônes de rôle des cinq picks alignées, barre des voies (la même que les tier lists, `components/lane-tabs.css`) à la place de la liste déroulante, recherche et filtre de type juste dessous, plus de petits logos de voie sur les cartes de la réserve (sauf Flowborn). `src/client/features/draft/draft.e2e.mjs` : 43 vérifications.
- **Guides des héros** (`/guides`) : les deux builds recommandés et les combos de chaque héros, écrits par les **éditeurs** (administrateurs et étiquette « Contributor »). Le Build lab n'a plus de formulaire d'administrateur ; « Mes builds » (plusieurs par héros, sans compte) reste dans le navigateur.
- **Notes officielles** (`/ratings`, éditeurs) : SS à D par voie, affichées à côté de chaque voie sur la fiche du héros (migration 021).
- **Populaires** (`/popular`, `/popular/heroes`) : compositions et héros des **tournois** (jamais des scrims), par camp et par voie, sur une période d'au moins trois mois.
- **Combos** (migration 022) : carte sur la fiche, onglet dans les guides, validation en deux formes (normal, annulation d'animation) dans Entraînement.
- **Réflexes** (migration 023) : huit exercices sans aucune requête pendant le jeu (mode calme : coque, vidéo de fond et animations sans fin suspendues), meilleurs scores, série de jours, **objectifs d'équipe** fixés par le propriétaire, les managers et les coachs (parties ou minutes, par jour ou par semaine, suivis sur l'horloge de l'équipe), onglet Entraînement de la page d'une équipe.
- **Mon espace** (migration 024) : tier lists, builds gardés et fiche d'entraînement, partagés **uniquement par des liens** (`/space/shared#jeton`, jeton montré une fois, empreinte seule gardée, lecture seule, sans compte, 7 / 30 / 90 jours ou sans fin, retirables).
- Traductions : 4 lots, **228 clés** neuves en 14 langues (1 952 + 2 clés au total par langue).
- Outils : `scripts/design/capture-pages.mjs` connaît les pages neuves (Lighthouse peut les mesurer) ; `shapeBuild` est passé dans `shared/build-model.js` (le serveur garde les builds comme le navigateur).
- Corrigé en route : la barre des compétences de la fiche débordait sur téléphone dès cinq compétences ; `inputPrompt` bouclait avec un générateur constant ; les tests de la coque ne connaissaient pas l'entrée « Populaires » ni « Mon espace ».

**Vérifié**

- `npm run lint` et `npm run format:check` : 0 constat.
- `npm test` : **637 réussis sur 637** (82 de plus qu'à la révision n°18), 157 suites, aucun test ignoré.
- Parcours navigateur (`npm run test:e2e`, 30 parcours) : **27 sur 30 au premier passage de la chaîne.** Les trois échecs avaient des causes à part et passent maintenant, relancés seuls : `shell` et `ssr` comptaient un menu sans l'entrée « Populaires » (déjà là) ni « Mon espace » (attentes mises à jour) ; `hero-sheet-live` (test réel, il faut Internet) échouait parce que la liste réelle de Camp contient un héros sans portrait (Wang Wei, 138) et que la validation refusait alors tout le roster : corrigé et expliqué dans `docs/DECISIONS.md`, la synchronisation du roster était **cassée en réel** avant cela. La chaîne complète n'a pas été relancée après ces corrections.
- Parcours neufs : `guides` (23 vérifications), `combos` (38), `ratings` (16), `popular` (21), `reflex` (73), `space` (27) ; `draft` passe à 44. Le parcours des réflexes joue chaque exercice jusqu'à son résultat, prouve qu'aucune requête ne part pendant le jeu (seule la sauvegarde du résultat, une fois fini) et que le mode calme est levé ensuite, fixe des objectifs d'équipe par l'interface d'un coach et lit la progression d'un joueur ; celui de l'espace garde un build depuis le lab, donne des liens, les ouvre sans compte (sans cookie de session, sans le jeton dans une adresse), retire un lien et vérifie qu'il n'ouvre plus rien.
- `npm run build` : bundle 111,5 Ko, 16 morceaux partagés, feuille 146,7 Ko, CSS critique 18,1 Ko.
- **Captures et audit** : `scripts/design/capture-pages.mjs` connaît les pages neuves (guides, combos, notes, réflexes, mon espace, espace partagé) et les données de démonstration qu'elles montrent.
- **Lighthouse sur les pages neuves** (build de production, mobile et ordinateur, 14 mesures, tableau plus bas) : performance **100 partout** ; accessibilité 100 sauf la page d'un exercice (98 : un titre sautait de niveau, corrigé ensuite, non remesuré) ; bonnes pratiques 100 ; SEO 100 pour les exercices et 69 pour les pages volontairement non indexées. **Pages existantes remesurées** : ordinateur inchangé ; **téléphone un à quatre points plus bas** (accueil 97-98, héros 98, Build lab 98, entraînement 99, **fiche d'un héros 91-93 au lieu de 95**). L'expérience sans les feuilles des pages neuves ne rend qu'un point : voir `docs/DECISIONS.md` (révision n°19). Non mesurées : les pages Populaires, la carte Combos de la fiche, l'onglet Entraînement d'une équipe.

**Limites connues et à confirmer**

- **À confirmer par le propriétaire** (détail dans `docs/DECISIONS.md`, révision n°19) : « Contributor » = droit d'écrire guides, combos et notes ; les notes officielles ne sont visibles que des éditeurs ; « contre » compte l'équipe adverse entière ; les capitaines sont concernés par les objectifs d'équipe, pas les analystes ; deux listes de builds (navigateur et compte) ; les invitations d'une série ou d'une tier list sont gardées à côté des liens d'espace.
- **Rien n'est commité** : l'arbre mêle le travail du propriétaire et le mien ; aucun `git push`.
- **Le conteneur de l'application est périmé** (image construite avant ce travail) : `docker compose up -d --build` avant de l'ouvrir ; les migrations 021 à 024 s'appliquent au démarrage.
- **Idées d'entraînement non faites** (carte blanche) : classement des joueurs d'une équipe, routine du jour (une suite d'exercices à enchaîner), rappels des combos non acquis (répétition espacée), notes de revue de VOD liées à un héros, objectifs par héros.
- **La performance mobile de la fiche d'un héros a baissé** (95 → 91-93) et celle de quelques pages d'un à deux points : le temps de blocage vient du style et de la mise en page de la fiche (808 éléments), qui porte plus de blocs ; la taille de la feuille n'est pas en cause. Les mesures varient de ±100 ms de temps de blocage d'une exécution à l'autre sur cette machine.

### Lighthouse des pages neuves

Performance / accessibilité / bonnes pratiques / SEO ; le LCP est celui du téléphone. Les pages du compte de démonstration (éditeur) sont mesurées avec sa session ; l'espace partagé comme le ferait quelqu'un qui a reçu le lien.

| Page             | Adresse                      | Mobile (perf / access. / bonnes prat. / SEO) | LCP mobile | Ordinateur            |
| ---------------- | ---------------------------- | -------------------------------------------- | ---------- | --------------------- |
| guides-combos    | `/guides/<héros>?tab=combos` | 100 / 100 / 100 / 69                         | 1,4 s      | 100 / 100 / 100 / 69  |
| guides-editor    | `/guides`                    | 100 / 100 / 100 / 69                         | 1,4 s      | 100 / 100 / 100 / 69  |
| my-space         | `/space`                     | 100 / 100 / 100 / 69                         | 1,4 s      | 100 / 100 / 100 / 69  |
| official-ratings | `/ratings`                   | 100 / 100 / 100 / 69                         | 1,4 s      | 100 / 100 / 100 / 69  |
| reflex-exercises | `/training/reflex`           | 100 / 100 / 100 / 100                        | 1,4 s      | 100 / 100 / 100 / 100 |
| reflex-exercise  | `/training/reflex/reaction`  | 100 / 98 / 100 / 100                         | 1,4 s      | 100 / 98 / 100 / 100  |
| shared-space     | `/space/shared#<jeton>`      | 100 / 100 / 100 / 69                         | 1,4 s      | 100 / 100 / 100 / 69  |

Le 98 de `reflex-exercise` est un titre qui sautait de niveau (`h3` sous le `h1`) : corrigé en `h2` après la mesure. Le 69 de SEO est le choix voulu des pages non indexées.

## Révision n°20 — idées d'entraînement, revues de VOD, bases de test

Demande du propriétaire : « continue sur les idées non faites, et sur les 59 bases non supprimées s'ils ne sont utilisés nulle part ». Les décisions et les points à confirmer sont dans `docs/DECISIONS.md` (révision n°20), les écrans hors maquette dans `docs/REDESIGN.md`, la sécurité des liens de vidéo et des classements dans `docs/SECURITY.md`.

**Fait**

- **Bases de test.** Les 59 bases `hok_test_*` ne servaient à rien (aucune connexion, aucun processus, aucun code qui les lise) : supprimées, avec une soixantième laissée par mon propre essai. Il ne reste que `hok_scrim`. **La cause est corrigée** : les outils de capture et de Lighthouse laissaient leur base jetable quand on les arrêtait. Nouvel outil `scripts/database/drop-test-databases.mjs` (liste d'abord, `--apply`, nom exact, jamais une base ouverte ou récente), 5 tests.
- **Routines** (`/training/reflex/routine`) : échauffement, mécaniques, concentration, tout, ou un choix libre ; barre des étapes, étape suivante activée une fois la partie enregistrée, sauter ou arrêter, bilan ; les exercices joués aujourd'hui sont cochés dans la liste.
- **Classement d'équipe** (onglet Entraînement de la page d'une équipe) : meilleur score par joueur concerné, par exercice, cette semaine ou depuis toujours, ex æquo partagés ; fermé aux joueurs tant que le staff n'a pas coché la case.
- **Objectifs de héros** : le staff demande les combos d'un héros dans une forme ou dans les deux (10 au plus par équipe) ; colonne par héros dans le tableau de progression ; carte **Héros à maîtriser** en haut d'Entraînement avec un bouton « S'entraîner ».
- **Révision espacée des combos** (1, 3, 7, 14, 30 jours) : cartes **Combos à vérifier aujourd'hui** (encore maîtrisé / rouillé) et **Combos à apprendre** en haut d'Entraînement, mises à jour sans recharger la page quand on coche une forme.
- **Revues de VOD** : type de note du carnet lié à un héros, avec le lien (`https://` seulement, jamais récupéré par le serveur) et les moments horodatés, tapés un par ligne ; chaque moment ouvre la vidéo à cet instant sur YouTube, Twitch (vidéos) et bilibili ; affichées aussi dans un espace partagé.
- **Migration 025** (additive) : `team_training_settings`, `team_hero_goals`, `combo_reviews` (remplie avec les combos déjà acquis), `training_notes.url` et `marks_json`.
- **Défaut corrigé** : changer le statut d'un objectif ou d'une mécanique depuis sa carte était refusé (« Only a combo has steps »), personne ne l'avait vu ; corrigé côté serveur et côté page, testé aux deux niveaux.
- **Style** : le nom du joueur n'avait pas de fond dans les tableaux à lignes encadrées ; le filtre des types du carnet écrasait « Revue de vidéo » sur téléphone. Vérifié sur captures à 1440 et 390 px, en allemand, russe, vietnamien, thaï et arabe.
- Traductions : 79 clés neuves en 14 langues (2 030 au total par langue). Documentation : README, ARCHITECTURE, REDESIGN, SECURITY, DECISIONS n°20, ce rapport.

**Vérifié**

- `npm run lint` et `npm run format:check` : 0 constat.
- `npm test` : **682 réussis sur 682** (45 de plus qu'à la révision n°19), 173 suites, aucun test ignoré, 12 minutes. Fichiers neufs : `test-databases` (la règle de l'outil de nettoyage), `team-ranking` (classement, réglages, accès des joueurs), `hero-goals`, `combo-review` (calendrier de révision, cartes, migration de ce qui était déjà acquis), `vod-notes` (les règles du temps, des moments et du lien, la validation d'une note, les routes, l'espace partagé, le renvoi d'une note lue avec seulement son statut changé) ; les tests des réflexes couvrent les routines.
- Parcours navigateur (`npm run test:e2e`, 31 parcours) : **31 sur 31 au premier passage de la chaîne** (787 vérifications), dont `training-extras`, neuf (69 vérifications) : routines (étapes, saut, arrêt, bilan, rien d'autre que la sauvegarde qui parte pendant une partie), classement (période, exercice, ouverture et fermeture aux joueurs), objectifs de héros par l'interface d'un coach puis vus par un joueur, cartes de révision (les deux réponses, le calendrier relu en base, le téléphone), revue de VOD dans le carnet (erreurs de saisie nommées par ligne, liens horodatés, statuts, édition, filtre, suppression, adresse dangereuse montrée comme du texte) et dans un espace partagé, téléphone.
- `npm run build` : bundle 111,5 Ko, 17 morceaux partagés, feuille 149,5 Ko (146,7 Ko à la révision n°19), CSS critique 18,1 Ko.
- **Captures contrôlées à l'œil** : page Héros d'un joueur, onglet Entraînement d'une équipe, carnet (carte et formulaire), espace partagé, à 1440 et 390 px ; puis à 390 px en allemand, russe, vietnamien, thaï et arabe : aucun débordement, les flèches des étapes d'un combo sont inversées en arabe. C'est ce contrôle qui a trouvé les deux défauts de style corrigés.
- **Lighthouse sur les pages touchées** (build de production, données de démonstration étendues dans `scripts/design/capture-pages.mjs` : un combo à vérifier, un objectif de héros, une revue de VOD) :

| Page                | Adresse                    | Mobile (perf / access. / bonnes prat. / SEO) | LCP mobile | Ordinateur            |
| ------------------- | -------------------------- | -------------------------------------------- | ---------- | --------------------- |
| `reflex-routines`   | `/training/reflex/routine` | 100 / 100 / 100 / 100                        | 1,4 s      | 100 / 100 / 100 / 100 |
| `shared-space`      | `/space/shared#<jeton>`    | 100 / 100 / 100 / 69                         | 1,4 s      | 100 / 100 / 100 / 69  |
| `training-heroes`   | `/training`                | 99 / 100 / 100 / 100                         | 1,4 s      | 100 / 100 / 100 / 100 |
| `training-notebook` | `/training/notebook`       | 100 / 100 / 100 / 100                        | 1,4 s      | 100 / 100 / 100 / 100 |

Le 99 de `training-heroes` sur téléphone est le temps de blocage (141 ms avec le ralentissement ×4 du processeur, la page dessine désormais jusqu'à trois cartes avant l'accès rapide) ; le 69 de SEO est le choix voulu d'une page non indexée. Ces pages dessinent leurs cartes une fois les données chargées, avant le premier affichage de la page : pas de décalage de mise en page (CLS 0,002 à 0,021). **Non mesuré :** l'onglet Entraînement d'une équipe (une page, pas d'adresse propre : Lighthouse ne sait pas cliquer sur un onglet).

**Limites connues et à confirmer**

- **Le code de cette révision ne tourne pas encore dans l'application « en direct »** : l'image du conteneur est ancienne et la base `hok_scrim` n'a pas les migrations 021 à 025. `docker compose up -d --build` avant de l'ouvrir ; les migrations s'appliquent au démarrage.
- **À confirmer** (détails dans `docs/DECISIONS.md`, révision n°20) : le classement fermé aux joueurs par défaut et sans le staff ; la cible d'un objectif de héros qui suit les combos écrits ; les intervalles de révision (1, 3, 7, 14, 30 jours) ; pour une revue de VOD, `https` seulement, le lien obligatoire et le héros obligatoire. Les points de la révision n°19 restent à confirmer.
- **Une revue de VOD est visible, avec son lien et ses moments, de qui a le lien de l'espace partagé** (c'est la fiche d'entraînement). Les moments sont des liens qui ouvrent la vidéo à l'instant seulement pour YouTube, les vidéos de Twitch et bilibili ; ailleurs elle s'ouvre au début. Ces adresses suivent les conventions publiques de ces sites (`t=` en secondes, `t=1h2m3s` pour Twitch) ; elles sont testées pour ce qu'elles écrivent, **pas essayées sur les sites eux-mêmes** (ni le serveur ni les tests n'y accèdent).
- **Pas de rappel actif** des combos à vérifier : ils apparaissent en haut de la page Héros de l'Entraînement, rien n'est envoyé (ni notification, ni message Discord).
- **Rien n'est commité** : l'arbre mêle le travail en cours du propriétaire et le mien (environ 460 chemins).

## Révision n°21 — tier lists et notes officielles sur le même tableau

Demande du propriétaire : « rends le rating (de D à SS, par un éditeur) et les tier lists avec le même affichage (dans les tier lists, ça commence plutôt par SS), et applique le même style dans ratings ». Les décisions et le point à confirmer sont dans `docs/DECISIONS.md` (révision n°21), l'écart avec la maquette dans `docs/REDESIGN.md`.

**Fait**

- **Un seul tableau pour les deux pages** : le composant `components/tier-board.css` (étiquette colorée, portraits ronds de 68 px, ligne « Unranked » en pointillés, barre d'outils) et `core/tiers.js` (`tierRow`, `tierPortrait`). La page des notes officielles n'a plus sa propre mise en page (plus de carte, plus de pastilles avec un nom) : onglets des voies, barre d'outils, tableau, exactement comme les tier lists.
- **Une nouvelle tier list commence par SS** : SS, S, A, B, C, D (la liste des six noms est unique, `shared/tiers.js`, et le serveur des notes la lit aussi).
- **La couleur d'un tier suit son nom** (SS magenta, S rouge, A orange, B jaune, C vert, D bleu : les couleurs de la note d'un héros sur sa fiche), plus sa position. Les tier lists déjà enregistrées (S à D) gardent leurs couleurs ; un tier déplacé garde la sienne ; un tier renommé change de couleur tout de suite ; un nom autre que les six garde la couleur de sa place.
- Rien ne change dans ce que font les pages : renommer, déplacer, ajouter, supprimer un tier d'un côté ; glisser ou cliquer puis choisir le tier, enregistrer par voie de l'autre. Un héros choisi au clic reçoit un anneau.
- Aucune clé de traduction neuve (« Drop a hero here » n'est plus utilisée : les deux pages disent « Drop heroes here »).

**Vérifié**

- `npm run lint` et `npm run format:check` : 0 constat. `npm run build` : bundle 111,3 Ko, 19 morceaux partagés, feuille 148,8 Ko (149,5 Ko avant : le tableau n'est plus écrit deux fois), CSS critique 18,1 Ko.
- `npm test` : **688 réussis sur 688** (6 de plus qu'à la révision n°20), 175 suites, aucun test ignoré. Neuf : `tiers.test.js` (les six noms et le nom d'où se choisit une couleur, dont les cas qui ne doivent pas en avoir une : « ß », « S+ », des caractères pleine chasse ; les deux pages dessinent leurs lignes avec les mêmes fonctions ; une tier list neuve commence par SS ; **un tier a la même couleur sur le tableau et sur la note d'un héros**, lu dans les feuilles de style).
- Parcours navigateur : **31 sur 31 au premier passage** de la chaîne (797 vérifications, 10 de plus). `tier-lists` (19) : une liste neuve a SS, S, A, B, C, D ; les six couleurs sont celles des noms et toutes différentes ; renommer SS en D, puis en « top », puis en « ss » ; déplacer un tier lui garde sa couleur. `ratings` (19) : **la page des notes et une tier list neuve, ouvertes par la même personne, ont les mêmes tiers, les mêmes couleurs, les mêmes tailles d'étiquette et de ligne, les mêmes portraits ronds** (valeurs calculées comparées).
- **Captures contrôlées à l'œil**, avant et après : 1440 et 390 px, thème sombre ; thème clair en arabe (sens de lecture inversé) ; allemand. Aucun débordement.
- **Lighthouse** (build de production) : `/ratings` mobile et ordinateur 100 / 100 / 100 / 69 (SEO : page volontairement non indexée), LCP mobile 1,4 s, comme avant ; `/tier-lists` pour un visiteur : 99 mobile, 100 ordinateur ; connecté : 97 mobile (98 à la révision n°18, LCP 2,6 s au lieu de 2,5 s : c'est la page dessinée après le chargement des données, voir la révision n°18, et l'écart est celui de la mesure), 100 ordinateur.

**Limites connues et à confirmer**

- **Les tier lists déjà enregistrées ne sont pas modifiées** : elles commencent encore à S. Pour avoir SS en tête, ajouter un tier, le renommer SS et le monter. **À confirmer :** s'il veut un tier SS vide ajouté en tête de toutes les listes existantes, c'est une migration qui touche les listes de chacun (certaines sont partagées par lien) : je ne l'ai pas faite sans son accord.
- La maquette dessine un tableau de S à D : ce choix s'écarte d'elle, à sa demande.
- **Rien n'est commité** (l'arbre mêle le travail en cours du propriétaire et le mien) ; l'application « en direct » n'a toujours pas ce code (`docker compose up -d --build`, qui applique aussi les migrations 021 à 025).
- Le conteneur MySQL du projet s'était arrêté entre deux tâches (sorti avec le code 137 pendant que je ne lançais rien : cause inconnue) : je l'ai relancé avec `docker compose up -d mysql` ; la base `hok_scrim` est intacte.

## Révision n°22 — stats « choix », valeurs temporaires et conditions sur le héros

Demande du propriétaire : « pour les stats on peut avoir des nombres entiers, un pourcentage mais aussi (pour la range, ça peut être ranged ou melee), et il y a des items qui peuvent augmenter temporairement la range, et certains items qui ont des effets différents selon que c'est mêlée ou à distance (et des conditions similaires pour chaque stat […] certains items changent selon une ou plusieurs conditions au niveau des héros, il faut le prévoir à 100 %) ». Les décisions et les points à confirmer sont dans `docs/DECISIONS.md` (révision n°22), les écrans hors maquette dans `docs/REDESIGN.md`, la sécurité des conditions dans `docs/SECURITY.md`.

**Fait**

- **Quatre sortes de stat** : un nombre (décimales permises), un nombre entier, un pourcentage et un **choix** dont l'administrateur écrit les options (« Mêlée », « À distance »…). Le code ne connaît ni la portée ni la mêlée : tout est saisi. Les options gardent leur numéro quand on les renomme et ne le réutilisent jamais ; une stat, une option ou un tag utilisé ne peut être ni supprimé ni changer de sorte (409).
- **Les données d'un héros** prennent, pour une stat « choix », l'option du héros (sans croissance par niveau) ; un objet ou un arcane peut aussi donner une option (il l'emporte sur celle du héros).
- **Valeurs temporaires** : une ligne de stat peut durer n secondes avec une note (« après l'actif ») ; le labo la liste à part et ne la compte jamais dans le total.
- **Conditions sur le héros**, sur chaque ligne de stat, chaque passif et chaque actif : une stat du héros (une option, ou une comparaison de nombre au niveau du build), un tag, une classe, une voie, « le héros est l'un de ceux-ci » (20 au plus), le niveau, des groupes « toutes / au moins une » les uns dans les autres (3 niveaux, 12 conditions) et la négation de n'importe laquelle. Écrites sans code dans la page Catalogue, vérifiées par le serveur à l'enregistrement, évaluées par la même fonction pure sur le serveur et dans la page ; jamais de code exécuté.
- **Le labo de builds** (sans compte) ne compte que ce qui s'applique **au héros du build, à son niveau** et le dit : combien de valeurs ne s'appliquent pas, lesquelles sont temporaires, lesquelles **n'ont pas pu être vérifiées** (aucun héros choisi, ou sa fiche ne dit pas la stat) : « on ne peut pas savoir » n'est jamais lu comme « non ». Les lignes qui ne s'appliquent pas sont barrées, celles qu'on ne peut pas vérifier sont marquées, un passif qui n'est pas pour le héros est grisé ; la fiche d'un héros fait de même pour ses builds recommandés.
- **Écrans** : Catalogue (sorte et options d'une stat ; « temporaire » et « seulement quand… » sur chaque ligne d'un objet ou d'un arcane et sur chaque passif ou actif, avec la condition écrite en phrases), données d'un héros (l'option d'une stat « choix »), labo de builds et fiche d'un héros.
- **Migration 026** (additive) : `game_stats.options_json`. Traductions de l'interface : 3 lots, 2 110 clés par langue à ce moment.
- Documentation : README, ARCHITECTURE, REDESIGN, SECURITY, DECISIONS n°22.

**Vérifié**

- `npm run lint` et `npm run format:check` : 0 constat.
- `npm test` : **772 réussis sur 772** (84 de plus qu'à la révision n°21), 189 suites, aucun test ignoré, 13 minutes. Fichier neuf de cette révision : `stat-conditions.test.js` (41 tests : les sortes de stat et leurs options stables, chaque sorte de condition et les trois réponses, groupes et négation, le calcul du labo pour un héros de mêlée, un à distance, sans héros et à la portée inconnue, les lignes temporaires, ce que le serveur accepte et refuse, ce qui est utilisé, le tout à travers l'API d'administration).
- Parcours navigateur : `stat-conditions` (41 vérifications), au premier passage de la chaîne : écrire une stat « choix » dans la page, un objet aux lignes temporaires et conditionnelles (groupes, tag, classe, niveau), les données d'un héros avec son option, le labo **sans compte** pour un héros de mêlée, un à distance et un dont la portée n'est pas renseignée (ce qui est compté, ce qui est barré, ce qui n'a pas pu être vérifié), la fiche d'un héros, la largeur d'un téléphone.
- **Captures contrôlées à l'œil** (formulaire d'une stat « choix », formulaire d'un objet aux lignes conditionnelles, labo pour un héros de mêlée, un à distance et sans héros) à 1440 et 390 px.
- `npm run build` et Lighthouse sur les pages touchées : voir la révision n°23 (les mêmes mesures : la démonstration contient maintenant une stat « choix », un objet « Hunter's Bow » aux lignes et passifs conditionnels et l'option du héros de la fiche, et le build de démonstration du labo le porte).

**Limites connues et à confirmer**

- **La portée d'un héros n'est jamais déduite de sa classe** : l'administrateur renseigne l'option de chaque héros ; tant qu'il ne l'a pas fait, ce qui en dépend est « impossible à vérifier » (compté nulle part, dit dans la note). **À confirmer** avec le propriétaire (détails dans `docs/DECISIONS.md`) : qu'une pièce qui donne une option l'emporte sur celle du héros ; qu'une valeur temporaire ne soit jamais dans le total (un interrupteur « avec l'actif » serait possible) ; les tailles maximales (12 conditions, 3 niveaux, 20 héros).
- **Le code de cette révision ne tourne pas encore dans l'application « en direct »** : l'image du conteneur est ancienne et la base `hok_scrim` n'a pas les migrations 021 à 027. `docker compose up -d --build` avant de l'ouvrir ; les migrations s'appliquent au démarrage (aucune migration déjà appliquée n'a été modifiée).
- **Rien n'est commité** : l'arbre mêle le travail en cours du propriétaire et le mien.

## Révision n°23 — traduction automatique de tout ce que le staff écrit

Demande du propriétaire : « remarque importante : quand on ajoute des stats, ou bien n'importe quel texte / noms etc. Tout doit être traduit automatiquement dans toutes nos langues pour que ce soit vraiment simple… ». Les décisions et les points à confirmer sont dans `docs/DECISIONS.md` (révision n°23), l'onglet dans `docs/REDESIGN.md`, la sécurité (ce qui part, ce qui ne part jamais, la clé) dans `docs/SECURITY.md`, le mode d'emploi dans le README (« Automatic translation of what the staff writes »).

**Fait**

- **Tout ce que le staff écrit est traduit dans les 15 langues du site, en arrière-plan** : noms et descriptions des stats et de leurs options, des tags, des objets et des arcanes ; notes d'un bonus ; nom et texte d'un passif ou d'un actif ; détails des compétences d'un héros ; builds recommandés (nom, note) ; combos (nom, note, indices) ; situations d'entraînement publiées et cartes. Le texte reste **tel qu'il a été saisi** ; la traduction est à côté. Un visiteur lit sa langue ; **sans traduction il lit le texte saisi**, rien ne manque ni ne casse. Ce que les joueurs écrivent n'est jamais traduit ni envoyé.
- **Un service à choisir** : Claude (Anthropic), DeepL ou LibreTranslate hébergé par le propriétaire. **Désactivé par défaut** : rien ne part nulle part tant que `TRANSLATION_PROVIDER` n'est pas fixé et la clé donnée (`.env.example` et `docker-compose.yml` les documentent, sans valeur).
- **Ce qui revient est vérifié** (nombres identiques, pas de balise, pas vide, pas démesuré), une correction à la main n'est jamais écrasée, reprises espacées, budget de caractères par jour, pause quand le service demande de ralentir, arrêt quand il refuse la clé, un seul processus à la fois.
- **Onglet « Traductions » du Catalogue** : l'état (service, compteurs, caractères du jour), la liste d'une langue avec filtres et recherche, **corriger à la main**, **revenir à l'automatique**, **garder tel quel** (un nom propre), « Traduire maintenant », « Réessayer celles qui ont échoué ». Sans service, l'onglet le dit et laisse traduire à la main.
- **Les pages** (labo de builds, fiche d'un héros, combos, situations d'Entraînement, carte, Mon espace) lisent le dictionnaire de la langue du visiteur avant de dessiner ; les formulaires des éditeurs montrent et enregistrent toujours le texte saisi, donc une traduction ne peut jamais être réécrite dans le catalogue.
- **Migration 027** (additive) : `content_texts`, `content_translations`, `translation_usage`.
- **Un défaut trouvé en relisant** : les situations d'Entraînement non publiées auraient été dans le dictionnaire public ; seules les publiées sont lues (test, qui échoue sans la correction).
- **Interface** : 57 clés neuves plus « Texts » en 14 langues (2 167 par langue). Documentation : README, ARCHITECTURE, REDESIGN, SECURITY, DECISIONS n°23.

**Pour l'activer**

1. Choisir un service et obtenir sa clé (Claude : une clé de l'API d'Anthropic ; DeepL : une clé ; LibreTranslate : l'adresse de votre serveur).
2. Dans `.env` : `TRANSLATION_PROVIDER=anthropic` (ou `deepl`, `libretranslate`) et `TRANSLATION_API_KEY=…` (jamais dans le dépôt).
3. `docker compose up -d --build` (applique aussi les migrations 021 à 027).
4. Catalogue → Traductions → « Traduire maintenant » ; les textes déjà écrits sont traduits d'un coup, les suivants un instant après chaque enregistrement.

**Vérifié**

- `npm run lint` (tout le dépôt) et `npm run format:check` : 0 constat. `npm test` : **772 réussis sur 772** (84 de plus qu'à la révision n°21), 189 suites, aucun test ignoré, 13 minutes. Fichier neuf : `translations.test.js` (43 tests) : les règles pures (la clé d'un texte, les nombres d'un texte dans tous les chiffres, ce qu'une traduction doit être, les reprises espacées, le budget), les **trois fournisseurs contre de faux serveurs HTTP** (la forme de chaque requête, la clé qui n'apparaît dans aucune erreur, clé refusée, trop de requêtes, panne, réponse illisible), le traducteur sur une vraie base avec un fournisseur scripté (une traduction par texte, jamais d'écrasement d'une correction à la main, échec et nouvel essai, pause, arrêt sur clé refusée, budget du jour, lot illisible coupé en deux, deux tours à la fois, tous les endroits où le staff écrit, **les situations non publiées laissées de côté**) et les routes (dictionnaire public et ETag, accès réservé aux administrateurs, correction, retour à l'automatique, « garder tel quel », un tour demandé, un enregistrement du staff qui en demande un). `i18n.test.js` : 24 sur 24 (2 167 clés par langue).
- **Contrôle de mutation** : sans le filtre « situation publiée », le test des situations échoue (« the title, the brief and the pins of a draft stay out ») ; avec lui, il passe.
- Parcours navigateur : **32 sur 33 au premier passage de la chaîne** (868 vérifications une fois `language` compté à part). `translations` (30 vérifications) est neuf, avec un fournisseur scripté (jamais un vrai service) : avant tout tour, le visiteur lit les textes tels que saisis ; après le tour, en français il lit les noms des stats et des options, l'objet, sa description, ses passifs, la note d'un bonus, les conditions, le build recommandé et son tag, en arabe (page de droite à gauche) les noms traduits et le reste tel que saisi, en anglais les textes saisis ; une traduction qui a changé un nombre est refusée et le texte reste tel que saisi ; l'onglet : l'état, « Traduire maintenant » qui trouve un texte neuf, le filtre et la recherche, « Échec » avec sa raison, « Réessayer », la correction à la main (lue par le visiteur, jamais écrasée par un nouveau tour), le retour à l'automatique (seul ce texte est redemandé, dans cette langue), « garder tel quel » (le dictionnaire de toutes les langues l'oublie), le changement de langue de la liste, le téléphone ; **un deuxième serveur sans service** : l'onglet dit que la traduction est désactivée et comment l'activer, les textes sont trouvés et une traduction écrite à la main est lue par le visiteur. **`language` a échoué une fois** : un délai de 30 s à l'ouverture d'une page en thaï à 390 px (aucune vérification n'avait échoué) ; relancé seul, **deux fois de suite : 42 vérifications, propre**, et les quatorze pages thaï, aux deux largeurs, s'affichent chacune en moins d'une seconde quand on les ouvre à part. Aucune des pages de ce test n'attend le dictionnaire ; **je n'ai pas pu en trouver la cause**, et je le signale comme une intermittence à surveiller. Les sept parcours qui touchent au dictionnaire (`translations`, `build-lab`, `stat-conditions`, `space`, `training`, `guides`, `heroes`) ont été relancés après la dernière modification du code de la page : 7 sur 7.
- **Démarrage réel de `server/server.js`** sur une base jetable (sur un port au-dessus de 3400, jamais le 3000 ; aucune clé, aucun service) : sans réglage il démarre, annonce « translation : off », sert un dictionnaire vide ; avec LibreTranslate sur une adresse où rien n'écoute il démarre et annonce le service ; sans clé (DeepL), sans adresse (LibreTranslate) ou avec un fournisseur inconnu il **refuse de démarrer** (code 1) en nommant le réglage, sans écrire le mot de passe de la base.
- `npm run build` : bundle 111,6 Ko, 22 morceaux partagés, feuille 152,4 Ko (148,8 Ko à la révision n°21), CSS critique 18,1 Ko.
- **Captures contrôlées à l'œil** de l'onglet Traductions (1440 et 390 px, thème sombre et clair, filtre « Échec », interface en français, interface et liste en arabe). C'est ce contrôle qui a trouvé quatre défauts, corrigés : la pastille de la sorte s'étirait sur toute la colonne, l'onglet ouvert restait caché hors de la rangée d'onglets sur téléphone, les filtres cassaient un libellé (« À la main » sur deux lignes), et un texte source anglais dans une page arabe avait son point final du mauvais côté.
- **Un défaut de robustesse corrigé en relisant** : `contentReady()` n'avait pas de délai, donc une requête du dictionnaire qui n'aboutit jamais aurait retenu les pages qui l'attendent (labo, espace, entraînement, guides). Il attend 4 secondes au plus, puis la page est dessinée avec les textes tels que saisis, et la page suivante redemande.
- **Lighthouse** (build de production, mobile et ordinateur, démonstration étendue de `scripts/design/capture-pages.mjs`) sur les pages que ces deux révisions touchent :

| Page                  | Adresse                      | Mobile (perf / access. / bonnes prat. / SEO) | LCP mobile | TBT mobile | Ordinateur            |
| --------------------- | ---------------------------- | -------------------------------------------- | ---------- | ---------- | --------------------- |
| `build-lab-with-hero` | `/build-lab?h=…&i=1.3.4.7&…` | 100 / 100 / 100 / 100                        | 1,4 s      | 72 ms      | 100 / 100 / 100 / 100 |
| `visitor-build-lab`   | `/build-lab`                 | 98 / 100 / 100 / 100                         | 1,7 s      | 148 ms     | 100 / 100 / 100 / 100 |
| `visitor-hero-sheet`  | `/heroes/<id>`               | 93 / 100 / 100 / 100                         | 2,0 s      | 291 ms     | 100 / 100 / 96 / 100  |
| `training-heroes`     | `/training`                  | 99 / 100 / 100 / 100                         | 1,4 s      | 92 ms      | 100 / 100 / 100 / 100 |

Rien ne régresse : 98 pour le labo d'un visiteur, 93 pour la fiche d'un héros sur téléphone et 99 pour l'entraînement sont les valeurs de la révision n°19 (91 à 93 pour la fiche, dont le temps de blocage vient du style et de la mise en page de ses 800 éléments, voir la révision n°19) et n°20 ; le 96 de la fiche sur ordinateur est « image-size-responsive » (le relais d'images de démonstration sert des images de 1 × 1 px). **Non mesurés :** l'onglet Traductions (un onglet de la page Catalogue, sans adresse propre : Lighthouse ne sait pas cliquer sur un onglet) et la page Catalogue.

**Limites connues et à confirmer**

- **Les trois services n'ont pas été essayés contre le vrai service** : aucune clé n'existe, et rien n'a été envoyé à un service réel pendant mes essais. Ils l'ont été contre de faux serveurs HTTP locaux (réponses documentées, clé refusée, trop de requêtes, panne, réponse illisible). La mise en forme des requêtes suit leur documentation publique ; **la première vraie traduction doit être regardée dans l'onglet** (état, échecs et leur raison).
- **À confirmer** (détails dans `docs/DECISIONS.md`) : le choix du service (coût, confidentialité : ce qu'on envoie à un service tiers est soumis à ses conditions) et le budget quotidien (400 000 caractères par défaut) ; qu'un même mot ait la même traduction partout (« Range » nom de stat ou détail de compétence) ; le fonctionnement par dictionnaire dans la page plutôt qu'une traduction faite par le serveur.
- **DeepL et LibreTranslate ne couvrent pas forcément les 15 langues** : celles qu'ils refusent restent « telles que saisies » et l'onglet les liste en échec avec la raison.
- **Les 57 traductions de l'interface sont les miennes** ; un locuteur natif peut vouloir les relire (comme pour les lots précédents).
- **Le code de cette révision ne tourne pas encore dans l'application « en direct »** (voir la révision n°22).
- **Rien n'est commité.**

## Révision n°24 — catégories d'items, images de Downloads, traduction DeepL plus simple

Demande du propriétaire (10 octobre) : ranger les items dans des catégories (Physical, Magical, Defense, Movement, Jungling, Roaming) en plus de leurs slots (six dont une botte et trois core, deux de fin de partie, deux utilitaires) ; regarder les dossiers `items_256px` et `Arcanas` de Downloads ; optimiser leurs images (les arcanes « plus qualitatives ») ; rendre la traduction avec sa clé DeepL plus efficace et plus simple. Les décisions et les points à confirmer sont dans `docs/DECISIONS.md` (révision n°24), le mode d'emploi dans le README (« Automatic translation of what the staff writes », « Two ways to sort an item », « Importing a folder of pictures »).

**Fait**

- **Slot et catégorie sont deux choses**, et les règles des builds n'ont pas bougé (6 emplacements dont une paire de bottes au plus, 2 ou 3 items core, 2 de fin de partie, 2 utilitaires). La catégorie est facultative, une seule par item (migration 028, `shopCategory`).
- **Classer en lot** : le bouton **Classer en lot** du Catalogue (cases à cocher, panneau avec les six catégories et les quatre slots, filtre « Pas encore de catégorie »), une seule requête, tout ou rien. Un slot ne change pas sous un build recommandé (409). Puces de catégorie dans le labo de builds et dans l'éditeur des guides.
- **Images** : gardées jusqu'à **256 px** (128 px avant), WebP, transparence sans perte, servies en 64, 128 ou 256 px selon la taille dessinée (`?w=`, `srcset`). Arcanes plus petites que 128 px : agrandies à 128 px (Lanczos et netteté légère).
- **Importateur** `scripts/catalog/import-images.mjs` : simulation par défaut, `--apply`, manifeste, `--undo`. **Appliqué à la base de développement après sauvegarde** : 71 items (6 paires de bottes, aucune catégorie : le propriétaire les classe lui-même) et 30 arcanes (10 rouges, 10 bleues, 10 vertes, sans stats), migration 028 appliquée.
- **DeepL, une ligne** : `DEEPL_API_KEY=` suffit (ce que le propriétaire avait déjà écrit marche toujours). Le **quota est lu chez DeepL** et affiché, le traducteur s'arrête à 90 %, un 456 met en pause jusqu'à la fin de la période, les langues ne sont traduites que **lorsque quelqu'un les demande** (« Traduire dans toutes les langues » donne l'ancien comportement), 50 textes par requête, quatre langues à la fois, ce qui a été fait est gardé si DeepL s'arrête en route. `npm run translations:check` vérifie la clé.
- **Défauts corrigés en route** : un cache du catalogue qui pouvait servir l'ancien catalogue une demi-minute après une écriture ; une valeur vide de `TRANSLATION_DAILY_CHARS` qui valait « n'envoie rien » ; `docker-compose.yml` qui forçait `TRANSLATION_PROVIDER=off` par défaut (une clé seule n'aurait rien allumé dans Docker).
- Traductions de l'interface : 37 clés neuves en 14 langues (2 200 par langue). Documentation : README, ARCHITECTURE, REDESIGN, SECURITY, DECISIONS n°24, ce rapport.

**Vérifié**

- `npm test` : **851 réussis sur 851** (79 de plus qu'à la révision n°23), 209 suites, aucun test ignoré, 14,6 minutes. Fichiers neufs : `item-categories` (8 : les règles pures, l'API, le lot, l'ancien formulaire qui n'efface rien, le slot qui ne change pas sous un build), `catalog-images` (12 : le traitement d'une image, les tailles servies, la validation par taille, l'arcane agrandie, l'arcane sans stat), `catalog-cache` (3 : la course du cache), `catalog-import` (7 : les noms, la couleur, l'importateur de bout en bout sur une base jetable), `translations-deepl` (18 : une ligne suffit, 456, quatre langues à la fois, ce qui est fait est gardé, le quota), `translations-languages` (23 : langues à la demande, quota, tailles de requête, arrêt en route, routes), `translations-check` (8 : l'outil de vérification de la clé). Les 43 tests de traduction de la révision n°23 passent toujours (ils demandent d'abord toutes les langues).
- Parcours navigateur : **34 sur 34 au premier passage de la chaîne** (906 vérifications). `item-categories` est neuf (31 : classer en lot par cases à cocher, « Tout sélectionner », le filtre, le slot, le refus d'un slot utilisé par un build, le formulaire, les tailles d'images demandées, une arcane sans stat, les puces du labo, le téléphone) ; `translations` passe à 37 vérifications (les langues, le quota, le bouton « + », « Traduire dans toutes les langues »). Ce parcours a trouvé la course du cache du catalogue.
- `npm run lint` (tout le dépôt) et `npm run format:check` : 0 constat. `npm run build` : bundle 111,6 Ko, 22 morceaux partagés, feuille 153,5 Ko (152,4 Ko), CSS critique 18,1 Ko.
- **Importation** : essai à blanc sur les vrais dossiers (101 images, 8 387 Ko deviennent 1 588 Ko), puis application ; la base relue après coup : 71 items dont 6 paires de bottes, 30 arcanes (10, 10, 10), aucun nom en double, 102 images. Le test de l'importateur le rejoue sur une base jetable : simulation sans écriture, création, nouvelle exécution sans rien changer, manifeste, annulation (les images disparaissent avec les entrées), le mot de passe n'est jamais affiché.
- **Contrôle visuel** des images traitées à leur taille réelle (arcanes à 128 px, items à 256 px) : bords nets, aucune frange.
- **Lighthouse** : mesuré avec la révision suivante (n°25, la liste de performance), sur toutes les pages, après les changements des deux révisions : résultats dans la révision n°25 et dans `docs/PERFORMANCE.md`.

**Limites connues et à confirmer**

- **L'application « en direct » n'a pas encore ce code** : son conteneur tourne avec le code de la révision n°23 (il lit sans problème les 71 items et les 30 arcanes importés, mais n'a ni les catégories ni le classement en lot). `docker compose up -d --build` (à faire par le propriétaire) apporte le code et applique la migration 029.
- **Les catégories des 71 items et le slot de ceux qui sont utilitaires ou de fin de partie restent à classer** par le propriétaire (Catalogue, Items, **Classer en lot**) : rien n'est deviné. Noms à relire : _Mask of Angony_, _Crimson Shadow - Starsping_, _Daybreakers Virtue_, _Overlords Might_.
- **« Sans perdre de qualité » = sans perte visible**, pas sans aucune perte (un fichier sans perte aurait pesé quatre à cinq fois plus pour chaque visiteur). Les arcanes agrandies sont plus nettes, pas plus détaillées : un agrandisseur par IA a été refusé.
- **J'ai utilisé la clé DeepL réelle une fois, par erreur** (l'outil de vérification charge `.env`) : deux lectures (quota et langues), aucun texte envoyé, rien de facturé, la clé n'est affichée nulle part. Elle a confirmé : clé gratuite, 6 364 caractères sur 500 000 utilisés, les 15 langues de l'interface sont proposées par DeepL. Aucun de mes essais n'envoie de texte à DeepL (faux services).
- **À confirmer** (détails dans `docs/DECISIONS.md`) : une seule catégorie par item ; les langues à la demande plutôt que toutes d'un coup ; l'arrêt à 90 % du quota ; les 37 traductions d'interface sont les miennes.
- **Rien n'est commité.**

## Révision n°25 — la liste de performance

Demande du propriétaire (10 octobre, pendant la révision n°24) : passer en revue une liste de vingt points (cache des réponses d'API, répartiteur de charge, index de la base, compression des images, squelettes de chargement, cache des requêtes coûteuses, N+1, anti-rebond, découpage du code, CDN, cache serveur, pagination, Lighthouse, compression des réponses, rendus inutiles, minification, chargement différé, scripts différés, dépendances inutilisées, pool de connexions), un par un, **en vérifiant et sans faire d'erreur**. Les décisions et les points à confirmer sont dans `docs/DECISIONS.md` (révision n°25) ; le registre avec les chiffres et les outils est `docs/PERFORMANCE.md`.

**Fait** (une ligne par point de la liste)

1. **Cache des réponses d'API.** Le privé reste `no-store`. Catalogue : gardé mais redemandé à chaque fois (ETag, 304). Héros et arrière-plans : idem, côté navigateur seulement. Pages populaires : publiques une minute. Aucune erreur n'est jamais gardée en cache (les routes d'images annonçaient « immuable » avant de fabriquer l'image : corrigé). Plus de `Vary: Cookie` sur les scripts et les images.
2. **Répartiteur de charge.** Pas de répartiteur à déployer ici. L'application est prête : verrou MySQL pour que les synchros de Camp ne tournent que sur une instance à la fois, arrêt en douceur (`SHUTDOWN_DRAIN_SECONDS`, `GET /api/health` répond 503 dès que l'instance s'en va), exemple nginx **écrit mais non exécuté**. Les limites de débit restent par instance (dit dans la doc).
3. **Index de la base.** Deux index (migration 030). Surtout, deux requêtes que **aucun index ne pouvait servir** ont été réécrites : leur coût suivait la taille de toute la table.
4. **Compression des images sans perte.** Déjà faite pour le catalogue (révision 24). Le dossier `static/` n'a rien à gagner (polices déjà WOFF2, une image sociale de 66 Ko).
5. **Squelettes de chargement.** Sur les pages en liste (équipes, historique, populaires, trouver un scrim, boîte de réception, fiche héros, accueil, tournois, notifications).
6. **Cache des requêtes coûteuses / 11. cache serveur.** Parties de tournoi, résumé et pages populaires : un calcul par 30 s quel que soit le nombre de visiteurs, vidé par toute écriture ; le catalogue avait déjà le sien. Mesuré : une requête qui calcule coûte 32 ms (héros) ou 16 ms (drafts), une qui trouve la réponse gardée 16 et 13 ms.
7. **N+1.** Une boucle « une requête par événement » trouvée dans les rappels (chaque minute) : une requête pour toute la fenêtre. Aucune route ne répète une requête par ligne ; la sonde le signale et un test le fixe.
8. **Anti-rebond.** Filtre du catalogue et recherche de héros (les deux qui coûtaient) ; le reste coûte moins de 20 ms la lettre ou l'avait déjà.
9. **Découpage du code.** Déjà en place : vérifié (une entrée, 24 morceaux partagés, un morceau par page).
10. **CDN.** Non ajouté (compte, domaine, DNS). L'origine lui donne ce qu'il faut : fichiers immuables à nom daté, pas de `Vary`, erreurs non cachables, copies précompressées, règles dans la doc.
11. **Pagination.** Vérifiée liste par liste : toutes sont paginées ou plafonnées (tableau dans `docs/PERFORMANCE.md`). Rien à changer.
12. **Lighthouse.** **mesuré sur les 64 pages, mobile et ordinateur (128 mesures, build de production, seul sur la machine)** puis, après les derniers correctifs, relancé seul sur les pages touchées. Ordinateur : performance 100 sur 64 pages sur 64, accessibilité 100 partout. Téléphone : accessibilité 100 partout ; performance 100 sur 34 pages sur 64 au premier passage, les autres entre 90 et 99 (le LCP simulé et le temps de blocage), à deux exceptions près traitées ci-dessous. Les SEO à 69 et 61 sont les pages volontairement non indexées (comme à la révision n°18). **Deux pages sont tombées sous leur niveau précédent, et j'ai cherché pourquoi au lieu de les arrondir :** (1) la page d'une série dont le chrono était échu (`draft-complete-result-form`, 83) avait un vrai décalage de mise en page de 0,2 : la page dessinait l'ancien état, demandait au serveur de passer à l'étape suivante, puis redessinait ; corrigé en demandant avant le premier dessin (décalage 0,002, performance 96 sur téléphone, comme à la révision n°18). (2) `visitor-build-lab` (77) et `visitor-history` (90) avaient un temps de blocage de 1 057 et 393 ms pendant que des agents d'aide lisaient des fichiers sur la machine ; relancées seules : 99 et 99. **Pas de régression mesurable due à cette révision** ; le tableau page par page complet est dans `docs/PERFORMANCE.md`. Relevés finaux sur téléphone des pages relancées : drafts 95 à 97 (LCP 2,6 à 2,8 s, comme avant), fiche héros d'un visiteur 93 (temps de blocage 308 ms, la page dessine 800 éléments ; 95 à la révision n°18).
13. **Compression des réponses.** Déjà active (brotli et gzip dès 1 Ko) : 5 à 9 fois moins d'octets sur les grandes listes. **Plus** : le build écrit des copies brotli niveau 11 et gzip niveau 9 des scripts et des styles, servies telles quelles (entrée 114 Ko → 30 Ko, styles 158 Ko → 26 Ko, aucun calcul par requête).
14. **Rendus inutiles.** Pas de boucle de dessin ; la série en ligne ne redessine que si sa version change, et ne scrute plus un onglet caché.
15. **Minification.** Déjà faite (esbuild) ; vérifiée.
16. **Chargement différé.** Toutes les images de liste l'ont, avec leur taille ; une manquait, ajoutée.
17. **Scripts différés.** Déjà le cas : la page se dessine sans aucun script, le module et la feuille sont demandés après le premier affichage.
18. **Dépendances inutilisées.** Aucune (8 d'exécution, 7 de développement, toutes importées).
19. **Pool de connexions.** Existait ; maintenant réglable (`DB_POOL_SIZE`, `DB_QUEUE_LIMIT`, `DB_CONNECT_TIMEOUT_MS`).

**Relecture et audit par deux agents d'aide (lecture seule)**, leurs constats vérifiés avant d'agir : cinq défauts réels de mon code corrigés (un cookie de session qui pouvait partir sur une réponse publique, un verrou qui monopolisait une connexion du pool et aurait figé l'application avec un pool d'une connexion, des en-têtes posés avant l'envoi des copies précompressées, un délai d'arrêt plus long que les 10 s de Docker, un calcul bloqué qui bloquait sa clé de cache), des tests renforcés, trois index de plus (migration 031) trouvés en lisant les 427 requêtes SQL, les parties de tournoi gardées par mois, et un vrai décalage de mise en page de la page d'une série au chrono échu (0,2 sur téléphone) corrigé en demandant au serveur avant le premier dessin.

**Chiffres** (sonde `scripts/performance/api-probe.mjs`, 30 000 séries, 3 000 comptes, médiane de 5 appels, serveur et MySQL sur la même machine : pour comparer deux versions, pas ce que verra un visiteur sur Internet). Compte très actif / compte presque vide, en millisecondes :

| Appel                 | Avant     | Après   |
| --------------------- | --------- | ------- |
| Liste des scrims      | 110 / 228 | 16 / 11 |
| Tier lists            | 44 / 42   | 11 / 8  |
| Accueil               | 94 / 130  | 13 / 11 |
| Statistiques (aperçu) | 202 / 182 | 7 / 6   |
| Statistiques (héros)  | 191 / 187 | 9 / 9   |
| Demandes              | 20 / 11   | 12 / 6  |

EXPLAIN signalait 11 requêtes avant, 3 après (les restantes sont expliquées dans `docs/PERFORMANCE.md`). La requête des rappels lisait 20 311 lignes et en lit 88 ; le badge des demandes en attente 8 383 et en lit 13. Une rafale de 12 lettres tapées d'un coup (processeur 4× plus lent) : filtre du catalogue 376 → 120 ms, recherche de héros 377 → 93 ms.

**Vérifié**

- `npm test` : **907 réussis sur 907** (56 de plus qu'à la révision n°24), 224 suites, aucun test ignoré, 15,7 minutes. Fichiers neufs : `query-performance` (15 : ce que voit une personne dans ses listes de séries, de tier lists et de demandes, l'ordre stable entre deux pages, une seule requête pour la fenêtre des rappels, les deux index, le pool de connexions, l'état « prêt » pendant l'arrêt), `http-caching` (11 : les en-têtes de cache de chaque route, le 304 du catalogue et sa mise à jour immédiate après une modification du staff, une erreur jamais gardée, pas de `Vary` sur les fichiers et les images, un calcul par 30 s pour les pages populaires), `ttl-cache` (7), `debounce` (4), `precompressed-assets` (9 : traversée de chemin avec un vrai fichier hors du dossier, HEAD, 304, copie disparue), `job-lock` (7 : une seule instance à la fois, le verrou rendu après une erreur, les deux minuteries) ; `lifecycle` passe de 5 à 8 tests (l'arrêt avec temps d'écoulement).
- Parcours navigateur : **36 sur 37 à la dernière passe de la chaîne** ; `tier-lists` a échoué par intermittence (erreur console 409 sur un glisser-déposer). **Cause trouvée après coup (révision n°26) et corrigée :** le client envoyait deux enregistrements à la suite (un renommage qui finit par Tab, puis un clic sur un bouton de déplacement) avec la **même version** ; le second était refusé comme conflit et la page rechargeait la liste sans la seconde modification. Les enregistrements se font maintenant l'un après l'autre (`persistTierList` dans `client/features/tier-lists/view.js`) ; le test passe 3 fois sur 3 et passait 2 fois sur 4 avant. Première chaîne complète de la révision : 36 sur 36 (932 vérifications). Neufs : `search-typing` (compte les dessins d'une rafale, échoue quand l'attente est retirée), `skeleton`, `draft-settle`.
- `npm run lint` (tout le dépôt) et `npm run format:check` : 0 constat. `npm run build` : bundle 111,7 Ko, 24 morceaux partagés, feuille 154,3 Ko, CSS critique 18,1 Ko, copies précompressées brotli et gzip.

**À faire ou à confirmer**

- **Reconstruire ton conteneur** (`docker compose up -d --build`) : il applique les migrations 029 (langues à la demande) et 030 (index) et le nouveau code. Je ne l'ai pas touché.
- **Classer tes 71 items** dans Catalogue → Items → « Classer en lot », et relire les quatre noms (Mask of Angony, Crimson Shadow - Starsping, Daybreakers Virtue, Overlords Might).
- **Durées de cache** (catalogue revérifié à chaque fois, pages populaires 60 s) : prudentes, dis-moi si tu veux plus long.
- **CDN et répartiteur** : à toi de choisir un fournisseur ; l'application et la doc sont prêtes.
- **Chapitre design** (Taste Skill, Impeccable, Playwright CLI, niveau de https://pvp.qq.com/, items et arcanes compris) : pas encore commencé ; il vient après cette révision.
- Rien n'est commité.
