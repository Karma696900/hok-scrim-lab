# HOK GLOBAL SCRIM LAB (draft_hok) — MISSION CLAUDE CODE

Tu travailles sur le dépôt `draft_hok`, un site dédié à **Honor of Kings Global**
(pas la version chinoise). Je suis sous **Windows / PowerShell** : toutes les
commandes que tu me donnes doivent être compatibles PowerShell (pas de `rm -rf`,
`PORT=3000 npm start`, `touch`).

Un audit a déjà été fait par lecture du code. **Ne lui fais pas confiance
aveuglément** : tu as le dépôt réel, tu peux lancer l'app et la base. Vérifie
chaque point avant de le corriger.

## 1. Règles absolues

- Ne JAMAIS inventer de données (builds, arcanes, winrates, matchups, synergies).
  Donnée absente = « Data unavailable ».
- Global uniquement. Ne jamais mélanger avec la Chine ni avec Arena of Valor.
  Ne jamais déduire une correspondance de noms entre sources (Lu Bu id 123 et
  Fatih id 128 sont deux héros Global distincts).
- Corrections propres et ciblées. Pas de réécriture gratuite, pas de migration
  de techno (Express, vanilla JS, CSS, MySQL restent).
- Ne supprime aucune fonctionnalité existante : drafts, BO, Global Ban & Pick,
  Free For All, logique Flowborn, draft en ligne, Google auth, tier lists, synchro
  du roster, history, export/import JSON.
- Sécurité avant vitesse. Exactitude des données avant esthétique.
- Migrations de base NON destructives. Les anciennes séries et tier lists restent
  accessibles. Sauvegarde MySQL avant toute migration (donne-moi la commande).
- Aucun secret en dur. Logs sans secrets, sans cookies, sans tokens.
- Quand tu modifies fortement un fichier, donne-moi le contenu complet.
- Pas de nouvelle dépendance sans justification. `express-rate-limit` est
  accepté. Pour la validation, schéma maison ou `zod` : décide et justifie.

## 2. Stack actuelle (déjà lue)

- Backend : Express 5 (ESM). `src/server.js` contient toutes les routes.
  Domaine pur dans `src/domain/draft.js` et `series.js`. MySQL via mysql2
  (`src/database.js`). Auth Google maison (`src/services/google-auth.js`).
  Synchro du roster par Playwright (`src/services/hero-sync.js`).
- Données : `series` et `tier_lists` = un blob JSON (LONGTEXT) par ligne, sans
  propriétaire. Schéma créé par `CREATE TABLE IF NOT EXISTS`, aucune migration.
- Frontend : vanilla JS, `public/app.js` (~744 lignes), rendu en `innerHTML`.
- Tests : 18 tests `node:test`, domaine uniquement. `npm test`.
- Docker : node 24 + Chromium, utilisateur non-root, healthcheck, MySQL 8.4.

## 3. Décisions déjà prises (non négociables)

1. **Aucune donnée « ranked »** nulle part : ni affichage, ni stockage, ni
   filtre. Les champs `banRate`, `showRate`, `winRate`, `tRank` de la réponse
   Camp sont ignorés.
2. **L'API Liquipedia m'est inaccessible.** Pas d'ingestion automatique de stats
   compétitives. On garde une structure avec provenance (`source`, `sourceUrl`,
   `region`, `patch`, `updatedAt`) alimentée par un **import JSON/CSV manuel
   réservé admin** (attribution CC BY-SA obligatoire). Par défaut :
   « Data unavailable ».
3. **Synergies et matchups** : uniquement calculés à partir des scrims de
   l'utilisateur, étiquetés « Tes scrims », avec un seuil minimum de games
   (défaut 30, configurable). Sous le seuil : « Insufficient sample ».
4. **Visibilité (règle de l'utilisateur)** : chacun ne voit que ses propres
   séries et tier lists, plus celles reçues via un lien d'invitation. Même
   principe pour les deux types d'objets.
   - Les utilisateurs sans compte reçoivent une identité invité (cookie
     httpOnly aléatoire 256 bits) comme propriétaire. Fusion à la connexion Google.
   - Les lignes existantes sans propriétaire deviennent « orphelines »,
     invisibles à tous, rattachables à mon compte par un script d'une seule
     exécution (`scripts/claim-legacy.js`, commande PowerShell fournie).
5. **Tier lists** : champ `lane` (`null` = All Roles). Anciennes tier lists sans
   lane = All Roles, inchangées. Flowborn : IDs internes conservés (5 formes,
   IDs 581 à 585, une lane chacune). Dans une tier list de lane : un seul
   Flowborn, nommé « Flowborn ». Dans « All Roles » : les 5 formes restent des
   entrées distinctes, nommées « Flowborn » avec un badge de lane, sans « (role) ».
   Purger l'ID legacy `"flowborn"` à la normalisation côté serveur. Zone
   Unranked : avatars uniquement, nom en tooltip et label accessible.
6. **Direction artistique** (phases ultérieures) : « Broadcast Arena » comme base
   (navy #070D1F, électrique #2D6BFF, cyan #29D3FF, blanc #F4F8FF), touches de
   « Crystal Draft » sur portraits et fiches héros. Le bleu de marque (spectre
   cyan vers indigo) doit être distinct du bleu fonctionnel « Blue Team »
   (saphir #2F80FF, réservé au contexte d'équipe). Red Team #FF4D5E.
   Logo : concept « Lames jumelles » (deux lames en miroir dont l'espace négatif
   dessine un H abstrait, dégradés de bleu, SVG, lisible à 16 px, original,
   sans ressemblance avec le logo officiel).

## 4. Faits vérifiés sur la réponse Camp (`getranklist`, updateTime 20260925)

- Chaque héros apparaît UNE seule fois, avec UN seul `position`
  (0 Clash, 1 Mid, 2 Farm, 3 Jungle, 4 Roamer). Les héros multi-lane ne peuvent
  pas venir de cet endpoint. Plan : lane Camp par défaut + table d'ajouts
  manuels marqués `manual`.
- Flowborn = 5 lignes : 581 Tank (pos 0), 582 Mage (1), 584 Marksman (2),
  583 Assassin (3), 585 Roamer (4), noms « Flowborn (Tank) » etc.
- Le roster actuel dépend d'un endpoint de classement. Objectif à terme :
  s'en détacher via un endpoint de liste de héros (à capturer par DevTools,
  voir `docs/samples/` si je t'y ai déposé des captures).
- Un wrapper communautaire non officiel mentionne des endpoints Camp pour le
  détail d'un héros et les ajustements de saison. Contenu non vérifié. Ne pas
  utiliser son daemon `camp-security` (binaire tiers) : on garde Playwright.

## 5. Constats d'audit à RE-VÉRIFIER dans le code réel

**CRITICAL**

- `POST /api/series/import` (server.js ~227) : sans auth, `id` fourni par le
  client, upsert (`saveSeries` ON DUPLICATE KEY) : écrasement de n'importe
  quelle série, y compris en ligne.
- IDOR/BOLA séries locales : `listSeries` (database.js ~128) ne filtre que les
  séries online ; `GET/PUT/DELETE /api/series/:id` sans propriétaire.
- Tier lists globales sans propriétaire (server.js ~237, database.js ~251) ;
  `PUT` crée ou écrase n'importe quel ID.

**HIGH**

- `PUT /api/series/:id` fait confiance à l'objet entier : un joueur en ligne
  peut réécrire picks, bans, vainqueur ; le front l'utilise aussi pour éditer
  une durée avec un état possiblement périmé (app.js ~490).
- Races : verrou en mémoire seulement sur `ready` et `advance` ; `action`,
  `game`, `complete`, `timer/*` non verrouillés ; `saveSeries` en last-write-wins.
- `POST /api/roster/sync` public, lance Chromium (`--no-sandbox`), sans
  single-flight ni cooldown.
- Abus : création anonyme illimitée, `listSeries` charge toute la table à chaque
  appel (et le client le rappelle après chaque action), pas de limite de longueur
  des noms d'équipes côté serveur.
- En ligne : tout participant peut supprimer la série, enregistrer le résultat,
  piloter les timers.

**MEDIUM**

- Aucun header de sécurité (CSP faisable : pas de script inline, mais des
  `style=""` inline à refactorer) ; `X-Powered-By` exposé.
- Cookie `Secure` seulement si `COOKIE_SECURE=true` (défaut false) ; session
  fixe 30 jours, sans rotation, sans purge des sessions expirées.
- Pas de protection CSRF explicite (atténuée par SameSite=Lax + JSON).
- `route()` renvoie `error.message` brut ; pas de handler d'erreur global ;
  `*path` renvoie `index.html` pour les `/api` inconnus.
- Deux équipes de même nom acceptées alors que score et règles Global Ban & Pick
  se basent sur le nom.
- Mot de passe de repli codé en dur (database.js ligne 8), défauts dans
  docker-compose, rien ne refuse de démarrer en production avec ces défauts.
- Aucune validation de forme des imports (séries, tier lists).

**LOW** : `returnTo` à valider par parsing d'URL ; OAuth sans PKCE ; pas de rate
limit sur `/auth/*` ni de `trust proxy` ; pas d'arrêt propre (SIGTERM) ;
Chromium lancé à chaque démarrage ; README cite `docker_compose.yml` alors que
le fichier s'appelle `docker-compose.yml`.

**Points solides à conserver** : SQL entièrement paramétré ; tokens de session
hachés SHA-256 ; `state` OAuth avec `timingSafeEqual` ; `email_verified` exigé ;
cookies HttpOnly + SameSite ; invitations 64 bits ; `joinOnlineSeries`
transactionnel avec `FOR UPDATE`.

**Hypothèses fonctionnelles à vérifier**

- Le « 6ᵉ Flowborn » vient de l'ID legacy `"flowborn"` (voir `currentHero()` et
  `normalizeTierList()` dans app.js, qui conservent les IDs absents du roster).
  Vérification :
  ```powershell
  docker compose exec mysql mysql -u hok_app -p hok_scrim -e "SELECT id,name,lanes_json FROM heroes WHERE name LIKE 'Flowborn%'; SELECT COUNT(*) AS multi_lane FROM heroes WHERE JSON_LENGTH(lanes_json) > 1; SELECT COUNT(*) AS series, (SELECT COUNT(*) FROM tier_lists) AS tier_lists FROM series;"
  ```
- `pickSlotRow` (app.js ~244) utilise l'index du pick et ignore `pickAssignments` :
  risque de libellé de lane incohérent avec les échanges de priorité. À
  confirmer par un test avant de toucher.
- XSS : pas de point d'injection évident, mais `escapeHtml` partout dans des
  templates `innerHTML`. Faire une relecture complète ligne à ligne
  (certaines lignes sont très longues).
- Timer client basé sur `Date.now()` contre une `deadline` serveur : prévoir
  l'heure serveur dans les réponses.

## 6. TA MISSION : étapes A, B, C (voir 6 bis pour l'autonomie, puis section 7)

**Étape A — Vérification (aucune modification de code)**
Lis réellement les fichiers, lance `npm ci` puis `npm test`, démarre l'app et
la base (Docker Compose), exécute la requête SQL ci-dessus. Produis un court
rapport : ce qui est confirmé, infirmé, nuancé, et les nouveaux problèmes
trouvés (même format : sévérité, fichier et zone, problème, scénario,
correction, priorité). Ne passe à l'étape B qu'après l'avoir écrit.

**Étape B — Phase 0 : filet de sécurité**

- Extraire `createApp()` pour rendre l'API testable (plus de `await` top-level
  et `listen` dans le module importé).
- Tests HTTP de base sur l'API existante, avant toute modification de logique.
- Commit git de référence avant changement ; un commit par sous-étape.
- Script PowerShell de sauvegarde MySQL (`mysqldump` via `docker compose exec`)
  et procédure de restauration.
- Corriger les incohérences de documentation (nom du fichier compose, etc.).

**Étape C — Phase 1 : sécurité et autorisations**

- Système de migrations versionnées (table `schema_migrations`), non
  destructives. Colonnes propriétaire sur `series` et `tier_lists`, tables de
  partage (`*_members` avec rôle viewer/editor et jeton d'invitation),
  identité invité, état « orphelin » pour l'existant, script
  `claim-legacy.js`.
- Réécrire l'autorisation : toute requête SQL filtre par propriétaire ou
  membre ; 404 si non autorisé. `GET /api/series` et `GET /api/tier-lists`
  paginés et filtrés.
- Supprimer le `PUT /api/series/:id` générique. Remplacer par des endpoints
  ciblés passant par le domaine (par exemple modification de durée). Import :
  authentification requise, nouvel ID généré serveur, validation de schéma
  stricte (types, tailles, IDs de héros existants), propriétaire fixé par le
  serveur.
- Droits en ligne par rôle : suppression réservée au créateur ; résultat de game
  et timers selon des règles explicites.
- Concurrence : verrouillage en base (`SELECT … FOR UPDATE` en transaction)
  et/ou colonne `version` avec concurrence optimiste sur toutes les mutations
  de draft, game, résultat et timer. Plus de verrou purement en mémoire.
- Noms d'équipes : longueur max, distincts, contrôle serveur.
- Rate limiting (auth, création de série, join, actions de draft, import, export,
  sync roster), `trust proxy` configurable.
- Headers de sécurité : CSP stricte (autoriser seulement les images Camp et
  Google, polices nécessaires), `nosniff`, referrer-policy, frame-ancestors,
  permissions-policy ; retirer `X-Powered-By`. Ne pas casser OAuth ni les
  portraits.
- Cookies : `Secure` par défaut en production, préfixe `__Host-` si possible,
  durée et expiration glissante revues, purge périodique des sessions,
  rotation raisonnable. Vérification `Origin`/`Sec-Fetch-Site` sur les mutations.
- Erreurs : erreurs typées côté client, détail uniquement dans les logs,
  handler global, 404 JSON pour `/api/*`.
- `POST /api/roster/sync` réservé admin, exécution unique (single-flight),
  cooldown. Garde le garde-fou « conserver le dernier roster valide ».
- Refus de démarrer en production avec les secrets par défaut ; séparer
  clairement dev et prod.
- Tests pour CHAQUE faille corrigée (IDOR, import, ownership, partage,
  concurrence, rate limit, validation, expiration de timer, draft en ligne).

À la fin de chaque étape donne-moi : ce que tu vas changer, les fichiers
modifiés, les changements importants, les commandes PowerShell exactes pour
tester, le résultat de `npm test`, et une vérification que les fonctionnalités
existantes marchent toujours.

## 6 bis. MODE AUTONOME (prioritaire sur tout « attends ma validation »)

Je ne serai pas devant l'écran. **Ne me pose AUCUNE question et n'attends
aucune validation.** Enchaîne les étapes A, B, C puis les phases 2 à 10 de la
section 7, dans l'ordre.

- Travaille sur une branche `refonte` (`git switch -c refonte`). Un commit par
  sous-étape, message clair. Ne fais jamais de `push`, de `reset --hard` sur le
  commit de référence, ni de `git clean` destructif.
- N'agis que dans ce dépôt. Aucune commande destructive hors du dossier du
  projet. Aucune donnée MySQL supprimée : sauvegarde avant chaque migration.
- Avant de passer à la phase suivante : `npm test` vert, l'app démarre, les
  fonctionnalités existantes (section 1) fonctionnent toujours. Sinon corrige
  d'abord. Si tu n'arrives pas à corriger après plusieurs tentatives, annule
  ta modification de cette phase (revert du commit), note-le, et continue.
- Si un choix n'est pas tranché ici, prends la décision la plus prudente
  (sécurité, exactitude des données, non-régression), applique-la, et note-la
  dans `DECISIONS.md` (date, choix, raison). Ne t'arrête pas.
- Si une ressource externe manque (captures Camp du détail héros, Docker
  indisponible, source de données absente) : implémente le reste, affiche
  « Data unavailable » là où la donnée manque, note-le dans `DECISIONS.md`, et
  continue. N'invente jamais de données.
- À la fin de chaque phase, mets à jour `REPORT.md` : ce qui a été fait, fichiers
  modifiés, tests ajoutés et résultat de `npm test`, commandes PowerShell pour
  tester à la main, points à vérifier visuellement par moi.
- Termine par un `REPORT.md` final complet, la liste des décisions prises, les
  limites connues, et les commandes PowerShell pour lancer et tester l'app.

## 7. Phases à enchaîner après la phase 1

2. Tier lists : modèle v2 (lane, partage, Flowborn, avatars).
3. Données héros Camp (détails, ajustements de patch) + import compétitif manuel.
4. Pages Heroes et fiche héros (stats compétitives seulement si importées).
5. Design system + logo.
6. Refonte draft/Scrims : rendu par slot sans re-render complet, composition
   Blue/Red symétrique par vraie structure CSS (jamais `scaleX(-1)`),
   ready check, timer à trois états, scoreboard, navigation des games,
   `prefers-reduced-motion`, responsive.
7. Overview et History (filtres côté serveur, pagination).
8. Export PDF : gabarit HTML dédié rendu par Chromium, 100 séries maximum
   (message exact : « 100 series maximum per export. Narrow the date range or
   filters. »), file de génération limitée, rate limit, authentification et
   filtre par propriétaire, polices locales, portraits en cache avec
   placeholder, réseau bloqué sauf cache local. Export JSON conservé.
9. Tests de renfort. 10. Durcissement production (Docker, arrêt propre, logs).
