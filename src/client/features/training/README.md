# Training (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `training-pages.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `heroes-actions.js` | What happens when a person clicks, ticks or types on the page. |
| `heroes-cards.js` | The cards of the heroes one works on, and the suggestions when there are none. |
| `heroes-pick.js` | The roster to choose from: the tiles, the lanes, saving the heroes one works on. |
| `heroes-today.js` | What to do today: the heroes the teams ask for, the combos to check and to learn. |
| `heroes-workspace.js` | The workspace of the hero that is open: skills, combos acquired in two forms, base stats. |
| `heroes.js` | Training, the heroes: a cockpit of three panes. |
| `map.js` | The map of a situation: the picture an administrator uploaded and the pins placed on it. |
| `notebook-actions.js` | notebook, what happens on a click, a key or a submit: onClick, onChange, onSubmit. |
| `notebook-notes.js` | notebook, note: comboStrip, noteCard, listHtml. |
| `notebook-paint.js` | notebook, page: place, paintList, paintSide, paintAll, and 3 more. |
| `notebook-parts.js` | notebook, small helpers: blank, requestBody, marksProblem, heroList, and 3 more. |
| `notebook-show.js` | notebook, small helpers: show. |
| `notebook.js` | Training, the notebook: what a player wants to practise (goals, mechanics, combos drawn with the pictures of the skills) and the videos they review (a link and the moments to look at again). |
| `reflex/art.js` | A small picture for each reflex exercise (160 x 90, drawn by hand, no external file): the tile of the list, the page of the exercise and the preview a visitor sees all use them. |
| `reflex/exercises/aim.js` | Aim: a target appears, hit it, and the next one appears somewhere else. |
| `reflex/exercises/chimp.js` | The chimp test: numbers are scattered on a board. |
| `reflex/exercises/discern.js` | Friend or foe: units appear one at a time. |
| `reflex/exercises/frame.js` | What every exercise needs to run and to be stopped cleanly: its listeners and its timers go away together, and nothing it started goes on once it has been stopped. |
| `reflex/exercises/inputs.js` | Skill keys: four skills to press in the order shown, as fast as you can, with the keys 1 to 4 (or by touch). |
| `reflex/exercises/lasthit.js` | Last hit: a minion's life bar runs down and there is a notch on it. |
| `reflex/exercises/reaction.js` | Reaction time: the pad is red; |
| `reflex/exercises/sequence.js` | Sequence memory: pads light up one after the other, then you repeat the order. |
| `reflex/exercises/tracking-parts.js` | tracking, small helpers: bounds, draw, move, round, and 2 more. |
| `reflex/exercises/tracking.js` | Tracking: some of the balls light up, then every ball looks the same and they all move. |
| `reflex/hud.js` | The bar above an exercise while it runs: how far along the run is (a thin bar), what is being played (round, target, level) and what is left (lives, strikes). |
| `reflex/logic.js` | The plain calculation of the reflex exercises: the boards, the sequences, the movement of the balls and how a result is averaged. |
| `reflex/ranking-parts.js` | ranking, small helpers: visibleTeams, options, fillBody, fill. |
| `reflex/ranking.js` | The ranking of the teams of a player, on the page of the reflex exercises: shown when the staff of a team opened it to its players (or when the player is staff). |
| `reflex/reflex-exercise.js` | One exercise: its intro, the run, the result, the save. |
| `reflex/reflex-intro.js` | The screen before a run: how it is played, how it is scored, the best score and the trend. |
| `reflex/reflex-list.js` | The list of exercises. |
| `reflex/reflex-page.js` | Training, the reflex exercises: short games for reflexes, memory and aim. |
| `reflex/reflex-parts.js` | Pieces of the reflex pages: the score, the goals of the teams, an exercise card, the trend. |
| `reflex/reflex-routines.js` | Routines: several exercises, one after the other, and their summary. |
| `reflex/reflex-run.js` | A run: its start, its end, the result screen and the save. |
| `reflex/reflex-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `scenario-editor-actions.js` | scenario editor, what happens on a click, a key or a submit: onClick, onChange, onInput, onPointerdown, and 2 more. |
| `scenario-editor-cards.js` | scenario editor, drawn: toolButton, toolCard, pinRow, pinsCard, and 8 more. |
| `scenario-editor-parts.js` | scenario editor, small helpers: draftOf, mapOf, heroOptions, isTool. |
| `scenario-editor-show.js` | scenario editor, small helpers: show. |
| `scenario-editor.js` | Training, the editor of a situation (administrators): click the map to place the chosen tool, drag a pin to move it, arrow keys to nudge it, then give the situation a title and publish it. |
| `scenarios-parts.js` | scenarios, small helpers: legend, colours, keysCard, mapsAdmin, and 2 more. |
| `scenarios.js` | Training, the situations: the list of the ones the administrators prepared, a situation on its map (who is where, dead or alive) with the player's answer beside it, and the maps themselves. |
| `showcase.js` | The pieces that fill a page of the area when the person has nothing of their own on it yet (or is not signed in): the hero of the day on its cover, the three steps of the training, the kinds of notes. |
| `training-pages-parts.js` | training pages, small helpers: heroOf, heroName, portrait, sheetOf, and 9 more. |
| `training-pages-shared.js` | The hero whose cover opens each zone, when the person has none of their own to show there. |
| `training-pages.js` | Training: four zones under one stage. |
| `training-shared.js` | What the training pages have in common: the values of the notebook and of the map, the words for them, and what every page of the area wears at its top: the stage (the cover of a hero, the title an… |

## Tests

- Unitaires : `node --test src/client/features/training`
- Navigateur : `node src/testing/run-e2e.mjs reflex training-extras training`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
