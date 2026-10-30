#!/bin/sh
# Proves a backup can be restored, without touching the real database: the file is decrypted and loaded into a
# throw-away MySQL container that is deleted afterwards. Run it on your PC (Git Bash) or on the server, once a month.
#   deploy/restore-test.sh hok-2026-11-01T0330Z.sql.gz.age hok-backup.key
set -eu
backup="${1:?the .sql.gz.age file}"
key="${2:?your private age key (hok-backup.key)}"
name="hok-restore-test-$$"
password="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"

docker run -d --rm --name "$name" -e MYSQL_ROOT_PASSWORD="$password" -e MYSQL_DATABASE=restore mysql:8.4 > /dev/null
trap 'docker stop "$name" > /dev/null 2>&1 || true' EXIT
until docker exec "$name" mysqladmin ping -uroot -p"$password" --silent > /dev/null 2>&1; do sleep 2; done
sleep 5 # the first start restarts MySQL once after its set-up

age -d -i "$key" "$backup" | gunzip | docker exec -i "$name" mysql -uroot -p"$password" restore
docker exec "$name" mysql -N -uroot -p"$password" restore -e \
  "SELECT CONCAT('tables: ', COUNT(*)) FROM information_schema.tables WHERE table_schema='restore';
   SELECT CONCAT('accounts: ', COUNT(*)) FROM users;
   SELECT CONCAT('series: ', COUNT(*)) FROM series;
   SELECT CONCAT('last migration: ', MAX(version)) FROM schema_migrations;" 2> /dev/null
echo "restore ok"
