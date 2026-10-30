# Anatomie d'une page du navigateur

Une page du site est un dossier `src/client/features/<aire>/`. Chaque fichier a **un seul rôle**, et son nom dit lequel. Cette page-ci a été découpée la première, elle sert de modèle : la page d'une équipe, `src/client/features/teams/`.

```
team-view.js            assemble : garde l'état (onglet ouvert, équipe affichée), lit l'adresse, branche (121 lignes)
team-load.js            ce qu'on demande au serveur (agenda, Discord, séries) selon qui regarde
team-panels.js          quels onglets existent pour cette personne, et le HTML autour des onglets
team-stage.js           le haut de la page (couverture, nom, chiffres, boutons) et la page « introuvable »
team-overview-panel.js  onglet Aperçu
team-roster-panel.js    onglet Effectif
team-agenda-panel.js    onglet Agenda et son formulaire
team-series-panel.js    onglet Séries
team-admin-panels.js    onglets Discord et Réglages (staff)
team-shared.js          ce que plusieurs onglets partagent (rôles, noms de langues, message d'erreur de formulaire)
team-view.test.js       fige le HTML de la page pour trois personnes (propriétaire, joueur, visiteur)
snapshots/*.html        le HTML figé
```

## Les quatre règles

1. **Un fichier de balisage est fait de fonctions pures** : des données en entrée, du HTML en sortie, rien d'autre. Elles ne lisent ni `state`, ni l'adresse, ni le document. Ce qu'il leur faut (l'identifiant de la personne, si elle est connectée) arrive en paramètre. C'est ce qui permet de les tester sans navigateur et de les lire sans chercher d'où vient une valeur.
2. **La page assemble, elle ne dessine pas.** `team-view.js` ne contient aucun `<div>` : il charge, choisit les onglets, écrit le HTML dans la page et branche les actions.
3. **L'état tient en un seul endroit.** Ici deux variables (`tab`, `shown`) dans `createTeamView`. Quand une page a plus d'état, il va dans un objet (`ctx` ou `view`) que les fichiers voisins reçoivent en premier argument : jamais une valeur recopiée, parce qu'une copie ne voit pas les changements.
4. **Un fichier reste lisible d'un coup.** Au-delà de 400 lignes par fichier ou 120 par fonction, `src/architecture.test.js` échoue. Les exceptions sont listées dans `src/architecture-limits.json`, à leur taille exacte : elles ne peuvent que baisser.

## Quand la page a plus d'état : la vue partagée

La page d'équipe n'a que deux variables. Une page comme le catalogue ou le draft en a vingt (l'onglet ouvert, la ligne en cours d'édition, les filtres, le tri…). Elle les range dans **un seul objet, la vue** (`view`), créé dans la fonction principale de la page. Les autres fichiers du dossier ne reçoivent jamais une copie d'une valeur : ils reçoivent la vue et lisent `view.tab`, `view.editing`, etc., si bien qu'ils voient toujours la valeur du moment.

Il y a deux sortes de fichiers dans un dossier de page :

- **Les fichiers de fonctions pures** (`catalog-parts.js`, `team-roster-panel.js`…) : des données en entrée, du HTML en sortie. Ils s'importent comme n'importe quel module.
- **Les fichiers qui agissent sur la page** (`catalog-actions.js`, `catalog-paint.js`, `catalog-save.js`…) : chaque fonction prend la vue en premier argument (`export function paint(view) { … }`) et se termine par un tableau `export const onView = { paint, … }`.

La fonction principale ne fait qu'assembler :

```js
export function createCatalogPage({ api, tell }) {
  const view = { api, tell };
  bindTo(view, catalogPaint, catalogSave, catalogActions); // chaque fichier donne son tableau onView
  view.tab = "items";                                       // l'état de départ, en clair
  …
  return { show(app, state) { … } };
}
```

`bindTo` (`src/shared/bind-to.js`) accroche toutes les fonctions des tableaux à la vue : on les appelle ensuite **`view.paint()`**, sans argument, depuis n'importe quel fichier. Conséquences utiles : aucun fichier n'importe un autre fichier d'actions (donc pas de dépendance circulaire), et une fonction donnée à `addEventListener` est toujours la même, donc `removeEventListener` la retrouve.

**Pour ajouter une action à une page** : écrire `export function maFonction(view, …) { … }` dans le fichier d'actions, l'ajouter au tableau `onView` du fichier, et l'appeler par `view.maFonction()`.

## Où changer quoi

| Je veux… | Je touche… |
|---|---|
| changer ce qu'affiche un onglet | le fichier `team-<onglet>-panel.js` |
| ajouter un onglet | une fonction `…Panel(team, …)` dans un nouveau fichier, puis une ligne dans `panelsOf` (`team-panels.js`) |
| changer qui voit quel onglet | `panelsOf` (`team-panels.js`) |
| changer ce qui est demandé au serveur | `team-load.js` |
| changer le haut de la page | `team-stage.js` |

## Prouver que rien n'a changé

`node --test src/client/features/teams/team-view.test.js` compare le HTML de la page à `snapshots/`. Quand tu changes le balisage **volontairement**, relance avec `UPDATE_SNAPSHOTS=1` devant la commande, puis relis le changement dans les fichiers `snapshots/` avant de le garder.
