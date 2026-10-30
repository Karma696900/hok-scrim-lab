# Brief commun : refaire une page de HOK Global Scrim Lab, de zéro, disposition comprise

Le propriétaire dort et ne répondra à aucune question : décide seul, avec soin. Il a rejeté tous les habillages précédents :
« c'est la disposition qui est moche ». Il veut **un redesign de zéro de chaque page : l'ordre des blocs, la présentation des
champs, des listes, des cartes, tout le front**, à un niveau de produit AAA (pense pvp.qq.com, hokstats.gg, Mobalytics,
Battlefy). Il a remarqué que seule la barre du haut était refaite : le reste doit vraiment changer, pas être repeint.

## À lire d'abord (obligatoire)

1. `design/DESIGN.md` : les règles visuelles et de disposition (navy + bleu, Barlow Condensed, `.page-head`, colonne de
   filtres à gauche, éditeurs à deux panneaux, détail = résumé + onglets). `PRODUCT.md` : le produit.
2. Les composants partagés sont déjà refaits : `client/styles/components/{buttons,cards,tabs,forms,data,shared}.css`,
   `client/styles/shell/shell.css`, `client/styles/base/tokens.css`. **Utilise-les ; ne les modifie pas** (ils servent aux
   pages des autres agents). S'il te manque une brique partagée, crée-la dans TA feuille de page avec un nom préfixé par ta
   page (`.hl-…`), et signale-le dans ton rapport.
3. Les captures de référence de sites réels : `.impeccable/references/*.png` (regarde 2 ou 3 avec Read).
4. Le code de ta page (JS qui produit le HTML dans `client/features/<ta page>/` et la feuille `client/styles/pages/<ta page>.css`).

## Ce que tu fais

Pour chaque page de ta liste : (a) regarde-la telle qu'elle est (capture), (b) décide d'une nouvelle disposition (en
t'appuyant sur les patterns de DESIGN.md et sur les sites de référence), (c) réécris le rendu JS ET le CSS de la page,
(d) vérifie. « Il y a plein de trucs qui vont pas sur les pages » : cherche activement ce qui est faux ou laid sur chaque
page (alignements, textes coupés, états vides pauvres, formulaires confus, boutons sans libellé, doublons, informations
mal hiérarchisées, éléments inutiles) et corrige-le. Garde TOUTES les fonctionnalités : rien ne disparaît sans équivalent.
Regroupe, réordonne, simplifie, mais ne supprime pas de feature.

## Contraintes dures

- **Ne lance JAMAIS `npm run build`** (il crée `dist/` et casserait le serveur de développement partagé qui sert les sources
  directement). Ne redémarre pas le serveur. Il tourne sur http://localhost:3000 avec les vraies données ; recharge la page.
- **Ne touche qu'à tes fichiers** : `client/features/<tes pages>/**`, `client/styles/pages/<tes pages>.css` (et `client/core/`
  seulement pour un nouveau petit module à toi). Si une modification d'un autre fichier partagé est indispensable, ne la fais
  pas : décris-la dans ton rapport. Si ta feuille de page est nouvelle, ajoute-la à `client/styles/main.css` (`@import`) et à
  `PAGE_FEATURES` de `tests/unit/design.test.js`.
- CSP : aucun attribut `style=""` en ligne ni `.style.x =` pour du style statique (classes uniquement ; une variable CSS
  posée via `setProperty` est tolérée si le code existant le fait déjà).
- Les sélecteurs que les tests de navigateur utilisent doivent rester (`[data-action]`, `.hcard`, `.build-slot`, `.nav-link`,
  `#view`, etc.). Avant de renommer ou supprimer une classe/un id/un texte, `grep` dans `tests/`.
- Tout texte visible passe par `t("English text")`. Un nouveau texte : ajoute-le avec `node tools/i18n/sync.mjs` puis
  `node tools/i18n/add.mjs fichier.json` (le fichier JSON mappe l'anglais → 14 langues : fr es de pt it ru tr ar id vi th
  ja ko zh), puis `node tools/i18n/sync.mjs`. Les 14 langues sont obligatoires.
- Thèmes sombre ET clair, RTL (propriétés logiques), mobile 390 px, aucun débordement horizontal, aucun texte < 12 px,
  contraste AA (4,5:1), focus clavier visible, `prefers-reduced-motion`.
- Pas d'images générées. L'art vient des vrais portraits/icônes déjà dans l'app, de SVG sobres écrits à la main, d'icônes
  (`shared/icons.js`). Pas d'emoji, pas de kicker/eyebrow au-dessus d'un titre, pas de dégradé sur du texte, pas d'ombre dure
  décalée, pas de bordure colorée > 1 px d'un seul côté, pas de cartes identiques « icône + titre + texte » comme structure.
- Performance : pas de grosse image supplémentaire, pas de JS lourd, `loading="lazy"` hors du premier écran.

## Vérification (obligatoire, tout vérifier)

1. Captures avec Playwright (`import { chromium } from "playwright"` dans un script `.mjs` écrit dans le dossier temporaire
   `$TEMP`, jamais dans le dépôt ; sous Git Bash exporte `MSYS_NO_PATHCONV=1`). Pour chaque page : bureau 1440x900 sombre,
   bureau clair (cookie `hok_theme=light`), mobile 390x844 sombre, et une capture en arabe (cookie de langue : voir
   `shared/display.js`/`shared/i18n.js`, ou `?lang` si supporté ; sinon `document.documentElement.dir="rtl"` pour la mise en
   page). **Regarde chaque capture avec Read** et corrige ce qui est laid ou cassé. Une boucle bornée : un grand lot d'écriture,
   une ronde de captures, un lot de corrections, une seconde ronde. Capture aussi les états : vide, chargement, erreur,
   survol/focus/désactivé des contrôles importants, avec des données réelles et sans.
2. Console du navigateur : aucune erreur ni avertissement CSP (écoute `console` et `pageerror`).
3. `npx prettier --write` sur tes fichiers, `npx eslint client` propre, `node --test tests/unit/design.test.js` vert.
4. Lance les tests de navigateur qui concernent ta page (`node tests/e2e/<nom>.mjs`, un à la fois ; ils démarrent leur propre
   serveur et base isolée). Liste-les en cherchant dans `tests/e2e/` ceux qui visitent tes pages. Corrige le code (ou le test
   si c'est une assertion de mise en page qui a légitimement changé, en expliquant pourquoi). Un test qui échoue pour une
   raison sans rapport : relance-le seul avant de conclure.
5. Compte de ligne par ligne ce qui a changé et vérifie qu'aucune fonctionnalité n'a disparu (liste les actions
   `[data-action]` avant/après avec `grep -o 'data-action="[^"]*"'` sur tes fichiers).

## Rapport final (≤ 25 lignes, en français)

Par page : la nouvelle disposition en 2 lignes ; ce que tu as trouvé de faux et corrigé ; ce qui reste imparfait ; les
tests lancés et leur résultat exact (pas d'approximation) ; les captures finales (chemins dans `.impeccable/review/<page>/`) ;
les changements partagés dont tu as besoin et que tu n'as pas faits. Ne prétends rien que tu n'as pas vérifié.

---

# RETOUR DU PROPRIÉTAIRE (PRIORITAIRE SUR TOUT LE RESTE DU BRIEF, ajouté après un premier passage)

Le propriétaire a ouvert http://localhost:3000 et a l'impression que les pages ressemblent à ce qu'elles étaient avant, alors
que « des milliers de choses n'allaient pas ». Il exige : **tout refaire, un GROS focus sur le DESIGN, et AUCUN VIDE.**

## 1. Refaire, pas repeindre

- Le test : mets la capture « avant » et la capture « après » côte à côte. Si on reconnaît la même structure (mêmes blocs, même
  ordre, mêmes proportions), c'est raté. Il faut une composition différente : autre ordre, autre nombre de colonnes, autres
  tailles, autre hiérarchie.
- Ne pars PAS du code existant pour « l'améliorer ». Ouvre l'ancienne page seulement pour **lister ses fonctionnalités**, puis
  dessine la page de zéro (écris d'abord, en commentaire de ton rapport, ton wireframe en 10 lignes), puis réécris le rendu JS
  et le CSS. Tu peux supprimer ou renommer librement les classes CSS de ta page ; garde les attributs `data-action`, les ids et
  les classes que `tests/` utilise (grep), et TOUTES les fonctionnalités.
- Dans le rapport : pour chaque page, **3 différences structurelles concrètes** avant/après.

## 2. Le design d'abord (barre de niveau pvp.qq.com / Mobalytics / Battlefy)

- Lis avant d'écrire : `.claude/skills/impeccable/reference/{craft-floor,layout,bolder,typeset}.md` et applique-les.
- **Chaque page s'ouvre sur une scène visuelle** : une bande pleine largeur (240 à 420 px) portant de l'ART RÉEL : couvertures
  16:9 des héros (utilise `heroSheet(hero)` de `client/core/hero-of-the-day.js` : `details.art.cover`, et
  `wide(cover,[640,960,1280,1920],"100vw")` de `shared/media.js`), portraits, icônes d'objets/arcanes/sorts, logos de voies,
  avec un voile sombre dégradé pour la lisibilité du titre, de grands chiffres et les actions principales. Varie les héros
  d'une page à l'autre (choisis-en un lié au sujet de la page). 1re image : `fetchpriority="high"`, les autres `loading="lazy"`.
- Contrastes de TAILLE marqués : titres 44 à 64 px en Barlow Condensed, chiffres 48 à 96 px, texte 15 px. cadres bleu clair fins,
  coins en équerre (`.card--feature`), profondeur (voiles, dégradés sobres, ombres douces pour ce qui flotte), jamais de
  rectangles sombres identiques empilés.
- Les portraits sont GRANDS (cartes verticales 3/4, picks en cartes hautes avec le portrait en fond), pas des pastilles de 40 px.
- Le bleu marine du fond et l'or sont les deux seules couleurs d'identité ; les équipes bleu/rouge uniquement pour les camps.

## 3. AUCUN VIDE (règle absolue)

Le propriétaire déteste les zones sombres vides, les cartes à moitié vides, les colonnes qui finissent en trou, le bas de page noir.

- (a) La mise en page **remplit** la largeur et la hauteur : grille 12 colonnes, colonne latérale `position: sticky`, modules qui
  s'étirent, `min-height: calc(100vh - var(--topbar))` sur le conteneur principal quand c'est utile.
- (b) Un **état vide** = UNE ligne compacte + une action (jamais un grand bloc centré avec une icône).
- (c) Autour d'un état vide, il y a TOUJOURS des modules remplis avec de **vraies données de l'app** : héros du jour/populaires,
  héros les plus bannis, derniers drafts publics, objets et arcanes, tier lists publiques, modèles de série prêts à lancer, bloc
  « comment ça marche » en 3 étapes illustrées, raccourcis riches. Rien d'inventé (pas de faux chiffres) : seulement ce que l'API
  fournit déjà, ou des contenus statiques utiles (explications, étapes, astuces) traduits avec `t()`.
- (d) Un bloc « Données indisponibles » devient une ligne de 1 ligne (ou disparaît pour un visiteur) et l'espace est repris par
  les blocs qui ont du contenu (`columns`, ou `grid-auto-flow: dense`).
- (e) **Vérifie avec une base presque vide ET avec beaucoup de données**, à 1440x900, 1920x1080 et 390x844 : aucune zone vide.
  Si un panneau est plus haut que son contenu, c'est un défaut : réduis-le ou remplis-le.
- Les captures que tu regardes doivent montrer le BAS de page (`fullPage: true`), pas seulement le premier écran.

---

# DONNÉES DE DÉMONSTRATION ET PAGES CONNECTÉES (disponibles depuis la nuit du 11 octobre)

Le serveur de développement (http://localhost:3000) contient maintenant un monde de démonstration : 10 personnes
(`*@demo.test`), 2 équipes (Crimson Fox : 8 membres ; Dawn Owls), 4 séries (3 terminées, 1 en cours ; la première est partagée avec
l'équipe), 3 tier lists, 5 événements d'agenda, 2 annonces de scrim, 4 tournois avec leurs parties. **Utilise-les pour voir les pages
connectées et vérifier qu'aucune page n'a de vide.**

- Les cookies de session sont dans `%USERPROFILE%/AppData/Local/Temp/claude/C--Users-USER-Documents-drafts-hok/f1336552-84f6-47d0-9ec7-5cd747b5ecd9/scratchpad/demo-sessions.json` : `{ admin, captain, coach, analyst, mid, jungle, clash, farm, roam, rival }`,
  chacun `{ name, email, tag, cookie }`. Dans Playwright : `await context.addCookies([{ name: "hok_session", value: sessions.captain.cookie, url: "http://localhost:3000" }])`
  (le cookie de thème est `hok_theme` = `dark` ou `light`).
- Un script de capture prêt : `node %USERPROFILE%/AppData/Local/Temp/claude/C--Users-USER-Documents-drafts-hok/f1336552-84f6-47d0-9ec7-5cd747b5ecd9/scratchpad/shot-as.mjs <sortie.png> </chemin> [personne|none] [largeur] [hauteur] [dark|light] [1=pleine page]`
  (sous Git Bash : `export MSYS_NO_PATHCONV=1`). Exemple : `node %USERPROFILE%/AppData/Local/Temp/claude/C--Users-USER-Documents-drafts-hok/f1336552-84f6-47d0-9ec7-5cd747b5ecd9/scratchpad/shot-as.mjs out.png /teams captain 1440 900 dark 1`.
- `captain` dirige Crimson Fox et crée les séries ; `coach` est coach de l'équipe ; `mid` est joueur ; `rival` dirige Dawn Owls ;
  `admin` (demoadmin@demo.test) est ADMINISTRATEUR (pages Catalogue, Tournois, Rapports).
- Le serveur a été redémarré (migrations 033 et 034 : clés d'API et séries d'équipe). Nouvelles routes : `/api/me/api-keys`, `/api/v1/*`,
  `PUT|DELETE /api/series/:id/teams/:teamId`, `GET /api/teams/:id/series`, `GET /api/tournaments`.
- Le serveur garde le CSS critique en mémoire : si tu modifies un fichier de `client/styles/base`, `components/{buttons,forms,icons}.css` ou `shell/`,
  dis-le dans ton rapport (je redémarre le serveur) ; les feuilles de pages sont relues à chaque requête.
