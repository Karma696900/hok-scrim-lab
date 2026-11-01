# Popular (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `popular-page.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `popular-page-actions.js` | popular page, what happens on a click, a key or a submit: onClick, onChange. |
| `popular-page-extras.js` | The pick, ban and presence rates of a hero, the pick phases of a draft and the best duos. |
| `popular-page-markup.js` | popular page, markup: face, portrait, metList, versus, and 10 more. |
| `popular-page-parts.js` | popular page, small helpers: heroOf, nameOf, day, ruleLabel, and 2 more. |
| `popular-page-stage.js` | popular page, stage: leadHero, podium, figures, aside, and 1 more. |
| `popular-page.js` | The popularity pages: the drafts and the heroes that win most and that are played most in the tournament games (never the scrims), over a period of at least three months that cannot start before th… |

## Tests

- Navigateur : `node src/testing/run-e2e.mjs popular`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
