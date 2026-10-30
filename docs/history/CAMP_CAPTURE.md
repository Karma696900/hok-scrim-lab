# Captures Camp à fournir (détail héros, ajustements de patch)

Les endpoints Camp de détail d'un héros et d'ajustements de saison **n'ont pas été vérifiés** : leur contenu est inconnu,
donc rien n'est affiché ni inventé (la fiche héros indique « Data unavailable »). Pour aller plus loin :

1. Ouvrez `https://camp.honorofkings.com/h5/app/index.html?lang_type=en#/hero-hot-list` dans Chrome.
2. DevTools (F12) → onglet **Network** → filtre **Fetch/XHR** → cliquez sur un héros pour ouvrir sa fiche.
3. Pour chaque requête de détail (héros, ajustements/patch, liste des héros) : clic droit → **Copy → Copy response**,
   et notez l'URL, la méthode et le corps de la requête.
4. Enregistrez dans `docs/samples/` (ex. `hero-detail-533.json`, `hero-list.json`, `patch-adjustments.json`) **sans cookie ni token**.
5. Vérifiez que les données sont bien **Global** (`lang_type=en`) et pas la version chinoise.

Avec ces captures, on pourra : s'affranchir de l'endpoint de classement pour le roster (liste de héros), et afficher
détails/ajustements avec leur provenance. Ne pas utiliser le daemon `camp-security` du wrapper communautaire : Playwright reste le mécanisme.
