# Legal (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `legal-page.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `legal-page.js` | The legal pages: terms of use, privacy policy, cookies, legal notice, and the contact form. |
| `texts-en.js` | The legal texts in English: the reference of the other languages. |
| `texts-fr.js` | The legal texts in French. |
| `texts.js` |  |

## Tests

- Unitaires : `node --test src/client/features/legal`
- Navigateur : `node src/testing/run-e2e.mjs legal`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
