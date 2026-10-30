# Auth (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `auth-pages.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `auth-actions.js` | Ce qui se passe quand on clique, tape ou envoie un formulaire. |
| `auth-avatar.js` |  |
| `auth-pages-actions.js` | auth pages, what happens on a click, a key or a submit: onSubmit, onClick. |
| `auth-pages-parts.js` | auth pages, small helpers: nextPath, nextQuery, stepPath, loadFor, and 3 more. |
| `auth-pages.js` | Account pages: sign in, create account, authenticator code, enrolment (QR + recovery codes), the pseudo of a person who came with Google, account security. |
| `auth-security-parts.js` | auth security, small helpers: stageHero, pill, head, block, and 9 more. |
| `auth-security.js` | The security of the account (/account), in the site like any page: a stage with the three things to know (is the authenticator on, how many recovery codes are left, when did the last sign-in happen… |
| `entry-parts.js` | entry, small helpers: frame, googleButton, tabs, switchLine, and 7 more. |
| `entry.js` | The way in: sign in, create an account, the code of the authenticator, the authenticator to set up (QR, then the recovery codes), the pseudo of a person who came with Google. |
| `forms.js` | The pieces the account pages are made of: a labelled field (label above, icon inside, hint under), the field of a 6-digit code, the line that shows what went wrong, the strength of a new password, … |
| `profile-parts.js` | profile, small helpers: sendJson, apply, paint, build. |
| `profile.js` | The profile dialog (click on the avatar in the header): pseudo, photo, and the player's tag. |

## Tests

- Navigateur : `node src/testing/run-e2e.mjs auth`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
