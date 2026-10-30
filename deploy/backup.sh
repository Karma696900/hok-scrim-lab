#!/bin/sh
# Nightly backup of the database, ENCRYPTED and copied OFF the machine (a lost server must not take its backups with it).
#   - a dump of the whole database, compressed, encrypted for your public age key (only your private key, kept on your
#     PC and somewhere safe, can open it: the server cannot read its own backups);
#   - kept 14 days on the server, and copied with rclone to BACKUP_REMOTE (a Hetzner Storage Box, for example).
# Settings in .env.backup next to docker-compose.yml (never in Git):
#   BACKUP_AGE_RECIPIENT=age1...        your public key (age-keygen -o hok-backup.key on your PC, then age-keygen -y)
#   BACKUP_REMOTE=storagebox:hok        an rclone remote and folder (rclone config); empty = local copy only
# Cron (crontab -e, as the user hok):
#   30 3 * * * /home/hok/hok/deploy/backup.sh >> /home/hok/backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
. ./.env.backup
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT in .env.backup}"

mkdir -p "$HOME/backups"
file="$HOME/backups/hok-$(date -u +%Y-%m-%dT%H%MZ).sql.gz.age"
compose="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.caddy.yml"

$compose exec -T mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
  | gzip -9 | age -r "$BACKUP_AGE_RECIPIENT" > "$file.part"
# a dump that stopped half-way is smaller than a few kilobytes: never keep it as a backup
[ "$(wc -c < "$file.part")" -gt 4096 ] || { echo "backup too small, kept nothing" >&2; rm -f "$file.part"; exit 1; }
mv "$file.part" "$file"

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rclone copy "$file" "$BACKUP_REMOTE" --immutable
  rclone delete "$BACKUP_REMOTE" --min-age 60d
fi
find "$HOME/backups" -name 'hok-*.sql.gz.age' -mtime +14 -delete
echo "$(date -u +%FT%TZ) backup ok: $file"
