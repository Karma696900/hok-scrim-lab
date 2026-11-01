# Référencement : tier list publique, titres des héros, adresses par langue

Demande du propriétaire (2026-10-31) : « oui go pour A et B, fais aussi le C, option 3 (d'ailleurs
actuellement c'est moi qui l'ai fait entièrement manuellement mais le mieux serait d'utiliser aussi
de vrais stats de tournois en priorités, en prenant le pire et le meilleur pour SS et D et vraiment
faire à la main de ma part pour les héros pas encore joués par exemple), et que dcp ça se mette à
jour automatiquement en même temps que le roste ».

But : sortir dans Google sur « honor of kings tier list » (et « … jungle tier list », « <héros>
build », etc.), puis dans les autres langues du site.

## Constat (site en ligne, 2026-10-31)

- `/tier-lists` est l'outil pour faire sa propre tier list (« tier list maker ») : son HTML ne
  contient aucun classement. Les notes officielles (SS → D par voie, saisies à la main dans
  `/ratings`) ne sont publiées nulle part en liste (règle de la migration 021, levée par cette
  demande) ; seule la fiche d'un héros montre son tier.
- La langue est choisie par cookie ou par le navigateur, sur la même adresse : Google ne voit que
  l'anglais.
- Déjà bien : sitemap, robots.txt, llms.txt, canonique, titres et descriptions, rendu serveur de la
  première vue (Chromium), données structurées sur l'accueil et les fiches.

## A. La tier list publique

### Adresses

- `/tier-list` : les cinq voies sur une page ; `/tier-list/clash`, `/tier-list/jungle`,
  `/tier-list/mid`, `/tier-list/farm`, `/tier-list/roam` : une voie chacune (pour « honor of kings
  jungle tier list »).
- `/tier-lists` (l'outil) garde son adresse ; son titre devient « Tier list maker » et il renvoie
  vers `/tier-list`. La tier list publique renvoie vers l'outil (« Fais la tienne »).
- Lien depuis l'accueil et le menu ; les cinq pages entrent au sitemap.

### Le classement d'une voie

1. **Tournois d'abord.** Pour chaque héros joué dans cette voie au moins `minGames` fois sur la
   période (par défaut les 3 derniers mois, comme `/popular`), son score est le taux de victoire
   « fiable » déjà utilisé par le site (borne basse de Wilson, `confidenceOf` dans
   `tournaments/popular.js`). Le meilleur score de la voie est SS, le pire D, et les quatre tiers
   du milieu se partagent l'écart à parts égales (six bandes de même largeur entre le pire et le
   meilleur). Les parties viennent de `competitive_games` (tournois seulement, jamais les scrims) ;
   la voie est celle saisie pour le pick.
   (Score : le score bayésien pesé par la récence de la partie D, qui remplace Wilson.)
2. **À la main ensuite.** Un héros sous `minGames` dans la voie prend le tier que le propriétaire
   lui a donné dans `/ratings`. Sa note à la main d'un héros classé par les tournois est gardée en
   base mais ne compte pas.
3. **Sinon**, le héros est listé sous « Pas encore classé » (sans tier).

Chaque héros affiche : son portrait et son nom (texte, lien vers sa fiche), son tier, l'origine
(« Tournois » ou « Rédaction »), et pour les tournois le nombre de parties, le taux de victoire et
le taux de pick dans la voie. Le tri dans un tier : score décroissant, puis nom.

Réglages (avec le chiffre mesuré sur la base au moment du plan) : `minGames` = 10 par défaut ; la
période de 3 mois. **Variante possible** si les bandes égales donnent des tiers vides ou trop
chargés : six parts par rang (quantiles). Le propriétaire choisit après avoir vu le résultat.

### Mise à jour automatique

Le classement est calculé à la demande depuis la base et gardé en cache une heure ; le cache est
vidé dès qu'une série de tournoi est importée (manuellement ou par l'autostream) ou qu'une note est
enregistrée dans `/ratings`. Un nouveau héros du roster apparaît d'office (« Pas encore classé »
jusqu'à ce qu'il soit joué ou noté). La page affiche « Mis à jour le <date de la dernière partie ou
de la dernière note> » et le titre porte le mois : « Honor of Kings Tier List (November 2026) — best
heroes for every lane ».

Lecture prise : « le roste » = le reste (les imports de tournois) et le roster des héros ; les deux
déclenchent la mise à jour.

### Ce qui change ailleurs

- La fiche d'un héros montre le même tier que la tier list (même calcul), avec son origine.
- L'éditeur `/ratings` marque les héros classés par les tournois (tier calculé affiché, case
  grisée) pour que le propriétaire ne note que les autres.
- Données structurées : `ItemList` des héros par voie, fil d'Ariane, `dateModified`.

## B. Les titres et descriptions des fiches héros

- Titre : « <Héros> build, skills and counters — Honor of Kings Global », chaque mot n'étant mis
  que si la fiche le contient vraiment (build écrit par un éditeur ; adversaires venant des
  tournois). Sinon le titre actuel.
- Description : la voie, le rôle, le tier et son origine, le taux de victoire en tournoi s'il
  existe.
- Fil d'Ariane et `WebPage` déjà là ; ajout de `dateModified` (dernière mise à jour de la fiche).
- Les pages Héros, Objets, Arcanes, Sorts, Populaires gagnent leurs données structurées
  (`CollectionPage` + fil d'Ariane).

## C. Une adresse par langue

- L'anglais garde les adresses actuelles (aucune perte de ce qui est déjà indexé) ; les 14 autres
  langues ont un préfixe : `/fr/tier-list`, `/es/heroes/105`, `/ar/…`, etc.
- Le préfixe décide de la langue (avant le cookie et le navigateur). Choisir une langue dans le
  site emmène à la même page sous le bon préfixe et garde le cookie.
- Une adresse sans préfixe : un robot reçoit l'anglais ; une personne dont la langue choisie
  (cookie) ou celle du navigateur n'est pas l'anglais est renvoyée (302) vers la même page dans sa
  langue. Réponse marquée `Vary: Cookie, Accept-Language`.
- Chaque page publique annonce ses 15 versions (`hreflang`, plus `x-default` = l'anglais) et sa
  canonique dans sa langue ; `<html lang>` suit. Le sitemap liste les 15 versions de chaque page
  publique avec leurs liens de langue.
- Les liens du site gardent le préfixe de la page (`pathFor` le reçoit).
- Les pages privées (comptes, équipes, scrims…) acceptent aussi le préfixe mais restent
  `noindex` et hors sitemap.
- Les textes nouveaux (A, B) sont traduits dans les 15 langues par l'outil de traduction habituel ;
  les noms des héros suivent ceux de Camp dans chaque langue.
- Charge : le rendu serveur se fait par page et par langue (Chromium, un à la fois, en cache) ;
  Google va demander environ 15 × 140 pages. À surveiller sur le graphique CPU de Hetzner après la
  mise en ligne.

## D. Les algorithmes de popularité (héros et compositions)

Demande : « il faut aussi améliorer les algorithmes de popularités de compositions et de héros tant
que tu y es » ; choix du propriétaire : récence / patchs, présence pick + ban, score bayésien ;
pour les compos : duos et synergies, regroupement à revoir, ordre de draft.

Le même calcul sert à `/popular`, `/popular/heroes`, la tier list (A) et la fiche d'un héros.

### Héros

- **Récence.** Chaque partie pèse `0,5 ^ (âge en jours / demi-vie)`, demi-vie 30 jours par défaut :
  une partie d'il y a un mois compte moitié. Une partie jouée avant le dernier changement
  d'équilibrage du héros (historique de patch de sa fiche) compte encore moitié moins, pour ce
  héros seulement. Les parties « pesées » remplacent les parties brutes dans les scores ; le
  nombre brut reste affiché.
- **Score bayésien.** Taux de victoire tiré vers la moyenne de la voie selon le poids des parties :
  `(victoires + k × moyenne) / (parties + k)`, k = 10 par défaut. Remplace la borne de Wilson, trop
  sévère avec peu de parties. Sert au tri « meilleur taux de victoire » et à la tier list.
- **Présence.** Taux de pick (dans la voie), taux de ban, présence = pick + ban sur toutes les
  parties de la période. Nouveau tri « les plus présents » ; les bans comptent même quand la voie
  du héros n'est pas connue (un ban n'a pas de voie : il compte dans la présence de chaque voie
  du héros).

### Compositions

- **Duos.** Nouveau tableau : les meilleures paires d'un même camp (toutes voies, avec un filtre
  par paire de voies, ex. Jungle + Roam), même score bayésien pesé par la récence, au moins
  `minGames` parties.
- **Regroupement.** Deux compos se ressemblent par **voie** : même héros dans la même voie (quand
  les voies sont saisies ; sinon par héros comme aujourd'hui). Un groupe = au moins 3 voies
  identiques au meneur ; le meneur est la compo du groupe au meilleur score pesé (et non plus la
  plus jouée seulement) ; un groupe n'est montré qu'avec au moins `minGames` parties.
- **Ordre de draft.** Pour chaque compo et chaque héros : la phase où il est pris le plus souvent
  (1er pick, 2e–3e, 4e–5e, dernier pick) et s'il est pris en réponse à un héros adverse (contre-pick
  fréquent : le héros adverse pris juste avant lui). Affiché sur la carte de la compo et sur la
  fiche du héros.

### Réglages

Demi-vie (30 j), k (10), `minGames` (10) : `guess`, mesurés sur la base au moment du plan et
listés pour validation, avec un avant / après des classements actuels.

## E. Chaque fonctionnalité visée par ses recherches

Demande : « il n'y a pas que ça comme recherche possible ça peut par exemple être hok training, ou
des recherches comme hok items, hok arcanas, etc vraiment nos features, ça peut même être hok
scrims ».

Constat en ligne : `/training` s'appelle seulement « Training » et sa description parle du carnet
personnel ; `/training` et `/scrims` sont indexables mais absents du sitemap ; aucun titre ne
contient « HOK », la forme que les joueurs tapent ; la page Objets n'a que ~740 mots dans son HTML
(à vérifier : chaque objet doit y être en texte).

Règles pour chaque page publique :
- le titre contient « HOK » et « Honor of Kings » et le nom de la fonction tel qu'on le cherche ;
- un `h1` avec ce nom et 2 à 3 phrases d'introduction visibles par tous, dans le HTML envoyé ;
- tout ce que la page liste (objets, arcanes, sorts, héros) est en texte dans le HTML envoyé ;
- l'entrée au sitemap et les données structurées (`CollectionPage` ou `WebApplication` pour les
  outils, fil d'Ariane) ;
- les liens entre pages proches (objets ↔ build lab ↔ fiches des héros ; tier list ↔ populaires ;
  scrims ↔ draft en direct).

Titres visés (anglais ; traduits en C) :

| Page | Recherches visées | Titre |
|---|---|---|
| `/` | hok scrim lab, hok draft | HOK Global Scrim Lab — Honor of Kings draft simulator, scrims, tier list |
| `/tier-list` | hok tier list | HOK Tier List (<mois année>) — best Honor of Kings heroes per lane |
| `/heroes` | hok heroes | HOK heroes — every Honor of Kings hero, skills, builds and lanes |
| `/items` | hok items | HOK items — every Honor of Kings item with stats and price |
| `/arcana` | hok arcana, hok arcanas | HOK arcana — every Honor of Kings arcana, red, blue and green |
| `/spells` | hok spells | HOK spells — Honor of Kings summoner spells and cooldowns |
| `/build-lab` | hok build, hok build calculator | HOK build calculator — test Honor of Kings builds and stats |
| `/popular` | hok meta, hok pro drafts | HOK meta — most played and best Honor of Kings tournament drafts |
| `/scrims` | hok scrims, hok draft simulator | HOK scrims — Honor of Kings draft simulator with ban and pick |
| `/training` | hok training | HOK training — Honor of Kings combos, reflexes and map situations |
| `/tier-lists` | hok tier list maker | HOK tier list maker — make your Honor of Kings tier list |

`/training` pour un visiteur devient une page d'accueil de l'entraînement (ce qu'on y fait :
combos, réflexes, situations de carte), le carnet restant pour la personne connectée. Le nom
exact de chaque titre est relu par le propriétaire au moment du plan.

Proposé, à confirmer : une page par objet (`/items/<id>`), par arcane et par sort, pour les
recherches « hok <nom de l'objet> » (beaucoup de petites recherches, chacune facile à gagner).
La future page `/simulation` suivra les mêmes règles quand elle existera.

## Hors code (côté propriétaire)

Google Search Console : ajouter le domaine, envoyer `/sitemap.xml`, demander l'indexation de
`/tier-list`. Liens entrants : Reddit r/HonorOfKings, Discord, profils de l'équipe.

## Tests

- Calcul du classement : bandes SS → D entre le pire et le meilleur, seuil `minGames`, priorité
  tournois, repli sur la note à la main, « Pas encore classé », même ordre à chaque appel.
- Popularité : poids de récence, malus avant le dernier patch du héros, score bayésien, présence
  pick + ban, duos, regroupement par voie, phases de pick et contre-picks ; mêmes résultats à
  chaque appel.
- Cache vidé à l'import d'une série et à l'enregistrement d'une note.
- Rendu serveur de `/tier-list` : les noms des héros et les tiers sont dans le HTML envoyé ;
  titre avec le mois ; données structurées valides.
- Langues : `/fr/…` rend en français, `hreflang` complets et réciproques, canonique par langue,
  redirection 302 seulement pour une personne, jamais pour un robot sans cookie ni langue ;
  sitemap avec les 15 versions ; liens internes qui gardent le préfixe.
- e2e : la tier list, le changement de langue, l'éditeur `/ratings` avec les héros grisés.
- Chaque page publique : titre avec « HOK », `h1`, introduction et éléments listés présents dans
  le HTML envoyé (test sur le rendu serveur) ; sitemap complet.
- Lighthouse SEO 100 sur `/tier-list` et `/fr/tier-list`.

## Ordre de travail

1. D (le calcul commun) ; 2. A (la page, la fiche du héros, l'éditeur) ; 3. B et E ; 4. C. Chaque
partie se publie seule.
