# Draft (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `draft-view.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `draft-clock.js` | The clock of the draft: the time of the game and the turn, ticking once a second. |
| `draft-editor-parts.js` | draft editor, small helpers: used, rows, ensureDialog, clone, and 4 more. |
| `draft-editor.js` | Dialog to correct the bans and picks of a game (a mistake noticed after the draft). |
| `draft-patch.js` | Changing the board in place: only what differs from what is shown is written. |
| `draft-pool.js` | The pool of heroes: its cards and the filter by lane, role and search. |
| `draft-room-markup.js` | The room: a side with its bans and picks, the pool, the action bar, the result and the log. |
| `draft-slots.js` | The slots of the bans and picks: the hero in a slot and its cover. |
| `draft-update.js` | Bringing the board up to date with the draft (each poll and each tick). |
| `draft-view-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `draft-view.js` | Draft board. Built once per game, then patched in place: a pick, a tick of the clock or a poll only touches the slots / text that changed (no innerHTML of the w |

## Tests

- Navigateur : `node src/testing/run-e2e.mjs draft-settle draft edit-draft`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
