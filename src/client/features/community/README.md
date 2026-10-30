# Community (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `community-pages.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `agenda-actions.js` | What the buttons and the forms of the agenda do. |
| `agenda-paint.js` | Loading the events and writing the agenda into the page. |
| `agenda-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `agenda-side.js` | The side of the agenda: the next events, the day that is open, the form of an event. |
| `agenda-views.js` | The three views of the calendar: month, week and list. |
| `agenda.js` | The agenda. Wireframe: 1. the stage: a cover, the title, three numbers (events in the next 7 days, events to answer, teams); 2. the calendar on the left: the we |
| `community-pages-actions.js` | community pages, what happens on a click, a key or a submit: actionsOf, formsOf, onClick, onSubmit. |
| `community-pages-parts.js` | community pages, small helpers: signedIn, loadMyTeams, contextOf, findOf, and 7 more. |
| `community-pages.js` | Community pages: Find a scrim, the Inbox (scrim requests and notifications), the Agenda, a player's page, the reports of the administrators and Discord & onboarding. |
| `community-shared.js` | What the community pages have in common: the values a form offers, the words for them and the way times are written. |
| `discord-actions.js` | discord, what happens on a click, a key or a submit: actionsOf. |
| `discord-parts.js` | discord, small helpers: prefLabel, notice, prefsList, linkCard, and 3 more. |
| `discord-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `discord.js` | Discord & onboarding. Wireframe: 1. the stage: a cover, the title, the link to Discord, three numbers (steps done, messages on, team servers); 2. on the left th |
| `find-actions.js` | What the buttons and the forms of the page do. |
| `find-forms.js` | The two forms: asking a team for a scrim, and publishing an announcement. |
| `find-list.js` | The list of announcements. |
| `find-side.js` | The side: the announcements and the requests of the person, the directory. |
| `find.js` | Find a scrim. Wireframe: 1. the stage: a cover, the title (64 px), three numbers (open announcements, teams, regions), the main action; 2. three columns: the fi |
| `inbox-actions.js` | What the buttons and the forms of the inbox do. |
| `inbox-lists.js` | The filters on the left and the list in the middle. |
| `inbox-parts.js` | Small pieces of the inbox: the rows of the three lists and their counts. |
| `inbox-thread.js` | A conversation: its messages, the answers, the strip with the facts of the request. |
| `inbox.js` | The inbox. Wireframe: 1. a slim stage (cover, title, three numbers: waiting for you, open requests, unread); 2. three panes that fill the height of the screen:  |
| `labels.js` |  |
| `notifications.js` |  |
| `player-actions.js` | player, what happens on a click, a key or a submit: actionsOf, formsOf. |
| `player-page.js` | player, page: notFound, show. |
| `player-parts.js` | player, small helpers: hero, heroName, languageName, profileForm. |
| `player-pieces-page.js` | player, pieces page: heroCard, laneOf, heroesBlock, aboutBlock, and 5 more. |
| `player.js` | A player's page. Wireframe: 1. the stage: the cover of the main hero of the player (or of a hero of the day), the avatar, the name (64 px), the tag, the labels  |
| `reports-actions.js` | reports, what happens on a click, a key or a submit: actionsOf. |
| `reports-parts.js` | reports, small helpers: bubble, teamsOf, people, row, and 3 more. |
| `reports.js` | Reports (administrators). |
| `stage.js` | What the pages of the community (teams, agenda, inbox, find a scrim, players, Discord, reports) have in common: the stage that opens them (the 16:9 cover of a hero under a dark veil, the title, the… |

## Tests

- Navigateur : `node src/testing/run-e2e.mjs community`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
