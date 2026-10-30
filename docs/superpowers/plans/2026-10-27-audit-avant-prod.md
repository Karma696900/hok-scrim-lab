# Audit avant la production : ce qui est mort, en double ou périmé (phase 1, lecture seule)

Date : 2026-10-27. Branche `refonte` à `78d9c81`. Rien n'a été modifié dans le code pour écrire ce rapport.
Les scripts de mesure sont hors du dépôt (dossier temporaire de la session) : `graph.mjs` (graphe d'imports), `exports.mjs`
(exports jamais importés, avec acorn), `routes.mjs` (routes déclarées contre adresses appelées), `keys-orphans.mjs`,
`css.mjs`, `dup.mjs` (corps de fonctions identiques), plus des requêtes SQL en lecture seule sur la base de dev.

## En bref

Le code est **propre** : la refonte du 24 octobre a déjà fait le gros du ménage. Il n'y a **aucun fichier JavaScript mort**,
aucune dépendance npm inutile, aucun fichier de `src/public/` orphelin, aucune route sans appelant. Ce qui reste est petit :

| # | Quoi | Taille | Risque |
|---|------|--------|--------|
| A | Code mort précis (2 exports, 1 table vide, 7 règles CSS) | ~60 lignes | très faible |
| B | Clés de traduction orphelines | 138 sûres + 26 à revoir, ×15 fichiers | faible |
| C | Doublons de petites fonctions | 14 groupes, ~120 lignes | faible |
| D | Code de compatibilité avec d'anciennes données | 4 endroits | **dépend d'une question (voir plus bas)** |
| E | Commentaires et documents périmés | ~15 endroits, 3 documents à archiver | nul |
| F | Petits défauts trouvés en passant | 3 | faible |

**Une question pour toi avant la phase 2 :** y a-t-il déjà une base de **production** avec de vraies données (Heroku ou ailleurs),
ou la production partira-t-elle de zéro ? La réponse décide du point D.

## Preuves générales

- **Graphe d'imports** (imports statiques, `export … from`, `import()` littéraux, chemins `/shared/…` des tests navigateur) depuis
  `src/server/server.js`, `src/client/main.js`, `scripts/build/*`, chaque script de `scripts/` et chaque test : sur 1 051 fichiers JS
  versionnés, 654 sont atteints par l'application, 36 par les outils, 166 par les scripts et/ou les tests (aides de test, scripts),
  et 16 par aucun import, tous légitimes : `eslint.config.js` (lu par ESLint), `src/testing/run-e2e.mjs` (lancé par
  `npm run test:e2e`), et les 14 `src/public/locales/*.js` (chargés par ``import(`/locales/${code}.js`)`` et par
  `src/server/platform/server-i18n.js`). **Aucun fichier à supprimer.**
- **Dépendances npm** : chacune a un import réel (`compression` app-parts.js, `qrcode-generator` totp.js, `pdf-lib` series-file.js,
  `sharp` images, `playwright` pré-rendu et PDF, `esbuild` build, `acorn` / `acorn-walk` clés et tailles, `@fontsource/*`
  fonts-from-fontsource.mjs, `globals` / `@eslint/js` eslint). Voir F1 pour `espree`.
- **Routes** : 229 routes déclarées. Toutes ont un appelant : le client, un test, l'API publique v1 (`/api/tournaments/:id`, `/api/v1/me`),
  un service externe (rappels OAuth Google et Discord, interactions Discord), ou un robot (`robots.txt`, `sitemap.xml`, `llms.txt`).
  `src/server/route-access.test.js` classe déjà chacune.
- **Fichiers de `src/public/`** : chacun est cité par le code. **Colonnes de la base** : sur 510, seules les 2 colonnes de `hero_builds`
  et `schema_migrations.applied_at` (écrite par le moteur de migrations, normal) ne sont jamais nommées par le code serveur.
- **Tailles** : les limites tiennent (400 lignes par fichier, 120 par fonction, 600 par feuille). Deux exceptions justifiées dans
  `src/architecture-limits.json` (`api-probe.mjs`, `layoutProblems`). Les plus proches : `series-draft.js` 386 lignes, `home-view.js` 383,
  `hero-list.js` 373 ; fonctions `openPalette` et `createApiGateway` à 120 pile. Aucune découpe n'est nécessaire, mais ces fichiers ne
  doivent plus grossir.

## A. Code mort précis

| Élément | Preuve | Protection |
|---------|--------|-----------|
| `export { ITEM_CATEGORIES }` dans `src/client/features/build-lab/build-lab-view.js:39` (réexport) | aucun import de ce nom depuis ce fichier (`exports.mjs`) ; les pages l'importent de `src/shared/build-model.js` | lint, tests build-lab |
| `export const catalogOf` dans `src/server/platform/server-i18n.js:39` | `git grep catalogOf` : seule la définition (et une variable locale homonyme dans un e2e) | tests i18n |
| Table `hero_builds` (migration 010) : `arcana_json`, `items_json` | 0 ligne en base de dev ; aucun nom dans le code hors migration ; remplacée par `hero_build_sets` (127 lignes) | Une **nouvelle migration** `039` qui fait `DROP TABLE IF EXISTS hero_builds` (la 010 n'est pas modifiée) |
| CSS `.hs-span-4` à `.hs-span-8` (`styles/pages/hero-sheet.css:475-489`) et `.hs-row > [class*="hs-span-"]` (`hero-sheet-small-screens.css:10`) | `git grep hs-span` : aucune occurrence hors CSS, aucun préfixe `hs-span-${` | `design.test.js`, layout-lint |
| CSS `.pop-vs__label--lost` (`popular.css:392`) | seul `--won` est écrit (`popular-page-markup.js:33`) | idem |
| CSS `.rx-last` et `.rx-last li` (`reflex.css:388-395`) | aucune occurrence hors CSS | idem |

Ce qui n'en est **pas** : les 1 081 noms exportés que seul leur propre fichier utilise. Ce sont les fonctions regroupées dans `onView`
(le patron `bindTo` de la refonte, voir `docs/PAGE-ANATOMY.md`). Retirer le mot `export` toucherait plus de 300 fichiers sans rien changer.
**Je propose de ne pas le faire.**

## B. Clés de traduction orphelines

`collectKeys()` (`scripts/i18n/keys.mjs`) contre `src/translations/keys.tsv` : 2 690 clés, 2 526 utilisées, **164 orphelines**.
`sync.mjs` les compte (« no longer used ») mais ne les retire jamais.

- **138** dont le texte n'apparaît plus nulle part dans `src/` ni `scripts/` (exemples : `0020 Draft, track and review your series.`,
  `0027 Open scrims`, `0033 Roster source`, `0037 Official roster adapter`). À retirer de `keys.tsv` et des 14 `*.txt`, puis `sync.mjs`.
  Protection : `src/shared/i18n.test.js` (chaque clé utilisée est traduite) et la chaîne navigateur.
- **26** dont le texte est encore écrit dans le code, mais pas dans un appel que le collecteur reconnaît. **À garder** : on les revoit une
  par une. Cas confirmé : `gateway.js:65` et `:74` passent leurs messages par `refuse(…)`, que `TRANSLATORS` ne connaît pas. Ces deux
  messages de l'API publique ne sont donc jamais traduits (voir F2). Les autres (`Learn`, `blue`, `red`, `Member`…) sont souvent des
  morceaux d'autres textes.

## C. Doublons (corps de fonctions identiques dans plusieurs fichiers)

`dup.mjs` : 14 groupes, de 6 à 10 lignes. À regrouper dans un seul module, à comportement identique :

1. `parse(value, fallback)` (lecture JSON tolérante) dans 5 stores : `catalog-store-parts.js:6`, `community/store-helpers.js:5`,
   `space-store-parts.js:3`, `team-store-parse.js:5`, `training-store-parts.js:6` → un seul dans `platform/database/`.
2. `editorOnly` / garde « éditeur » (8 lignes) : `catalog-routes-catalog-admin.js:42`, `catalog-routes-heroes-profile.js:18`,
   `platform/http/async.js:53` → n'utiliser que celle de `async.js`.
3. Garde « compte requis » (6 lignes) : `combo-routes-parts.js:15`, `reflex-routes-shared.js:3`, `training-routes-shared.js:3`.
4. `whole` de `catalog/fields.js:20` = `integer` de `platform/validation.js:84`.
5. `getUsedHeroes` de `series/series.js:71` = `usedHeroes` de `src/shared/draft-model.js:179` (le partagé existe déjà).
6. `catalog-routes-heroes-profile.js:7` et `:27` = `combo-routes-parts.js:22` et `:6` (garde de héros, aide de route).
7. `catalog/conditions.js:18` = `training/training-domain.js:32`.
8. `api-key-routes.js:22` = `auth-routes-parts.js:4`.
9. `community-routes-shared.js:3` = `discord-routes-parts.js:41`.
10. Côté client : `guides/combos-markup.js:10` = `guide-sheet.js:44` ; `reflex-list.js:42` = `reflex-routines.js:71` ;
    exercices `chimp.js:79` = `discern.js:75`.
11. Scripts : `catalog/import-data.mjs:45` = `dev/demo-data.mjs:76`.

## D. Code de compatibilité avec d'anciennes données (décision selon ta réponse)

Contrôles en lecture seule sur la base de dev :

| Code | Ce qu'il rattrape | En base de dev |
|------|-------------------|----------------|
| `series-draft.js:199` et `:225-233` (`legacyPending`, `late`) | brouillons enregistrés par une vieille version avec un ban « pending » sans échéance | 0 série concernée (25 séries) |
| `LEGACY_FLOWBORN_ID` (`hero-domain.js:8`, `tier-list-domain.js:36-53`) | l'ancien identifiant « flowborn » dans les tier lists | 0 tier list concernée |
| `scripts/accounts/claim-legacy.js` | séries et tier lists d'avant les comptes (« orphelines ») | 1 série (2026-10-04) et 1 tier list (2026-10-06) sans propriétaire |
| `catalog-store-items.js:46` (« older page » sans catégorie de boutique) | un vieux client qui n'envoie pas le champ | à **garder** : c'est aussi la règle de l'API (un champ absent ne change rien) |

- **Si la production part de zéro**, on supprime les trois premiers (et on supprime les deux lignes orphelines de dev, ou on les rattache
  à ton compte avec `claim-legacy.js` avant de le retirer).
- **S'il existe une base réelle**, on garde tout, ou on vérifie d'abord ces trois cas sur une copie de cette base.

## E. Périmé (aucun effet sur le site)

- Commentaires qui parlent encore de `static/` (avant la refonte : `src/public/`) : `scripts/brand/make-brand-assets.mjs:3-7`,
  `scripts/build/fonts-from-fontsource.mjs:2,4,53`, `scripts/i18n/add.mjs:9`, `src/client/styles/base/fonts.css:5`,
  `src/public/fonts/fonts.css:5`, `src/server/platform/server-i18n.js:1`.
- `docs/ARCHITECTURE.md:52` dit migrations « `001` … `035` » : il y en a 38.
- `.env.example` ne cite pas `MFA_KEY_FILE`, `SCRYPT_LOG2N`, `AUTH_ISSUER` (lus par `src/server/config.js:171-173`), ni
  `CHROME_PATH` (Lighthouse). README les cite en partie. À compléter.
- Documents à déplacer dans `docs/history/` : `docs/REPORT.md` (940 lignes, journal de l'ancienne refonte, chemins `src/domain/…`,
  `public/app.js` qui n'existent plus), `.impeccable/NEXT-PAGES.md` et `.impeccable/PAGE-BRIEF.md` (consignes aux agents de
  la refonte du 11 octobre, citent `design/DESIGN.md` qui n'est plus dans le dépôt). `docs/samples/.gitkeep` : dossier vide, à retirer.
- `scripts/dev/video-frame.mjs` n'est cité que par `docs/REPORT.md` : outil d'examen. À garder, mais à citer dans README.

## F. Petits défauts trouvés en passant

1. `scripts/dev/outline.mjs` importe `espree`, qui n'est pas dans `package.json` (il arrive par ESLint). Le remplacer par `acorn`
   (déjà déclaré), ou déclarer `espree` en dépendance de développement.
2. Les deux messages de refus de l'API publique (`gateway.js:65,74`) ne sont pas traduits : `refuse` n'est pas dans `TRANSLATORS`
   (`scripts/i18n/keys.mjs:25`). C'est une API pour développeurs, l'anglais suffit : je propose de le dire dans un commentaire, et de
   ne pas garder ces deux clés dans `keys.tsv`.
3. `scripts/i18n/keys.mjs:121` plante quand on l'importe sans fichier lancé (`process.argv[1]` indéfini, par exemple `node -e`).
   Protéger le test du point d'entrée.

## À ne pas supprimer, même si ça ressemble à du code mort

- `src/server/platform/database/migrations/*` : jamais modifiées ni supprimées. On ajoute la 039 pour `hero_builds`, on ne touche pas la 010.
- `scripts/vod-drafts/` (non versionné) : utilisé par la tâche Windows `HoK-autostream` toutes les 30 minutes.
- `src/translations/*` et `src/public/locales/*` : les secondes sont générées par les premières.
- `docs/history/`, `docs/DECISIONS.md`, `docs/PERFORMANCE.md` : journaux (les anciens chemins y sont normaux).
- Les maquettes de `%USERPROFILE%\Documents\hok-design-directions\` : archives, hors dépôt.
- `src/testing/*`, `scripts/dev/*`, `scripts/performance/*`, `scripts/security/*` : outils de mesure et de test, tous cités par le README
  ou les docs.
- `src/public/locales/*.js`, `eslint.config.js`, `src/testing/run-e2e.mjs` : sans import, mais chargés par chemin.
- Les exports « internes » du patron `onView` (voir A).
- `src/server/features/tournaments/tournament-coherence.js` : utilisé par le script de vérification et l'import des vidéos, pas par le serveur.

## Plan de la phase 2 (après ton « ok »)

Un commit par zone, comportement identique, et après chaque zone `npm run lint` plus les tests unitaires de la zone :

1. `chore(dead-code): remove unused exports and CSS rules` : point A, sans la table.
2. `chore(db): drop the unused hero_builds table` : migration 039, avec son test de migration.
3. `refactor(server): one copy of the small helpers` : point C, serveur.
4. `refactor(client): one copy of the small helpers` : point C, client et scripts.
5. `chore(i18n): remove orphan translation keys` : point B (les 138), plus F2.
6. `chore(legacy): …` : point D, **selon ta réponse**.
7. `docs: …` : point E et F1, F3.

À la fin : `npm test` complet et chaîne navigateur complète, **conteneur arrêté** (je te le demanderai), puis consignes-audit et un
Lighthouse sur un échantillon. Puis la phase 3 (tests d'intrusion).

**J'attends ton « ok »** (tu peux retirer des lignes) et ta réponse sur la base de production.
