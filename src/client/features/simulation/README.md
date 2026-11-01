# Simulation (navigateur)

Ce dossier est la page `/simulation` (« Game Simulation », menu Jouer), côté navigateur. Le fichier d'entrée est `simulation-page.js`. La partie ne tourne pas dans le navigateur : elle tourne sur le serveur de bots (`bots.hok-scrim-lab.com`, dépôt privé `hok-bots`). Au clic sur Start, la page demande au site un ticket (60 s, à usage unique, compte requis), ouvre le WebSocket du serveur de bots avec ce ticket, dessine le plateau à partir du premier message, puis peint les images reçues (seulement ce que le camp du joueur voit) et renvoie ses ordres (`move` pour le joystick, `target` pour l'attaque, pause, calls, sort). À la fin, le serveur de bots remet la partie au site, qui la garde dans l'historique. Le mode spectateur (« Watch ten bots ») ouvre le même WebSocket avec un ticket `mode: "watch"` : dix bots jouent, le joueur change la vitesse (Pause, x1 à x16) et la vue (tout sans brouillard, ou ce que voit une équipe) en direct ; la fin nomme le vainqueur, sans note et sans rien garder. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `simulation-page.js` | La page : l'objet de vue et `show(app)`. |
| `simulation-actions.js` | Ce qui se passe au clic : choix du camp, du rôle, de la difficulté, des héros, Start, fin de partie. |
| `simulation-setup.js` | Le balisage de l'écran de réglage (titre, introduction, choix) et de l'historique. |
| `simulation-load.js` | Ce qu'il faut avant une partie : les héros que jouent les bots, l'historique, le ticket et l'image de la carte. |
| `simulation-run.js` | Une partie en cours : la couche plein écran, le WebSocket (messages start, frame, end), les ordres du joueur. |
| `simulation-board.js` | Le balisage de l'écran de jeu, comme dans le jeu : le terrain plein écran sous une caméra, en haut à gauche la mini-carte et les cartes du héros et des alliés, en haut à droite horloge, score, K/D/A, tableau des scores (☰) et pause (⚙) avec l'or des deux équipes, les calls sur le bord droit, le joystick et l'attaque en bas. Ni compétences ni boutique. |
| `simulation-hud.js` | L'affichage par-dessus le terrain : mini-carte (brouillard, tours debout, héros vus, cadre de la caméra), cartes des héros (niveau, vie découpée tous les 1000 PV, mana, ultime prêt, réapparition), score et K/D/A, tableau des scores avec les objets (images du catalogue). |
| `simulation-camera.js` | La caméra qui suit le héros du joueur, arrêtée aux bords de la carte, et le cadre qu'elle dessine sur la mini-carte. |
| `simulation-controls.js` | Les mains du joueur : joystick en bas à gauche (doigt, souris, W A S D ou Z Q S D, flèches), en bas à droite l'attaque (Espace, l'ennemi à portée le moins en vie), sbires et monstres (E), tours (R), portraits des ennemis en vue (1 à 5). Le stick part au serveur de bots au plus 10 fois par seconde ; les compétences sont lancées par l'IA. |
| `simulation-motion.js` | Le mouvement fluide : les pastilles glissent entre deux images (10 par seconde), le héros du joueur avance tout de suite avec son stick (prédiction recalée sur le serveur). |
| `simulation-map.js` | La carte vectorielle envoyée par le serveur de bots, tournée d'un demi-tour pour le camp rouge, et le brouillard. |
| `simulation-paint.js` | Chaque image : pastilles, barres de vie, brouillard, icônes de compétences (1/3 s), cible marquée, boîtes. |
| `simulation-popups.js` | Les boîtes : question surprise (toutes les 1 à 2 min), pause (reprendre ou quitter la partie), mort, note finale. Plus de boîte de décision : la macro est notée en silence par le serveur de bots d'après les déplacements et les cibles. |
| `simulation-watch.js` | Le mode spectateur : plateau (horloge, interrupteurs de vitesse et de vue, les deux équipes), chaque image, boîte de fin (vainqueur, durée, éliminations). |
| `simulation-shared.js` | Voies, difficultés, noms et portraits, crochets de test de l'adresse (`?limit=`, `?debug=map`). |

## Tests

- Balisage : `node --test src/client/features/simulation/simulation-markup.test.js src/client/features/simulation/simulation-watch.test.js`
- Navigateur : `node src/testing/run-e2e.mjs simulation` (un faux serveur de bots, `src/testing/fake-bots-server.js`, joue une courte partie scriptée avec les mêmes messages)
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
