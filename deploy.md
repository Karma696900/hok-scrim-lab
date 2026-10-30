# Mettre HOK Global Scrim Lab en ligne, gratuitement ou presque

> **Choix retenu le 2026-10-30 : Hetzner + domaine Cloudflare. Le guide à suivre est `deploy/HETZNER.md`** (fichiers prêts et vérifiés dans `deploy/` et `docker-compose.caddy.yml`). La suite de ce document compare les options et reste comme référence.

Écrit le 2026-10-17. Les offres et les prix cités ont été relus sur les pages officielles ce jour-là ; ils changent, revérifie avant de t'engager.
Ce guide suit la structure actuelle du dépôt. Quand l'architecture sera refaite, les chemins du `Dockerfile` et des fichiers `docker-compose*.yml` bougeront, les commandes resteront les mêmes.

## 1. Pourquoi pas Vercel (ni Netlify, ni Cloudflare Pages)

Ces services exécutent de courtes fonctions, pas un serveur qui reste allumé. Le site a besoin de quatre choses qu'ils ne donnent pas :

- un **serveur Node permanent** (Express : sessions, tâches de fond, sauvegarde de la traduction, verrous),
- une base **MySQL 8** qui garde ses données,
- un **Chromium sans écran** dans le conteneur : il dessine côté serveur le premier écran des pages publiques (c'est ce qui donne le Lighthouse à 100 et ce que voient les moteurs de recherche) et synchronise la liste des héros,
- environ **2 Go de mémoire** (la limite fixée dans `docker-compose.prod.yml`).

Vercel ne sert donc à rien ici, sauf à héberger une page de façade, ce qui n'a pas d'intérêt. Il faut une machine qui exécute Docker.

## 2. Les choix réalistes

| Option | Coût | Les bons côtés | Les pièges |
| --- | --- | --- | --- |
| **A. Oracle Cloud « Always Free »** (recommandé) | 0 € | Une machine ARM de 2 cœurs et 12 Go, 200 Go de disque, 10 To de trafic par mois, toujours allumée. Toute la pile (site + MySQL) tient dessus. | Carte bancaire demandée à l'inscription (vérification). « Out of host capacity » possible à la création : réessayer plus tard. Oracle peut reprendre une machine restée inactive 7 jours (moins de 20 % de CPU, de réseau et de mémoire). L'image Docker n'a jamais tourné sur ARM : voir l'étape 6. |
| **B. Ton PC + Cloudflare Tunnel** | 0 € | Rien à louer, aucun port à ouvrir, HTTPS inclus. Idéal pour montrer le site à quelques personnes. | Le site est coupé dès que le PC dort ou s'éteint. Il faut un domaine géré chez Cloudflare. |
| **C. Un petit VPS** (Hetzner, OVH, Scaleway…) | environ 4 à 6 € par mois (à vérifier chez le fournisseur) | Aucun risque de reprise, x86 comme ton PC (l'image est celle que tu testes déjà), support. | Ce n'est pas gratuit. |
| Fly.io | à partir de 6,70 $ par mois pour 1 Go, environ 12,70 $ pour 2 Go, plus 0,15 $ par Go de disque | Facile à déployer | Plus aucune offre gratuite pour les nouveaux comptes (seulement un essai de 2 h ou 7 jours). MySQL est à gérer toi-même. |
| Render | 0 € | Simple | Le service s'endort après 15 minutes, les fichiers disparaissent à chaque redémarrage, pas de MySQL (seulement Postgres, effacé après 30 jours). Inutilisable ici. |
| Base seule : TiDB Cloud Starter | 0 € jusqu'à 5 Gio | Compatible MySQL, sans serveur à gérer | Compatibilité MySQL à tester avant (les migrations du site n'ont jamais tourné dessus). Utile seulement si tu veux séparer la base. Je ne le recommande pas au départ. |

**Ma recommandation** : A (Oracle) pour le gratuit permanent, C si Oracle refuse ta carte ou n'a plus de place. B pour tester pendant un week-end.

## 3. Avant de mettre en ligne (quelle que soit l'option)

1. **Les mentions légales** : ouvre `src/shared/legal-info.js` et remplis l'éditeur (nom, statut, pays), l'hébergeur (nom et adresse) et l'adresse de contact. Tant qu'un champ manque, les pages affichent « À COMPLÉTER ». Ce n'est pas un avis juridique : fais relire les textes si le site devient public.
2. **Un nom de domaine** : environ 10 € par an chez n'importe quel bureau d'enregistrement. Un sous-domaine gratuit (DuckDNS par exemple) fonctionne mais le certificat HTTPS y est moins fiable. Pour l'option B, le domaine doit être chez Cloudflare.
3. **Google (connexion)** : dans la console Google Cloud, ajoute `https://TON-DOMAINE/auth/google/callback` aux URI de redirection autorisées.
4. **Discord (facultatif)** : dans le portail développeur, ajoute `https://TON-DOMAINE/auth/discord/callback` et `https://TON-DOMAINE/auth/discord/bot/callback`. Le détail est dans `docs/DISCORD_SETUP.md`.
5. **Les secrets** : génère-les sur ta machine, ne les mets jamais dans Git.
   - `MYSQL_ROOT_PASSWORD` et `MYSQL_PASSWORD` : des chaînes longues et aléatoires.
   - `MFA_ENCRYPTION_KEY` : `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Garde-la ailleurs aussi** : sans elle, les doubles authentifications enregistrées ne sont plus lisibles.
   - `PASSWORD_PEPPER` (facultatif) : ne le change plus après la mise en ligne, sinon tous les mots de passe deviennent invalides.

## 4. Pas à pas : option A (Oracle Cloud Always Free)

### 4.1 La machine

1. Crée un compte sur oracle.com/cloud/free. Choisis ta région d'origine avec soin : les ressources gratuites n'existent que dans celle-là.
2. Crée une instance : forme **VM.Standard.A1.Flex** (Ampere), **2 OCPU, 12 Go**, image **Ubuntu 24.04**, disque de **50 Go**. Télécharge la clé SSH qu'Oracle te donne.
3. Dans le réseau de l'instance (« liste de sécurité » du sous-réseau), autorise les ports entrants **80** et **443** (TCP). Ne publie ni 3000 ni 3306.
4. Connecte-toi : `ssh -i ta-cle ubuntu@ADRESSE-IP`.
5. Ubuntu d'Oracle bloque aussi les ports dans son pare-feu local. Ouvre-les :

```bash
sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
```

### 4.2 Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && exit   # reconnecte-toi ensuite
docker compose version                   # il doit répondre (version 2.24 ou plus)
```

### 4.3 Le code et les secrets

```bash
git clone TON-DEPOT-GIT hok && cd hok    # ou copie le dossier avec scp
cp .env.example .env
nano .env
```

Dans `.env`, au minimum (le reste de `.env.example` est facultatif) :

```
MYSQL_ROOT_PASSWORD=...        # long, aléatoire
MYSQL_PASSWORD=...             # long, aléatoire
MFA_ENCRYPTION_KEY=...         # 32 octets en base64
APP_ORIGIN=https://TON-DOMAINE
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://TON-DOMAINE/auth/google/callback
ADMIN_EMAILS=ton.adresse@gmail.com
TRUST_PROXY=1
```

Le site refuse de démarrer en production avec un secret manquant, trop court ou par défaut : c'est voulu.

### 4.4 HTTPS avec Caddy (certificat gratuit et automatique)

Crée `Caddyfile` à côté de `docker-compose.yml` :

```
TON-DOMAINE {
    encode zstd gzip
    reverse_proxy hok-scrim-lab:3000
}
```

Crée `docker-compose.caddy.yml` :

```yaml
services:
  hok-scrim-lab:
    ports: !reset []        # le site n'est joignable que par Caddy
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - hok-scrim-lab
volumes:
  caddy-data:
  caddy-config:
```

Chez ton bureau d'enregistrement, crée l'enregistrement DNS **A** de `TON-DOMAINE` vers l'adresse IP publique de la machine. Attends qu'il soit actif (quelques minutes).

### 4.5 Démarrer

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.caddy.yml up -d --build
docker compose ps                                   # tout doit être "healthy" / "running"
curl -s https://TON-DOMAINE/api/health              # {"status":"ok","storage":"mysql"}
```

La première construction est longue (téléchargement de Node, de Chromium, compilation des fichiers du client). La base se crée et se migre toute seule au premier démarrage.

### 4.6 Premier contrôle sur ARM

L'image n'a été construite et testée que sur x86. Node et Chromium existent pour ARM, donc elle devrait fonctionner, mais vérifie ce qui dépend de Chromium :

```bash
docker compose logs hok-scrim-lab | grep -i -E "error|prerender|chromium" | head
curl -s https://TON-DOMAINE/ | grep -c "<h1"       # doit afficher 1 : la page est dessinée par le serveur
```

Si le Chromium ne démarre pas sur ARM, le site fonctionne quand même (les pages sont alors dessinées dans le navigateur) mais perd le dessin côté serveur et une partie du score Lighthouse. Dans ce cas, passe à l'option C (une machine x86).

### 4.7 Mettre tes données dans la base

La base du serveur est vide. Pour y copier la tienne (héros, séries importées, comptes) :

```bash
# sur ton PC (Git Bash), le conteneur MySQL de développement doit tourner
docker exec -i drafts_hok-mysql-1 sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction hok_scrim' > hok.sql
scp -i ta-cle hok.sql ubuntu@ADRESSE-IP:~/hok/

# sur le serveur
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" hok_scrim' < hok.sql
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.caddy.yml restart hok-scrim-lab
```

**L'import automatique des diffusions** (YouTube, Facebook, Liquipedia) tourne sur ton PC et écrit dans ta base locale. La base du serveur n'est pas publiée sur Internet, donc cette copie est à refaire de temps en temps, à la main ou avec une tâche planifiée. Je peux automatiser cette copie plus tard.

## 5. Option B : ton PC avec Cloudflare Tunnel

1. Le domaine doit être géré par Cloudflare (gratuit à partir de la zone DNS).
2. Installe `cloudflared` sur Windows et connecte-le : `cloudflared tunnel login`, puis `cloudflared tunnel create hok`.
3. Lance la pile de production comme à l'étape 4.5, sans le fichier Caddy, puis **expose le port 3000 en local seulement** (garde `ports: "127.0.0.1:3000:3000"` ; le fichier de développement le publie sur toutes les interfaces, à restreindre).
4. Dans `~/.cloudflared/config.yml` : `ingress: - hostname: TON-DOMAINE, service: http://localhost:3000` suivi de `- service: http_status:404`, puis `cloudflared tunnel route dns hok TON-DOMAINE` et `cloudflared tunnel run hok`.
5. Mets `APP_ORIGIN=https://TON-DOMAINE` et `TRUST_PROXY=1`.

Le site n'est en ligne que tant que le PC et Docker tournent.

## 6. Entretien

**Mettre à jour** (après un `git pull`) :

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.caddy.yml up -d --build
```

**Sauvegarder chaque nuit** (à adapter, et copier ailleurs que sur la machine : sur Oracle, un disque perdu emporte les sauvegardes) :

```bash
mkdir -p ~/backups
crontab -e   # ajoute la ligne suivante
30 3 * * * cd ~/hok && docker compose exec -T mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction hok_scrim' | gzip > ~/backups/hok-$(date +\%F).sql.gz && find ~/backups -mtime +14 -delete
```

**Surveiller** : `docker compose ps`, `docker compose logs -f hok-scrim-lab`, et `GET /api/health` (la base répond) ou `/api/health/live` (le serveur répond).

**Sécurité de la machine** : connexion SSH par clé uniquement, rien d'autre d'ouvert que 80 et 443, `sudo unattended-upgrades` pour les correctifs système.

## 7. Après la mise en ligne

1. Ouvre le site, connecte-toi avec Google, puis vérifie que ton adresse (celle de `ADMIN_EMAILS`) voit bien les pages d'administration.
2. **Search Console** : ajoute le site, vérifie la propriété, envoie `https://TON-DOMAINE/sitemap.xml`. C'est la seule étape de la liste SEO que je ne peux pas faire à ta place.
3. Relance Lighthouse sur l'adresse publique (voir `docs/PERFORMANCE.md`) : le réseau réel donne d'autres chiffres que ma machine.
4. Teste un envoi du formulaire de contact et vérifie que le message arrive, puisque les pages légales annoncent un délai de réponse.

## 8. Ce qui n'est pas vérifié

- Aucun de ces déploiements n'a été exécuté : les étapes viennent de la lecture du `Dockerfile`, de `docker-compose.prod.yml` et de `README.md`, et des pages officielles des offres. Le premier essai réel peut révéler un détail (ARM, pare-feu Oracle, DNS).
- L'option TiDB n'a pas été testée avec les migrations du site.
- Les prix du VPS (option C) sont indicatifs.
