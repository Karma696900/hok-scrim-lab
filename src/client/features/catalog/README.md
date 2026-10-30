# Catalog (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `catalog-page.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `catalog-actions.js` | What happens when a person acts on the page: clicks, typing, keys, dropped pictures. |
| `catalog-draft-body.js` | Turning a draft into the body of the request, and an entry into a draft. |
| `catalog-draft-read.js` | Reading the form of an entry into a draft, and saying what is missing from it. |
| `catalog-drafts.js` | What is typed in the form of the Catalog page, and what the API takes: the form read back as a draft (what was typed is never lost when a row is added), the draft as the body of a request, and an e… |
| `catalog-empty-drafts.js` | What a new entry of each section starts with: the name empty, the category and the colour of the filter in use. |
| `catalog-form.js` | The form of an entry (item, arcana, spell, stat, tag): its rows. |
| `catalog-list.js` | What the table of a section shows: its filters, its columns, its order. |
| `catalog-markup.js` | The markup of the page: stage, rail, filters, table, side panel. |
| `catalog-page.js` | The Catalog page (administrators): the stats of the game, the tags, the items, the arcana and the spells, entered by hand with their pictures. |
| `catalog-paint.js` | Writing the page into the document. |
| `catalog-parts.js` | Small pieces of markup that the lists and the forms of the catalog share. |
| `catalog-save.js` | Reading the catalog from the server, saving an entry, choosing its picture. |
| `catalog-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `catalog-sorting.js` | Sorting many items at once (the tick boxes of the table). |
| `conditions-editor-buttons.js` | conditions editor, buttons: setAt, press, summary. |
| `conditions-editor-draft-api.js` | conditions editor, draft api: nodeFromApi, fromApi, nodeToApi, toApi, and 4 more. |
| `conditions-editor-form-fields.js` | conditions editor, form fields: select, matchSelect, isSelect, fields, and 5 more. |
| `conditions-editor-parts.js` | conditions editor, small helpers: heroName, roles, statOf. |
| `conditions-editor-reading-fields.js` | conditions editor, reading fields: readNode, readSet, read. |
| `conditions-editor-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `conditions-editor.js` | The editor of the conditions of a value or of an effect (Catalog page, administrators). |
| `translations-actions.js` | translations, what happens on a click, a key or a submit: onClick, onChange, onInput. |
| `translations-loading-polling.js` | translations, loading polling: load, poll, stop. |
| `translations-markup.js` | translations, markup: quotaMarkup, languagesMarkup, statusCard, row, and 3 more. |
| `translations-parts.js` | translations, small helpers: loadStatus, loadList, run, textOf, and 1 more. |
| `translations-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `translations.js` | The Translations section of the Catalog (administrators): what the staff writes is translated by itself into every language of the site; |

## Tests

- Navigateur : `node src/testing/run-e2e.mjs catalog item-categories stat-conditions translations`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
