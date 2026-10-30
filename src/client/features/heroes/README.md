# Heroes (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `hero-pages.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `hero-actions-list.js` | The list of heroes: the filters, the view, back to the top. |
| `hero-actions-roster.js` | Keeping the roster up to date and editing a hero (administrators). |
| `hero-actions-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `hero-actions-sheet.js` | The page of a hero: its tabs, its pieces of build, its variants. |
| `hero-actions.js` | Ce qui se passe quand on clique, tape ou envoie un formulaire. |
| `hero-background-parts.js` | hero background, small helpers: load, remove, show, paintToggle. |
| `hero-background-shared.js` | Data-saver, a slow or metered link: no video. |
| `hero-background.js` | Page background: the presentation video of a hero (Camp Global), muted, dimmed, behind everything. |
| `hero-builds.js` | The recommended builds of a hero, as large framed pictures: the six main items (the core ones marked), the utility and late-game items, the battle spells and the arcana by colour, each with its name. |
| `hero-editor-parts.js` | hero editor, small helpers: newSkill, newPart, toDraft, keyOptions, and 11 more. |
| `hero-editor.js` | The hero data editor (administrators, opened from the hero sheet): the real base stats of the hero (value at level 1 and growth per level, or the option for a stat that is a choice, such as Melee o… |
| `hero-list.js` | The hero index: an entrance scene (the hero of the day on its cover art, five more heroes to open), a column of filters that stays in view, and a dense grid of tall portrait cards. |
| `hero-overview.js` | The overview tab of a hero: the blocks it is made of (skills, video, profile, build, stats, pairings, peers, patch, artwork). |
| `hero-pages.js` | The pages of the heroes: the index (/heroes) and the sheet of a hero (/heroes/<id>). |
| `hero-panels-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `hero-panels.js` | The tabs of a hero sheet: overview, skills, combos, patch history, artwork. |
| `hero-sheet-competitive.js` | The competitive tab: what the tournaments say about the hero. |
| `hero-sheet-parts.js` | Small pieces the hero index and the hero sheet share: the coloured words of a description, the names of the skills, and the one-line "nothing here yet". |
| `hero-sheet-scene.js` | The scene at the top of the page of a hero: its lanes, its numbers, its rating. |
| `hero-sheet-tabs.js` | The tabs of the page of a hero and the address that names the open one. |
| `hero-sheet.js` | The sheet of a hero: a full-width scene (the cover art, the name, the lanes with their ratings, the figures of the tournaments), the tabs under it, and one panel per tab. |
| `hero-stats-pieces.js` | The small pieces the statistics are drawn with: avatars, rings, bars, figures. |
| `hero-stats-window.js` | The window of time the statistics are about, and how it is kept. |
| `hero-stats.js` | The statistics blocks of a hero sheet: avatars instead of names, big figures, rings and small bars instead of tables. |

## Tests

- Navigateur : `node src/testing/run-e2e.mjs hero-aliases hero-editor hero-lanes hero-sheet-live heroes`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
