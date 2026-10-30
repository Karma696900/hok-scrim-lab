# Les lots de refonte à venir : compositions imposées (à coller dans la mission de chaque agent)

Chaque agent lit d'abord `.impeccable/PAGE-BRIEF.md` (tout, y compris « RETOUR DU PROPRIÉTAIRE » et « DONNÉES DE DÉMONSTRATION »)
et `design/DESIGN.md`. Les compositions ci-dessous sont des MINIMUMS (jamais plus pâle), accent BLEU seul, aucun vide, art réel.

## Lot 4 : la communauté (équipes, agenda, boîte de réception, trouver un scrim, joueurs, Discord, signalements)

Fichiers : `client/features/teams/**`, `client/features/community/**` (agenda, find, inbox, player, reports, discord, labels, notifications, shared),
feuilles `teams.css`, `team.css`, `agenda.css`, `find.css`, `inbox.css`, `player.css`, `discord.css`, `admin.css` (+ `components/goals.css` pour les objectifs).

- **/teams** : scène (titre 64 px, trois gros chiffres : équipes / membres / annonces ouvertes, bouton « Créer une équipe »), colonne de filtres à gauche
  (recherche, niveau, région, « Mes équipes »), grille de cartes-bannières (emblème grand, nom, tag, niveau, région, voies du roster en icônes, nombre de
  membres, rôle de la personne) ; en tête, « Mes équipes » en grandes cartes avec le prochain événement et le bilan des séries partagées ; sous la grille :
  « Comment fonctionne une équipe » en 3 étapes et les annonces de scrim récentes. Jamais de bas de page vide.
- **/teams/:id** : scène avec l'emblème et la couleur de l'équipe, nom 64 px, tag, niveau, région, effectif, actions (inviter, quitter, paramètres) ; onglets
  (Aperçu, Effectif, Agenda, Séries, Entraînement, Discord, Réglages) ; Effectif = cartes de joueurs verticales (avatar, pseudo, rôle, voie en icône) ;
  **Séries** = les séries partagées avec l'équipe (`GET /api/teams/:id/series`, vue `summary`) avec le bilan et le bouton pour partager une série de plus
  (le créateur qui dirige l'équipe : liste de ses séries via `/api/series`, `PUT /api/series/:id/teams/:teamId`) ; invitations en attente pour les responsables.
- **/agenda** : calendrier à la semaine (colonnes de jours, créneaux horaires, événements colorés par type, aujourd'hui marqué) occupant la largeur ; à droite
  un panneau « À venir » (RSVP en un clic) et le formulaire d'ajout d'événement ; bascule mois/semaine/liste ; filtre d'équipe ; export du calendrier.
- **/inbox** : trois zones (filtres : Tout, Demandes, Notifications, Invitations ; liste ; détail/conversation) qui remplissent la hauteur de l'écran ;
  accepter/refuser une demande de scrim sans quitter la page ; état vide en une ligne.
- **/find** : scène, filtres à gauche (format, règle des héros, contrôle, fenêtre horaire, niveau), cartes d'annonces (emblème, équipe, créneau, format,
  règle, note, bouton « Demander ») et le panneau « Publier votre annonce » ; mes demandes en cours.
- **/players/:tag** : scène (avatar grand, pseudo, tag, étiquettes, équipes), puis héros les plus joués (portraits), voies, séries récentes, objectifs.
- **/discord** : étapes de liaison illustrées, préférences de messages en interrupteurs, serveur de l'équipe ; **/reports** (admin) : tableau avec panneau latéral.

## Lot 5 : le contenu du staff (catalogue, tournois, guides, évaluations officielles)

Fichiers : `client/features/catalog/**`, `client/features/tournaments/**`, `client/features/guides/**`, `client/features/ratings/**`,
feuilles `catalog.css`, `tournaments.css`, `guides.css`, `ratings.css`, `hero-editor.css` si ce n'est pas déjà fait par le lot héros.

- **/catalog** (admin) : navigation à gauche (Objets, Arcanes, Sorts, Stats, Étiquettes, Étiquettes de héros, Traductions), au centre un TABLEAU (tri, filtres,
  colonnes, miniatures), à droite un PANNEAU d'édition non modal (aperçu de l'icône, champs en une colonne, statistiques en lignes ajoutables, effets), actions groupées ;
  import d'images et de lots (« Classer en lot »). Aucune fenêtre modale pour éditer une ligne.
- **/tournaments** (admin) : liste (filtre, pagination, bilan par événement) + éditeur de série à deux panneaux (en-tête de série à gauche, parties à droite avec
  choix des héros par portrait et glisser des voies) ; statistiques de la base compétitive en tête.
- **/guides** (éditeur) : liste des héros à gauche (avec avancement : builds, combos), éditeur à droite avec onglets (Builds, Combos, Notes) ; les combos gardent le
  pas « Attaque de base » (`data-cb-add="basic"`) ; aperçu du build en direct.
- **/ratings** (éditeur) : un tableau de rangs SS à D par voie, glisser-déposer, réserve de héros, version et historique.

## Lot 6 : le compte, l'entrée, l'entraînement

Fichiers : `client/features/settings/**` (la section « Clés d'API » existe : `api-keys.js`, la garder et la loger dans la nouvelle mise en page), `client/features/auth/**`,
`client/features/training/**` (dont `reflex/**`), `client/features/space/**`, feuilles `settings.css`, `account.css`, `auth.css`, `welcome.css`, `space.css`, `training.css`,
`reflex.css`, `not-found.css`.

- **/settings** : navigation à gauche (sections), une section par bloc (modules, nouvelle série, interface, notifications, compte, **API**), enregistrement explicite ;
  prévisualisation en direct du thème et de la langue ; la section API (création de clé, secret affiché une fois, liste) bien mise en valeur avec l'exemple `curl`.
- **/account** (sécurité) : mot de passe, authentificateur (MFA) avec QR et codes de secours, séances ouvertes, en blocs clairs avec états (activé/désactivé).
- **/login, /register, /login/mfa, /login/setup, /login/profile** : une page d'entrée en deux colonnes (art du héros du jour à gauche, formulaire à droite), formulaires
  en une colonne, erreurs en ligne, étapes visibles pour l'inscription ; **/welcome** (accueil guidé) : étapes illustrées pour choisir les modules.
- **/training** : scène + entrées (Héros que je travaille, Carnet, Situations, Réflexes) avec progression ; Héros = cartes avec objectifs et combos à réviser ; Carnet = liste
  et éditeur à deux panneaux ; Situations = carte à gauche, détail à droite ; Réflexes = jeux en grandes tuiles avec meilleur score.
- **/space** (espace perso), **404** (une vraie page : art, recherche, liens utiles).

## Après les trois lots

1. Une passe de **cohérence** (même scène, mêmes espacements, mêmes états sur toutes les pages) et la **suppression** du CSS et du JS devenus inutiles (`knip`).
2. Les audits : sécurité (OWASP : authentification, sessions, CSRF, CSP, injections, XSS dans le HTML construit à la main, SSRF du proxy d'images, limites de débit,
   permissions par route), optimisation (requêtes SQL et index, N+1, taille des réponses, caches, poids du bundle, Lighthouse 100), qualité du code (noms, doublons, commentaires).
3. La chaîne complète : `npm test`, `npm run test:e2e`, `npm run lint`, `npm run format:check`, `npm run build`, Lighthouse sur les pages refaites.
