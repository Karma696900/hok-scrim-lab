# Import manuel de statistiques compétitives (admin)

Aucune statistique compétitive n'est récupérée automatiquement (l'API Liquipedia n'est pas accessible).
Un administrateur (`ADMIN_EMAILS`) peut importer un fichier. Tant qu'aucun import n'existe, la fiche
héros affiche **« Data unavailable »**.

## Règles

- **Global uniquement.** `meta.confirmGlobalOnly` doit valoir `true`. Les régions/sources qui citent la
  Chine, KPL, Arena of Valor, RoV ou Garena sont refusées.
- **Les héros sont identifiés par leur ID Camp Global (`heroId`), jamais par leur nom.** Une ligne sans
  `heroId` est refusée ; un `heroId` absent du roster est refusé. (Lu Bu = 123 et Fatih = 128 sont deux héros distincts.)
- **Attribution obligatoire** : licence `CC BY-SA 3.0` ou `CC BY-SA 4.0`, URL source https, texte
  d'attribution. Ces informations sont conservées et affichées avec les chiffres.
- Les taux sont **calculés** à partir de compteurs bruts (picks, bans, victoires quand pické) et du nombre de games du jeu de données.
- Aucune donnée « ranked » : ni stockée ni affichée.

## Format JSON

```json
{
  "meta": {
    "source": "Liquipedia (HoK Global Championship 2026)",
    "sourceUrl": "https://liquipedia.net/honorofkings/...",
    "region": "Global - SEA",
    "patch": "1.2.3",
    "updatedAt": "2026-09-30",
    "license": "CC BY-SA 3.0",
    "attribution": "Data from Liquipedia, licensed under CC BY-SA 3.0.",
    "totalGames": 40,
    "confirmGlobalOnly": true
  },
  "heroes": [{ "heroId": "533", "picks": 10, "bans": 5, "wins": 6 }]
}
```

## Format CSV

Même `meta`, et `csv` à la place de `heroes` (en-tête obligatoire `heroId,picks,bans,wins`; une colonne `heroName`
est tolérée pour vous relire mais **jamais utilisée pour la correspondance**) :

```json
{ "meta": { "...": "..." }, "csv": "heroId,heroName,picks,bans,wins\n533,Agudo,10,5,6\n" }
```

## Envoyer (PowerShell, connecté en admin : réutilisez le cookie de votre navigateur ou utilisez le bouton Admin de la page Heroes)

Le plus simple est le bouton **Import competitive data** de la page Heroes (visible pour les admins).
API : `POST /api/admin/competitive-imports`, `GET /api/admin/competitive-imports`, `DELETE /api/admin/competitive-imports/:id`.

## Lanes supplémentaires

Camp ne donne qu'une lane par héros. Un admin peut en ajouter (`POST /api/admin/heroes/:id/lanes {"lane":"Mid Lane"}`) :
elles sont marquées `manual`, survivent aux synchronisations et alimentent les tier lists de lane. Les formes Flowborn
gardent une lane chacune ; les lanes Camp ne peuvent pas être retirées.
