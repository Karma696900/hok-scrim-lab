# Auth (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `auth-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `account-store-create-challenge.js` | account store, create challenge: createChallenge, getChallenge, bumpChallengeAttempts, setChallengeSecret, and 5 more. |
| `account-store-create-local-user.js` | account store, create local user: createLocalUser, getProfile, completeProfile, updateName, and 12 more. |
| `account-store.js` | Les requêtes à la base de données. |
| `auth-routes-auth-profile.js` | auth routes, auth profile: registerAuthProfileRoutes. |
| `auth-routes-auth.js` | auth routes, auth: registerAuthRoutes. |
| `auth-routes-parts.js` | auth routes, small helpers: needUser. |
| `auth-routes-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `auth-routes.js` | Les adresses de l'API et leurs réponses. |
| `auth-service-account.js` | What a signed-in person does with their own account: pseudo, photo, password, recovery codes, a copy of their data, erasure. |
| `auth-service-enrol-start.js` | auth service, enrol start: enrolStart, enrolConfirm, verifySecondFactor, requireFreshCode, and 4 more. |
| `auth-service-seed.js` | auth service, seed: seed, unseed, event, openChallenge, and 11 more. |
| `auth-service-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `auth-service.js` | Un service qui travaille en arrière-plan. |
| `data-rights.js` | The rights of a person over their data (GDPR): a copy of everything the site holds about them, and the erasure of their account. |
| `google.js` |  |
| `session-store-parts.js` | session store, small helpers: upsertGoogleUser, createGuestUser, getUserByEmail, getSession, and 7 more. |
| `session-store.js` | Les requêtes à la base de données. |
| `session-view.js` |  |

## Tests

- Unitaires : `node --test src/server/features/auth`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
