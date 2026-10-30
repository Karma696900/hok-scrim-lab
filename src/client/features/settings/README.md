# Settings (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `settings-page.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `onboarding-actions.js` | onboarding, what happens on a click, a key or a submit: onClick, onChange. |
| `onboarding-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `onboarding-show.js` | onboarding, small helpers: show. |
| `onboarding-steps.js` | onboarding, small helpers: save, faces, body, paint, and 1 more. |
| `onboarding.js` | Welcome pages: what the site is (and the language), which optional parts the person wants in their menu (the community is always on), what the community is, and where to start. |
| `parts.js` | The optional parts of the site and what each one puts in the menu. |
| `settings-actions.js` | settings page, what happens on a click, a key or a submit: onClick, onClickHandler, onSubmit. |
| `settings-api-keys-parts.js` | settings api keys, small helpers: scopeBoxes, secretBox, doc, list, and 3 more. |
| `settings-api-keys.js` | The API keys of the signed-in person (a section of Settings): make a key, copy it (it is shown once), see what each key did last, revoke it. |
| `settings-form.js` | settings page, pieces page: sectionsOf, read, setFigure, figure, and 4 more. |
| `settings-labels.js` | settings page, small helpers: modeLabel, modeText, controlLabel, controlText, and 1 more. |
| `settings-page.js` | Settings (opened from the account menu): the parts of the site in the menu (the community is always on), the defaults of a new series, the language, the theme, the reading direction, the start page… |
| `settings-pieces.js` | settings page, pieces page: card, choices, group, segment, and 3 more. |

## Tests

- Navigateur : `node src/testing/run-e2e.mjs api-keys onboarding`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
