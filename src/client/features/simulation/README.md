# Simulation (navigateur)

Ce dossier est la page `/simulation` (« Game Simulation », menu Jouer), côté navigateur. Le fichier d'entrée est `simulation-page.js`. La partie ne tourne pas dans le navigateur : elle tourne sur le serveur de bots (`bots.hok-scrim-lab.com`, dépôt privé `hok-bots`). Au clic sur Start, la page demande au site un ticket (60 s, à usage unique, compte requis), ouvre le WebSocket du serveur de bots avec ce ticket, dessine le plateau à partir du premier message, puis peint les images reçues (seulement ce que le camp du joueur voit) et renvoie ses ordres. À la fin, le serveur de bots remet la partie au site, qui la garde dans l'historique. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `simulation-page.js` | La page : l'objet de vue et `show(app)`. |
| `simulation-actions.js` | Ce qui se passe au clic : choix du camp, du rôle, de la difficulté, des héros, Start, fin de partie. |
| `simulation-setup.js` | Le balisage de l'écran de réglage (titre, introduction, choix) et de l'historique. |
| `simulation-load.js` | Ce qu'il faut avant une partie : les héros que jouent les bots, l'historique, le ticket et l'image de la carte. |
| `simulation-run.js` | Une partie en cours : la couche plein écran, le WebSocket (messages start, frame, end), les ordres du joueur. |
| `simulation-board.js` | Le balisage du plateau : alliés en haut, carte, panneau (or des deux équipes, héros, sort, calls). |
| `simulation-map.js` | La carte vectorielle envoyée par le serveur de bots, tournée d'un demi-tour pour le camp rouge, et le brouillard. |
| `simulation-paint.js` | Chaque image : pastilles, barres de vie, brouillard, icônes de compétences (1/3 s), boîtes. |
| `simulation-popups.js` | Les boîtes : décision (4 choix + rester), question surprise, pause, mort, note finale. |
| `simulation-shared.js` | Voies, difficultés, noms et portraits, crochets de test de l'adresse (`?limit=`, `?debug=map`). |

## Tests

- Balisage : `node --test src/client/features/simulation/simulation-markup.test.js`
- Navigateur : `node src/testing/run-e2e.mjs simulation` (un faux serveur de bots, `src/testing/fake-bots-server.js`, joue une courte partie scriptée avec les mêmes messages)
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
