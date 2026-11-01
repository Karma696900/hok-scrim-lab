# Ce qui manque (données du jeu à vérifier ou à compléter)

Les données ont été **importées depuis tes trois pages** (`items.html` = wiki Fandom, `arcana.html` et `spells.html` = hokstats.gg) par `scripts/catalog/import-data.mjs`, sur ta base de développement, après une sauvegarde (`backups/hok_scrim-20261010-221712.sql`). Ce sont des sites de fans : **à vérifier une par une dans le jeu**. Rien n'a été inventé : ce qui ne se lit pas avec certitude n'est pas importé et se trouve ci-dessous.

Pour tout reprendre en arrière : `node scripts/catalog/import-data.mjs --undo backups/catalog-data-20261010-202054.json --apply` (il rend à chaque objet et arcane ce qu'il contenait avant, supprime les 10 sorts et les 2 stats créées). Sans effacer ce que tu as écrit à la main : l'importeur ne remplit que les champs vides.

## Ce qui est maintenant dans la base

- **Objets : 44 sur 71** ont leur catégorie de boutique (le tableau où le wiki les range), leurs stats et une ligne d'effet (le texte du wiki, mis dans la description).
- **Arcanes : 27 sur 30** ont leurs stats de niveau V (une arcane = ses valeurs).
- **Sorts : 10** (Execute, Flash, Frenzy, Heal, Intimidate, Purify, Smite, Sprint, Stun, Teleport) avec leur description et leur temps de recharge. 9 ont leur icône, téléchargée depuis le serveur d'images officiel du jeu.
- **Stats créées** : Movement Speed Bonus (un pourcentage, comme ton « Attack Speed Bonus »), Health Recovery. Ton « Attack Speed Bonus » sert pour « Attack Speed » du wiki. Tes autres stats n'ont pas été touchées.

## À vérifier en priorité (écarts entre les sources et ta base)

- [ ] **Couleurs des arcanes : le guide et tes images se contredisent.** Le guide appelle « vertes » les arcanes de survie (Avarice, Beast Scar, Harmony, Hunt, Longevity, Meditation, Prosperity, Reaver, Reincarnation, Stealth) et « bleues » les arcanes d'utilité (Compassion, Eagle Eye, Fortify, Mind's Eye, Reverberation, Tribute, Void…). **Sur tes images, c'est l'inverse** (cadres bleus pour la survie, verts pour l'utilité), et ta base suit tes images. J'ai gardé tes couleurs et importé les stats par le nom. À toi de dire quelle couleur est la bonne dans le jeu ; si c'est le guide, il faut permuter vert et bleu.
- [ ] **Noms** : le wiki écrit « Mask of Agony », « Ardent Dominator », « Dawnlight ». Ta base a « Mask of Angony », « Ardent Dominion », « Downlight ». J'ai rattaché les données par ressemblance de nom sans renommer. Les autres noms à relire : Crimson Shadow - Starsping, Daybreakers Virtue, Overlords Might.
- [ ] **Catégorie de la boutique** : elle vient du tableau du wiki dans lequel l'objet est rangé. Les 6 bottes sont dans « Movement » (5 sur 6 importées).
- [ ] **Les emplacements ne changent pas** : tout est « Item » sauf les 6 bottes. Les objets utilitaires et de fin de partie sont à placer (Catalogue → Objets → « Classer en lot »). Aucune des trois pages n'en parle.
- [ ] **Les prix manquent pour les 71 objets** : aucune des pages ne les donne.
- [ ] **Le niveau de déblocage des sorts manque** : la page ne le donne pas (laissé vide, rien n'est affiché).
- [ ] **Teleport n'a pas d'icône** : son adresse n'est pas sur le serveur officiel du jeu (`vgvd.gg`), je ne l'ai pas téléchargée. À ajouter dans Catalogue → Sorts.
- [ ] **Le texte du wiki est une phrase d'accroche** (« Great against squishy targets »), pas la description complète des passifs et actifs : les effets (passifs/actifs) sont à écrire à la main. Les textes des sites de fans ne sont pas à publier tels quels sans les citer (le wiki est sous licence CC BY-SA).

## Recettes des objets (import du 2026-11-01)

Importées par `scripts/catalog/import-recipes.mjs` depuis `scripts/catalog/data/game-items-2026-11-01.json` (prix et stats : hub-game.com ; composants et onglet de boutique : hokstats.gg ; identifiants et icônes : liste officielle pvp.qq.com). Sauvegarde avant : `backups/hok_scrim-20261101-212733.sql`. Pour tout reprendre en arrière : `node scripts/catalog/import-recipes.mjs --undo backups/catalog-recipes-20261101-202840.229.json --apply`.

- **Ajoutés** : 44 objets (les petits « basiques » et les « intermédiaires »), chacun avec son niveau, son prix, son onglet de boutique et ses stats. **71 objets existants complétés** (seulement les champs vides : tes prix et catégories sont gardés). **94 recettes** écrites.
- **Niveau** : déduit du prix (moins de 400 : basique ; moins de 1000 : intermédiaire, sauf les bottes = finales ; 3000 et plus : enchanté). À corriger à la main si un objet est mal classé (Catalogue → Objets → Niveau).
- [ ] **6 icônes manquent** (le serveur d'images du jeu répond 404) : Mystic Page, Plume of Enchantment, Primordial Crystal, Mirror of Radiance, Stone of All Creation, Ironbrand.
- [ ] **6 objets sans recette** (aucune page ne la donne) : Lance of Swiftness, Pearl of Origin, Stone of All Creation, Ironbrand, Assassin's Wristbow, Guardian - Howl.
- [ ] **5 recettes douteuses** (complétées par les stats, plusieurs candidats possibles) : Starbreaker, Tempest, Sage's Sanctuary, Boots of Fortitude, Boots of Resistance.
- [x] **« Assassin »** renommé « Assassin's Wristbow » (base locale, 2026-11-01). En production : à renommer dans Catalogue → Objets.
- [ ] **Anti-magic Cloak** et **Sparkling Sapphire** : absents de hokstats.gg, onglet de boutique inconnu.

## Objets sans stats (27) : à compléter à la main ou à me donner

| fait | Objet                       | Slot   | Pourquoi vide                                                                                                                           |
| ---- | --------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| [ ]  | Amble - Winter              | Item   | idem (Winter)                                                                                                                           |
| [ ]  | Assassin                    | Item   | absent de la page du wiki                                                                                                               |
| [ ]  | Blood Rage                  | Item   | le wiki met « Blood Rage and Phantom » dans une seule ligne                                                                             |
| [ ]  | Boots of the Arcane         | Bottes | « 25 Mana/5 seconds » : régénération de mana                                                                                            |
| [ ]  | Crimson Shadow - Howl       | Item   | famille Roaming : le wiki ne liste que la version de base, les variantes (Howl, Radiance, Redemption, Starspring) ne se distinguent pas |
| [ ]  | Crimson Shadow - Radiance   | Item   | famille Roaming : le wiki ne liste que la version de base, les variantes (Howl, Radiance, Redemption, Starspring) ne se distinguent pas |
| [ ]  | Crimson Shadow - Redemption | Item   | famille Roaming : le wiki ne liste que la version de base, les variantes (Howl, Radiance, Redemption, Starspring) ne se distinguent pas |
| [ ]  | Crimson Shadow - Starsping  | Item   | famille Roaming : le wiki ne liste que la version de base, les variantes (Howl, Radiance, Redemption, Starspring) ne se distinguent pas |
| [ ]  | Daybreakers Virtue          | Item   | absent de la page du wiki                                                                                                               |
| [ ]  | Demonsbane                  | Item   | absent de la page du wiki                                                                                                               |
| [ ]  | Downlight                   | Item   | « 150 Health per second » : régénération, pas une stat connue                                                                           |
| [ ]  | Dragon's Rage               | Item   | absent de la page du wiki                                                                                                               |
| [ ]  | Enigma - Moon Goddess       | Item   | absent de la page du wiki                                                                                                               |
| [ ]  | Eye of the Phoenix          | Item   | « 100 Health per 5 seconds » : régénération                                                                                             |
| [ ]  | Frigid Charge               | Item   | le wiki met « Frigid Charge and Winter » dans une seule ligne                                                                           |
| [ ]  | Guardian - Howl             | Item   | famille Roaming : le wiki ne liste que la version de base, les variantes (Howl, Radiance, Redemption, Starspring) ne se distinguent pas |
| [ ]  | Guardian - Radiance         | Item   | famille Roaming : le wiki ne liste que la version de base, les variantes (Howl, Radiance, Redemption, Starspring) ne se distinguent pas |
| [ ]  | Guardian - Redemption       | Item   | famille Roaming : le wiki ne liste que la version de base, les variantes (Howl, Radiance, Redemption, Starspring) ne se distinguent pas |
| [ ]  | Guardian - Starspring       | Item   | famille Roaming : le wiki ne liste que la version de base, les variantes (Howl, Radiance, Redemption, Starspring) ne se distinguent pas |
| [ ]  | Haste - Sunpool             | Item   | idem (Sunpool)                                                                                                                          |
| [ ]  | Immovable - Sky Dome        | Item   | idem (Sky Dome)                                                                                                                         |
| [ ]  | Overlords Might             | Item   | absent de la page du wiki                                                                                                               |
| [ ]  | Pure Sky                    | Item   | le wiki met « Pure Sky and Sky Dome » dans une seule ligne                                                                              |
| [ ]  | Ravage - Phantom            | Item   | idem (Phantom)                                                                                                                          |
| [ ]  | Scepter of Reverberation    | Item   | le wiki écrit « 210% Magical Attack » (faute probable)                                                                                  |
| [ ]  | Succubus Cloak              | Item   | « 100 Health per second » : régénération                                                                                                |
| [ ]  | Sunchaser                   | Item   | le wiki met « Sunpool and Sunchaser » dans une seule ligne                                                                              |

Lignes du wiki **non importées** (illisibles ou ambiguës), avec le texte de la source :

- Flaming Wrath, Dreamforged - Skypiercer : le wiki les marque « removed & reworked » / « under maintenance ».
- Dawnlight, Succubus Cloak, Eye of the Phoenix, Boots of the Arcane : régénération de vie ou de mana (« Health per second », « per 5 seconds »).
- Scepter of Reverberation : « 210% Magical Attack » (pourcentage, alors que les autres objets magiques sont en valeur fixe).
- Pure Sky and Sky Dome, Sunpool and Sunchaser, Blood Rage and Phantom, Frigid Charge and Winter : deux objets sur la même ligne.
- Guardian, Crimson Shadow, Stormchaser, Stormchaser - Redemption / Starspring / Howl / Radiance : la famille « Roaming » ; tes objets portent d'autres noms (« Guardian - Howl »…).

## Arcanes sans stats (3)

Le guide n'en liste que 27 : ces trois n'y sont pas.

| fait | Couleur (dans ta base) | Arcane     | Stats |
| ---- | ---------------------- | ---------- | ----- |
| [ ]  | green                  | Bulwark    |       |
| [ ]  | green                  | Cognizance |       |
| [ ]  | green                  | Reverence  |       |

## Les builds recommandés des héros

Un build recommandé peut maintenant porter 1 ou 2 sorts (Guides des héros). Ceux déjà écrits n'en ont aucun et restent valables.

## À vérifier dans l'interface, un par un

- [ ] /items : les 71 objets, les filtres par emplacement et par catégorie, la recherche, le détail d'un objet (stats, description)
- [ ] /arcana : les 30 arcanes, le filtre de couleur, le détail avec ses stats
- [ ] /spells : les 10 sorts, le temps de recharge, le détail ; rien d'affiché pour ce qui n'est pas renseigné
- [ ] Catalogue → Sorts : créer, modifier, supprimer ; supprimer un sort utilisé par un build recommandé est refusé
- [ ] Labo de builds : onglet Sorts, 1 puis 2 sorts, le 3e refusé, retirer un sort, le lien partagé garde les sorts
- [ ] Labo de builds : les stats totales d'un build avec les objets et arcanes importés (vérifie 2 ou 3 à la main)
- [ ] Fiche d'un héros : le build recommandé montre ses sorts
- [ ] Menu : l'entrée « Données du jeu », en arabe (droite à gauche) et sur téléphone

Avant de tester dans l'interface : `docker compose up -d --build` (c'est toi qui le lances ; la base est déjà à jour, la migration 032 est appliquée).
