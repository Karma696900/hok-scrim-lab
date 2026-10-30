# Refactor complet : un code que tu peux modifier toi-même

> **Pour qui exécute ce plan :** utilise `superpowers:executing-plans` (je le fais moi-même, tâche après tâche) ou `superpowers:subagent-driven-development`. Les étapes utilisent des cases à cocher. **Rien n'est exécuté tant que tu n'as pas relu et validé ce plan.**

**But :** que chaque fichier se lise en une fois, qu'on sache où changer quoi, et que le projet te prévienne quand un fichier redevient trop gros. Comportement identique, scores identiques ou meilleurs.

**Approche :** on ne réécrit pas, on **découpe selon les coutures qui existent déjà**. Les grosses fonctions sont faites de dizaines de petites fonctions nommées ; on les sort dans des fichiers à leur nom, la page garde une courte fonction d'assemblage. Un test d'architecture à cliquet empêche ensuite le retour en arrière. Les tests existants (1 049 unitaires, 50 scripts navigateur) sont le filet de sécurité.

**Stack :** JavaScript ESM sans framework, Express 5, MySQL 8, `node:test`, Playwright, ESLint, Prettier.

**Spec :** pas de document de spécification séparé ; ce plan est dérivé de la mesure du code du 24 octobre 2026 (section suivante) et de ta demande : « de vrais refacto de tous les fichiers pour que ce soit vraiment plus simple, même pour moi, de modifier notre code ».

## Ce que la mesure montre

| Constat | Chiffre |
|---|---|
| Code applicatif hors tests et langues | client 58 300 lignes (213 fichiers), serveur 25 400 (173), partagé 2 300, scripts 5 700 |
| Fichiers JS de plus de 500 lignes | **18** (dont 3 de plus de 800 : `catalog-page.js` 1364, `api-probe.mjs` 1067, `tournament-page.js` 1053) |
| Fonctions de 70 lignes et plus | **170** ; les plus grosses sont des « usines de page » : `createCatalogPage` 1286, `createTournamentsPage` 1014, `createCatalogStore` 760, `createDraftView` 733, `createGuideEditor` 639 |
| Gestionnaires de clic géants | `onClick` de 151 lignes (catalogue) et de 219 lignes (tournois) ; `update` de 281 lignes (salle de draft) ; `showExercise` de 232 lignes ; `show` de 522 lignes (`training/heroes.js`) |
| Fichiers CSS de plus de 800 lignes | **8** sur 73 (`training.css` 1830, `reflex.css` 1257, `draft.css` 1239, `hero-sheet.css` 1200…) |
| Couplage entre fonctionnalités | **faible** : 52 paires seulement, au plus 6 dépendances par fonctionnalité. Ce n'est pas le problème. |
| Formatage | 42 fichiers non conformes à Prettier |
| Couleurs | déjà pilotées par variables (2 958 usages contre 324 couleurs écrites en dur dans les pages) : une couche de variables rendrait chaque couleur modifiable à un seul endroit (tâche 17, optionnelle) |
| Duplication | 0,29 % (mesurée le 19 octobre) : rien à dédoublonner |

**Conclusion :** le problème n'est ni l'architecture ni la duplication. C'est la **taille des unités** : une page entière dans une seule fonction qui garde son état par fermeture, avec un gros `onClick` au milieu.

## Contraintes globales

Chaque tâche les respecte implicitement.

- **Aucun changement de comportement, de texte, de route ni de balisage.** Un refactor qui change le rendu est un bug.
- **Tests verts avant et après chaque tâche :** `npm run lint`, `node --test` sur les fichiers de l'aire, `node src/testing/run-e2e.mjs <noms>` pour les scripts navigateur de l'aire, puis la chaîne complète à la fin de chaque phase (par lots de cinq, un navigateur à la fois).
- **Politique de sécurité du site :** aucun attribut `style` en ligne ; les valeurs dynamiques passent par `element.style.setProperty` ou une classe.
- **Performance :** le JavaScript chargé par chaque page reste sous **70 Ko** (63 Ko aujourd'hui) ; les pages lourdes restent chargées à la demande (`app/lazy-pages.js`, `app/lazy-actions.js`).
- **Une tâche = un commit** avec message `refactor(<aire>): …`. Aucun mélange de formatage et de logique dans un même commit.
- **Langues :** déplacer un texte ne change pas sa clé ; `scripts/i18n/sync.mjs` doit continuer à trouver exactement les mêmes clés.
- **Mémoire de la machine :** lots de cinq scripts navigateur, Docker limité à 1 Go ; ne pas lancer la chaîne entière en parallèle.

## Revue : ce qui risque de casser sans que les tests le voient

Chaque ligne a son test dans la tâche qui possède le code.

1. **État partagé par fermeture.** Une variable réassignée (`let current…`) copiée dans un autre fichier devient obsolète. Règle : tout état réassigné vit comme propriété d'un objet `ctx` partagé, jamais comme valeur copiée. Test : un test de caractérisation par aire qui enchaîne deux actions successives (Tâche 2).
2. **Actions des pages à la demande.** Déplacer un `onAction` hors de son fichier casse `app/lazy-actions.js`. Test existant : `src/client/app/lazy-actions.test.js` doit rester vert à chaque tâche qui touche une page lourde.
3. **Rendu serveur identique.** Les pages dessinées par le serveur et par le client doivent produire le même balisage. Tests : `ssr`, `first-paint`, `frames`, `hit-test`.
4. **Poids du JavaScript chargé d'avance.** Un découpage maladroit peut remonter des modules dans l'entrée. Test ajouté en Tâche 1 : l'entrée et son préchargement pèsent moins de 70 Ko.
5. **Clés de traduction perdues.** Un texte déplacé dans une chaîne construite autrement n'est plus détecté. Test : le code et `keys.tsv` doivent contenir exactement les mêmes clés (Tâche 1, étape 4).

## Structure cible

Un fichier ne fait qu'une chose ; un nom de fichier dit laquelle. Pour une page `<aire>` du client :

```
features/<aire>/
  README.md              ce qu'il y a ici, comment changer X (15 lignes)
  <aire>-page.js         assemble : installe, affiche, branche (moins de 120 lignes)
  <aire>-state.js        l'état de la page (un objet ctx) et ses fonctions de lecture
  <aire>-markup.js       fonctions pures : données en entrée, HTML en sortie
  <aire>-actions.js      les actions (onAction) : une fonction par action, dans une table
  <aire>-data.js         appels à l'API et transformations des réponses
```

Côté serveur, la séparation existe déjà (`*-routes.js`, `*-domain.js`, `*-store.js`) ; on ne la change pas, on découpe seulement les trois fichiers qui la dépassent (Tâches 13 à 15).

---

## Phase 0 : le filet et les règles

### Tâche 1 : le test d'architecture à cliquet, Prettier, le budget de poids

**Fichiers :**
- Créer : `src/architecture.test.js`, `src/architecture-limits.json`
- Modifier : `package.json` (script `lint` : ajouter `prettier --check`), `.prettierignore`
- Créer : `docs/HOW-TO.md` (vide pour l'instant, rempli en Tâche 18)

**Interfaces :**
- Produit : `architecture-limits.json` de forme `{ "maxFileLines": 400, "maxFunctionLines": 120, "maxCssLines": 600, "exceptions": { "<chemin>": { "lines": 1364, "functions": { "<nom>": 1286 } } } }`. Une exception ne peut que **baisser** : le test échoue si le fichier ou la fonction a grossi, et il échoue aussi si une exception n'est plus nécessaire (pour qu'on la supprime).

- [ ] **Étape 1 : écrire le test.** `src/architecture.test.js` parcourt `src/` et `scripts/` (hors tests, langues générées, migrations) ; il compte les lignes de chaque fichier, mesure chaque fonction avec `espree` (déjà présent via ESLint ; l'ajouter explicitement en `devDependencies`), et vérifie les limites et les exceptions. Assertions : `test("aucun fichier JS ne dépasse la limite, sauf les exceptions notées")`, `test("aucune fonction ne dépasse la limite, sauf les exceptions notées")`, `test("une exception qui n'est plus nécessaire est retirée")`, `test("aucun fichier CSS ne dépasse la limite, sauf les exceptions notées")`.
- [ ] **Étape 2 : générer `architecture-limits.json`** avec les 18 fichiers JS, les 170 fonctions et les 8 fichiers CSS actuels comme exceptions, aux valeurs mesurées aujourd'hui. Lancer `node --test src/architecture.test.js` : vert.
- [ ] **Étape 3 : test de poids.** Dans le même fichier, `test("le JavaScript chargé par chaque page reste sous 70 Ko")` : construit le bundle (`scripts/build/build.mjs`), additionne la taille minifiée de l'entrée et de son préchargement (`dist/manifest.json`), échoue au-dessus de 70 000 octets.
- [ ] **Étape 4 : clés de traduction.** `test("les clés de traduction du code sont exactement celles de keys.tsv")` : appelle `collectKeys()` de `scripts/i18n/keys.mjs` (qui existe déjà et que `sync.mjs` utilise) et compare l'ensemble des clés avec la deuxième colonne de `src/translations/keys.tsv` ; échoue si une clé est ajoutée ou perdue par un déplacement de code.
- [ ] **Étape 5 : formatage.** Commit séparé : `npx prettier --write` sur la liste exacte des 42 fichiers non conformes (jamais sur des dossiers entiers), puis ajouter `prettier --check` au script `lint`.
- [ ] **Étape 6 : vérifier et commiter.** `npm run lint` et `npm test` verts. `git commit -m "refactor(architecture): test à cliquet, budget de poids, Prettier appliqué"`.

---

## Phase 1 : prouver le motif sur une page

### Tâche 2 : `team-view.js` (591 lignes), la page témoin

Choisie parce qu'elle a la bonne taille (528 lignes dans une fonction), des coutures nettes (`stage` 34, `overviewPanel` 88, `memberCard` 27, `rosterPanel` 45, `seriesPanel` 61, `discordPanel` 25, `show` 100) et un script navigateur (`teams`, `discord-team`).

**Fichiers :**
- Créer : `src/client/features/teams/team-markup.js`, `team-state.js`
- Modifier : `src/client/features/teams/team-view.js`
- Tester : `src/client/features/teams/team-markup.test.js` (nouveau)

**Interfaces :**
- Produit : `createTeamContext(): TeamContext` (l'état : équipe courante, onglet, membres, séries) ; `stageMarkup(team, tab): string`, `overviewMarkup(ctx): string`, `rosterMarkup(ctx): string`, `seriesMarkup(ctx): string`, `discordMarkup(ctx): string`, `memberCardMarkup(member): string`.
- Consomme : l'objet `state` de `app/app-state.js`, inchangé.

- [ ] **Étape 1 : test de caractérisation.** Avant de toucher, écrire `team-markup.test.js` qui appelle les fonctions de balisage actuelles (les exporter telles quelles en premier) avec une équipe de démonstration et fige leur sortie exacte : `assert.equal(rosterMarkup(demo), expectedRoster)`. Les attentes sont copiées depuis la sortie **actuelle**.
- [ ] **Étape 2 : extraire les fonctions de balisage** vers `team-markup.js` sans changer une ligne de leur corps (déplacement pur). Le test de l'étape 1 reste vert.
- [ ] **Étape 3 : extraire l'état** (`let` réassignés) vers `createTeamContext()` ; chaque fonction reçoit `ctx`. Les `let` disparaissent de `createTeamView`.
- [ ] **Étape 4 : réduire `show` (100 lignes)** en trois appels nommés ; `createTeamView` ne fait plus qu'assembler. Cible : `team-view.js` sous 120 lignes.
- [ ] **Étape 5 : vérifier.** `node --test src/client/features/teams` ; `node src/testing/run-e2e.mjs teams discord-team series-teams` ; `node --test src/architecture.test.js` (retirer l'exception de `team-view.js` du JSON). Vert.
- [ ] **Étape 6 : écrire `docs/PAGE-ANATOMY.md`** : le motif, avec cette page comme exemple, en une page. Commit : `refactor(teams): la page d'équipe en fichiers à une seule tâche, motif de référence`.

---

## Phase 2 : le client, aire par aire

Chaque tâche suit **le motif de la Tâche 2** : test de caractérisation du balisage, déplacement pur des fonctions, état dans un `ctx`, page réduite à l'assemblage, retrait de l'exception du JSON. Les coutures ci-dessous sont celles que la mesure a trouvées. Pour les gestionnaires géants, on remplace la chaîne de `if` par une **table d'actions** (`{ "nom-action": (ctx, element) => … }`) branchée sur le `onAction` du produit.

### Tâche 3 : catalogue, `catalog-page.js` (1364 lignes, la plus grosse)
Coutures : `flagDefs` 39, `columns` 136, `listFor` 30, `formFor` 36, `handleSort` 34, `paintTranslations` 30, `save` 38, `chooseImage` 28, `onClick` **151**, `onChange` 48 ; 70 fonctions internes au total.
**Fichiers :** créer `catalog-columns.js` (colonnes et drapeaux), `catalog-list.js`, `catalog-form.js`, `catalog-images.js`, `catalog-actions.js` (la table qui remplace `onClick`/`onChange`), `catalog-state.js` ; réduire `catalog-page.js` à moins de 120 lignes.
**Vérifier :** `run-e2e.mjs catalog item-categories stat-conditions translations`.

### Tâche 4 : tournois, `tournament-page.js` (1053 lignes)
Coutures : `gameMarkup` 30, `editorMarkup` 36, `readFields` 25, `bodyOf` 41, `save` 35, `onClick` **219**, `onKeydown` 29 ; 56 fonctions internes.
**Fichiers :** `tournament-markup.js`, `tournament-form.js` (lecture des champs et corps de requête), `tournament-actions.js` (la table), `tournament-state.js`.
**Vérifier :** `run-e2e.mjs tournaments tournament-lanes tournament-suggest`.

### Tâche 5 : salle de draft, `draft-view.js` (768 lignes)
Coutures : `roomMarkup` 35, `mount` 58, `buildPool` 32, `applyFilter` 26, `setSlot` 26, `actionMarkup` 33, `tick` 62, **`update` 281**.
**Fichiers :** `draft-room-markup.js`, `draft-pool.js` (`buildPool`, `applyFilter`), `draft-clock.js` (`tick`), `draft-slots.js` (`setSlot`) ; couper `update` en `updateBans`, `updatePicks`, `updatePool`, `updateClock`, chacune sous 80 lignes.
**Point d'attention :** le temps de rendu de la salle de draft est ce qui coûte encore en Lighthouse mobile ; découper `update` permet aussi de répartir le travail en plusieurs tâches (voir plan Lighthouse).
**Vérifier :** `run-e2e.mjs draft draft-settle edit-draft hit-test`.

### Tâche 6 : éditeur de guides, `guide-editor.js` (683 lignes)
Coutures : `sheet` 27, `notesHtml` 39, `save` 37, `onClick` 44 ; 41 fonctions internes.
**Fichiers :** `guide-editor-markup.js`, `guide-editor-notes.js`, `guide-editor-actions.js`. **Vérifier :** `run-e2e.mjs guides combos`.

### Tâche 7 : laboratoire de builds, `build-lab-page.js` (631) et `workbench.js` (404)
Coutures : `keepPanel` 30, `sheetMarkup` 44, `showTip` 27, `keep` 44, `ownClick` 83 ; `createWorkbench` 404.
**Fichiers :** `build-lab-markup.js`, `build-lab-tips.js`, `build-lab-actions.js` ; couper `createWorkbench` en `workbench-slots.js` et `workbench-stats.js`. **Vérifier :** `run-e2e.mjs build-lab`.

### Tâche 8 : entraînement, `training/heroes.js` (549), `reflex-page.js` (600)
Coutures : `show` **522** en un seul bloc dans `heroes.js` ; `showExercise` **232**, `showRoutines` 63, `showList` 43 dans `reflex-page.js`.
**Fichiers :** `heroes-lanes.js`, `heroes-pick.js`, `heroes-goals.js` (un par section de `show`) ; `reflex-exercise.js`, `reflex-routines.js`, `reflex-list.js`. **Vérifier :** `run-e2e.mjs reflex training training-extras`.

### Tâche 9 : communauté, `agenda.js` (587), `inbox.js` (510), `find.js` (392)
Une page par fichier, chacune avec ses `-markup.js` et `-actions.js`. **Vérifier :** `run-e2e.mjs community`.

### Tâche 10 : espace personnel, données de jeu, réglages, popularité
`space-page.js` (493), `gamedata-page.js` (483), `settings-page.js` (400), `popular-page.js` (388). Même motif. **Vérifier :** `run-e2e.mjs space gamedata onboarding api-keys popular`.

### Tâche 11 : fiche héros et statistiques
`hero-sheet.js` (495), `hero-stats.js` (477), `hero-panels.js`, `hero-pages.js`. La fiche vient d'être reprise (colonnes) : découper `overviewPanel` par bloc (`overviewSkills`, `overviewPeers`…) en fichiers `hero-overview-*.js`. **Vérifier :** `run-e2e.mjs heroes hero-sheet-live hero-lanes hero-aliases hero-editor`.

### Tâche 12 : listes de tiers, scrims, historique, accueil
`tier-list-view.js` (506), `board.js` (464), puis les pages d'historique et d'accueil. **Vérifier :** `run-e2e.mjs tier-lists history export overview-layout`.

---

## Phase 3 : le serveur

### Tâche 13 : `catalog-store.js` (769 lignes, une fonction de 760)
Coutures : `createCatalogStore` contient 11 requêtes de 103 lignes au plus.
**Fichiers :** `catalog-store-items.js`, `catalog-store-arcana.js`, `catalog-store-spells.js`, `catalog-store-images.js`, `catalog-store-usage.js` ; `catalog-store.js` ne fait que les assembler. **Interfaces :** chaque fichier exporte `create<Partie>Store(pool, helpers): { …méthodes }` et le magasin assemblé garde exactement les mêmes méthodes. **Vérifier :** `node --test src/server/features/catalog` puis `run-e2e.mjs catalog gamedata`.

### Tâche 14 : `page-handler.js` (651 lignes) et `auth-service.js` (520)
`page-handler.js` : séparer le rendu des pages, les fichiers `sitemap`/`robots`/`llms`, et le choix des modules préchargés. `auth-service.js` : séparer inscription, connexion, double authentification, sessions (déjà des sections). **Vérifier :** `node --test src/server/platform/http src/server/features/auth` et `run-e2e.mjs ssr auth`.

### Tâche 15 : `series-routes.js` (472), `team-store.js` (455), `tournament-domain.js` (512), `catalog-domain.js` (588)
Même découpage par ressource. **Vérifier :** tests unitaires de l'aire et `route-access.test.js` (qui gèle qui peut appeler quelle route).

---

## Phase 4 : le CSS et les scripts

### Tâche 16 : les 8 fichiers CSS de plus de 800 lignes
`training.css` 1830, `reflex.css` 1257, `draft.css` 1239, `hero-sheet.css` 1200, `settings.css` 1126, `build-lab.css` 1112 et deux autres. **Principe :** un fichier par composant ou par bloc de page (`hero-sheet-skills.css`, `hero-sheet-peers.css`…), importés dans l'ordre actuel pour ne rien changer à la cascade. **Vérifier :** `run-e2e.mjs contrast layout-lint first-paint hit-test frames` ; comparer le CSS construit avant et après (`dist/styles-*.css` doit être identique à l'octet près hors noms).

### Tâche 17 : les couleurs en dur et la couche de variables
324 couleurs en dur dans les pages, 95 dans la base : les passer en variables nommées par rôle dans `base/tokens.css`. Le propriétaire garde son design actuel (24 octobre) : cette tâche n'a donc plus pour but d'appliquer une autre direction, seulement de rendre une couleur modifiable à un seul endroit. Elle devient optionnelle. **Vérifier :** `contrast.e2e.mjs` et un diff visuel des captures de `layout-lint`.

---

## Phase 5 : pouvoir modifier sans chercher

### Tâche 18 : le guide pratique `docs/HOW-TO.md`
Pas à pas, avec le fichier exact à toucher et la commande qui prouve que ça marche, pour : ajouter un bouton à une page, ajouter une page, changer une couleur, ajouter ou modifier un texte et ses 15 traductions, ajouter une route d'API, ajouter une colonne en base (migration), ajouter un test. Chaque recette est **jouée** une fois par moi sur le code avant d'être écrite.

### Tâche 19 : un `README.md` par fonctionnalité
Quinze lignes par dossier de `features/` : ce qu'il contient, le fichier d'entrée, comment le tester. Un test de `architecture.test.js` vérifie qu'il existe (`test("chaque fonctionnalité a son README")`).

### Tâche 20 (optionnelle, à ta décision) : types vérifiés sans migrer vers TypeScript
Ajouter `jsconfig.json` avec `checkJs` et des annotations JSDoc, d'abord sur `src/shared/` puis le serveur, avec `tsc --noEmit` dans `npm run lint`. Gain : l'éditeur te complète et signale les fautes de frappe quand tu modifies. Coût : la dépendance `typescript` (outil de développement seulement) et un peu d'annotation. **Je ne la lance que si tu le demandes.**

---

## Phase 6 : clôture

### Tâche 21 : resserrer, mesurer, documenter
- [ ] Descendre les limites de `architecture-limits.json` aux valeurs finales (fichier 400, fonction 120, CSS 600) : le fichier d'exceptions doit être vide ou ne contenir que des cas justifiés par écrit.
- [ ] Mettre à jour `docs/ARCHITECTURE.md` (nouvelle anatomie), `docs/DECISIONS.md` (révision), la mémoire du projet.
- [ ] Chaîne complète : lint, build, `npm test`, les 50 scripts navigateur par lots de cinq, l'audit des consignes, Lighthouse sur les 48 pages (seul sur la machine). Les scores doivent être égaux ou meilleurs qu'avant le refactor.
- [ ] Commit : `refactor: limites d'architecture finales`.

## Ordre, durée et risques

- **Ordre :** 1, 2, puis 3 à 12 (une aire à la fois, chacune livrable seule), 13 à 15, 16 et 17, 18 et 19, 21. La Tâche 20 selon ta décision.
- **Pourquoi cet ordre :** le test à cliquet (1) empêche de reculer ; la page témoin (2) valide le motif avant de l'appliquer 20 fois ; le client d'abord parce que c'est là que sont les 15 plus gros fichiers.
- **Estimation honnête :** chaque tâche d'aire est de l'ordre d'une demi-journée de travail pour moi, avec les tests ; l'ensemble représente plusieurs jours. On peut s'arrêter après n'importe quelle aire : le code est alors meilleur et le cliquet garde le gain.
- **Risque principal :** l'état partagé par fermeture (point 1 de la revue). Il se traite par le test de caractérisation de chaque aire, écrit **avant** le premier déplacement.
- **Ce que ce plan ne fait pas :** il ne change aucune fonctionnalité, aucun texte, aucune route, aucun design. Le propriétaire a décidé de garder son design actuel : les cinq directions de `hok-design-directions` restent des archives, et rien dans ce plan n'en dépend.

## Auto-relecture

- **Couverture de ta demande :** « refacto de tous les fichiers » est couvert par les phases 2 à 4 pour tous les fichiers au-dessus des limites (les 18 gros fichiers JS, les 8 CSS, les trois fichiers serveur) ; les fichiers sous les limites n'ont pas besoin d'être touchés, et le cliquet empêche qu'ils grossissent. « Plus simple pour moi » est couvert par les Tâches 18, 19 et 20.
- **Noms cohérents :** `architecture-limits.json`, `createTeamContext`, `ctx`, `<aire>-markup.js`, `<aire>-actions.js`, `<aire>-state.js` sont utilisés de la même façon partout.
- **Limite connue du plan :** pour les Tâches 6 à 12, les noms exacts des nouveaux fichiers sont donnés au niveau de l'aire ; les noms de fonctions viennent de la mesure et seront confirmés au début de chaque tâche par `scripts/dev/_seams.mjs`, qui sera conservé en `scripts/dev/outline.mjs`.
