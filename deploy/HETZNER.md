# Mettre HOK Global Scrim Lab en ligne sur Hetzner

Écrit le 2026-10-30. Choix retenus : nom de domaine chez **Cloudflare Registrar**, serveur chez **Hetzner** (Allemagne, donc dans l'Union européenne pour le RGPD). Les fichiers utilisés sont dans ce dossier `deploy/` et ont été vérifiés : `Caddyfile` (validé par Caddy 2.10), `cloud-init.yml` (validé par `cloud-init schema`), `backup.sh` + `restore-test.sh` (une sauvegarde chiffrée de la base locale a été restaurée dans un MySQL jetable : mêmes nombres de comptes et de séries). Le déploiement lui-même n'a jamais été exécuté : le premier essai peut révéler un détail.

Les prix changent : vérifie-les sur hetzner.com avant de commander.

## 0. À préparer sur ton PC

1. **Une clé SSH** (si tu n'en as pas) : `ssh-keygen -t ed25519 -C "hok"`. La partie publique est dans `~/.ssh/id_ed25519.pub`.
2. **Une clé de sauvegarde** : télécharge `age` (github.com/FiloSottile/age, version Windows), puis `age-keygen -o hok-backup.key`. La ligne `Public key: age1...` va sur le serveur ; le fichier `hok-backup.key` reste sur ton PC **et** dans un deuxième endroit sûr (clé USB, gestionnaire de mots de passe). Sans lui, les sauvegardes ne s'ouvrent plus ; le serveur, lui, ne peut pas les lire.
3. **Les secrets de Heroku**, si tu reprends les données de JawsDB : les comptes ne fonctionnent qu'avec les **mêmes** `MFA_ENCRYPTION_KEY` et `PASSWORD_PEPPER` (s'il y en a un). Récupère-les toi-même : `heroku config:get MFA_ENCRYPTION_KEY -a hok-lab` (idem pour `PASSWORD_PEPPER`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DISCORD_*`, `ADMIN_EMAILS`).

## 1. Le pare-feu Hetzner (avant le serveur)

Console Hetzner Cloud → Firewalls → Create Firewall, règles **entrantes** :

| Protocole | Port | Source |
| --- | --- | --- |
| TCP | 22 | ton adresse IP si elle est fixe, sinon « Any » (fail2ban et la clé SSH protègent) |
| TCP | 80 | Any |
| TCP | 443 | Any |
| UDP | 443 | Any (HTTP/3) |

Rien d'autre. C'est ce pare-feu qui compte : Docker ouvre ses ports en passant à côté du pare-feu de la machine (ufw).

## 2. Le serveur

Console → Servers → Add Server :

- **Emplacement** : Falkenstein ou Nuremberg (Allemagne).
- **Image** : Ubuntu 24.04.
- **Type** : x86 (gamme « CX » ou « CPX »), **2 vCPU et 4 Go** au minimum. Pas ARM (« CAX ») : l'image n'a jamais été testée sur ARM.
- **SSH key** : colle ta clé publique.
- **Firewall** : celui de l'étape 1.
- **Cloud config** : colle le contenu de `deploy/cloud-init.yml` après avoir remplacé la ligne `ssh-ed25519 REPLACE-WITH-YOUR-PUBLIC-KEY you@pc` par ta clé publique.
- **Backups** Hetzner (option payante, environ +20 %) : facultatif, les sauvegardes de la base sont faites par `backup.sh`.

Au bout de 2 ou 3 minutes : `ssh hok@ADRESSE-IP`. La connexion en `root` et par mot de passe est refusée, c'est voulu. Les mises à jour de sécurité s'installent seules chaque nuit (redémarrage automatique à 4 h 30 si nécessaire ; les conteneurs repartent seuls).

## 3. Le nom de domaine (Cloudflare)

Dans Cloudflare → ton domaine → DNS → ajoute :

- `A` `@` → ADRESSE-IP, **Proxy status : DNS only** (nuage gris) ;
- `A` `www` → ADRESSE-IP, **DNS only**.

Le nuage gris est important : Caddy obtient lui-même le certificat HTTPS, et le site compte un seul intermédiaire (`TRUST_PROXY=1`). Si tu veux plus tard le proxy Cloudflare (nuage orange), il faudra changer `TRUST_PROXY` : demande-moi avant.

## 4. Le code et les réglages

```bash
git clone TON-DEPOT hok && cd hok        # ou : scp -r depuis ton PC
cp .env.example .env && chmod 600 .env
nano .env
```

Dans `.env`, au minimum :

```
MYSQL_ROOT_PASSWORD=...          # long, aléatoire : openssl rand -base64 33
MYSQL_PASSWORD=...               # long, aléatoire
MFA_ENCRYPTION_KEY=...           # CELLE DE HEROKU si tu reprends ses données, sinon : openssl rand -base64 32
APP_DOMAIN=ton-domaine.fr
APP_ORIGIN=https://ton-domaine.fr
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://ton-domaine.fr/auth/google/callback
ADMIN_EMAILS=ton-adresse@gmail.com
REGISTRATION_ENABLED=true        # false = personne ne peut créer de compte
```

Puis, pour les sauvegardes, `.env.backup` (même dossier, `chmod 600`) :

```
BACKUP_AGE_RECIPIENT=age1...     # ta clé PUBLIQUE de l'étape 0
BACKUP_REMOTE=                   # vide au début ; voir l'étape 7
```

## 5. Les données (copie de JawsDB)

Sur ton PC (Git Bash), Docker allumé. `JAWSDB_URL` a la forme `mysql://UTILISATEUR:MOT-DE-PASSE@HÔTE:PORT/BASE` (`heroku config:get JAWSDB_URL -a hok-lab`) :

```bash
docker run --rm mysql:8.4 mysqldump -h HÔTE -P PORT -u UTILISATEUR -p'MOT-DE-PASSE' \
  --ssl-mode=REQUIRED --single-transaction --no-tablespaces --set-gtid-purged=OFF BASE > hok.sql
scp hok.sql hok@ADRESSE-IP:~/hok/
```

Sur le serveur, la base d'abord, seule :

```bash
cd ~/hok
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.caddy.yml"
$C up -d mysql && sleep 30
$C exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < hok.sql
rm hok.sql
```

## 6. Démarrer et vérifier

```bash
$C up -d --build                                     # la première fois : 5 à 10 minutes
$C ps                                                # tout « running » / « healthy »
curl -s https://ton-domaine.fr/api/health            # {"status":"ok","storage":"mysql"}
curl -sI http://ton-domaine.fr | head -1             # 308 vers https
curl -s https://ton-domaine.fr/ | grep -c "<h1"      # 1 : la page est dessinée par le serveur
```

Puis :

1. Teste le certificat sur ssllabs.com/ssltest (note attendue : A ou A+).
2. Google Cloud Console : ajoute `https://ton-domaine.fr/auth/google/callback` aux URI de redirection. Discord (si utilisé) : `/auth/discord/callback` et `/auth/discord/bot/callback` (voir `docs/DISCORD_SETUP.md`).
3. Connecte-toi et vérifie que ton adresse voit les pages d'administration.
4. Search Console : ajoute le site et envoie `https://ton-domaine.fr/sitemap.xml`.
5. Quand tout marche depuis quelques jours : supprime l'application Heroku et JawsDB (ils coûtent tant qu'ils existent).

## 7. Les sauvegardes

```bash
chmod +x deploy/backup.sh deploy/restore-test.sh
deploy/backup.sh                                     # une première fois à la main
crontab -e                                           # puis ajoute :
30 3 * * * /home/hok/hok/deploy/backup.sh >> /home/hok/backup.log 2>&1
```

Elles sont chiffrées, gardées 14 jours sur le serveur. **Une copie hors du serveur est nécessaire** (un serveur perdu emporte ses fichiers) : le plus simple est une Hetzner Storage Box (quelques euros par mois). `rclone config` → type `sftp`, hôte de la Storage Box, port 23 ; puis `BACKUP_REMOTE=storagebox:hok` dans `.env.backup`. Les copies distantes sont gardées 60 jours.

**Une fois par mois**, prouve qu'une sauvegarde se restaure. Sur ton PC, avec le fichier `.sql.gz.age` téléchargé et ta clé privée (il faut `age` et Docker) :

```bash
deploy/restore-test.sh hok-2026-11-01T0330Z.sql.gz.age hok-backup.key
```

Il charge la sauvegarde dans un MySQL jetable, affiche le nombre de tables, de comptes et de séries, puis supprime tout.

## 8. Entretien

- **Mettre à jour le site** : `git pull && $C up -d --build`.
- **Regarder ce qui se passe** : `$C ps`, `$C logs -f hok-scrim-lab`, `https://ton-domaine.fr/api/health`.
- **Le système** se met à jour seul. Pour vérifier : `sudo unattended-upgrade --dry-run`, et `sudo fail2ban-client status sshd` pour voir les tentatives SSH bloquées.
- **Les imports automatiques des diffusions** tournent sur ton PC et écrivent dans ta base locale : la base du serveur n'est pas ouverte sur Internet. Pour l'instant, la copie vers le serveur se fait à la main (étape 5 dans l'autre sens) ; je peux l'automatiser plus tard.
