#!/bin/sh
# Automatic updates: run every 2 minutes by cron (see deploy/HETZNER.md). When GitHub has a newer commit on main AND
# the CI run of that commit has passed (the job "tests" of .github/workflows/ci.yml), the server takes it and rebuilds;
# otherwise it does nothing. GitHub holds no key to this server: the server only reads the public repository.
#   */2 * * * * sh /home/hok/hok/deploy/auto-update.sh >> /home/hok/auto-update.log 2>&1
set -eu
cd "$(dirname "$0")/.."
exec 9> /tmp/hok-auto-update.lock
flock -n 9 || exit 0 # an update is still running

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }
compose="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.caddy.yml"
skipped=/tmp/hok-auto-update.refused # the commit already refused, so that the log says it once
failed_build=/tmp/hok-auto-update.build-failed

git fetch -q origin main
current="$(git rev-parse HEAD)"
latest="$(git rev-parse origin/main)"
[ "$current" = "$latest" ] && exit 0

# owner/name of the repository, from https://github.com/owner/name(.git)
repo="$(git remote get-url origin | sed -E 's#^https://([^@/]+@)?github.com/##; s#\.git$##')"
verdict="$(curl -fsS -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$repo/commits/$latest/check-runs?check_name=tests" |
  python3 -c '
import json, sys
runs = json.load(sys.stdin).get("check_runs", [])
if not runs or any(run["status"] != "completed" for run in runs):
    print("waiting")
elif all(run["conclusion"] == "success" for run in runs):
    print("passed")
else:
    print("failed")
')" || { log "GitHub could not be asked about $latest, next try in 2 minutes"; exit 0; }

case "$verdict" in
  waiting) exit 0 ;;
  failed)
    [ "$(cat "$skipped" 2> /dev/null)" = "$latest" ] && exit 0
    echo "$latest" > "$skipped"
    log "NOT installed: the tests of $latest failed on GitHub; the site keeps $current"
    exit 0
    ;;
esac

# a build that failed (Docker Hub down, for example) is tried again after 30 minutes, not every 2 minutes
if read -r sha when 2> /dev/null < "$failed_build" && [ "$sha" = "$latest" ] && [ $(($(date +%s) - when)) -lt 1800 ]; then
  exit 0
fi

log "installing $latest (was $current)"
git merge -q --ff-only origin/main || { log "FAILED: the server copy has changes of its own (git status)"; exit 1; }
if ! $compose up -d --build --remove-orphans > /tmp/hok-auto-update.build 2>&1; then
  tail -20 /tmp/hok-auto-update.build
  git reset -q --hard "$current"
  echo "$latest $(date +%s)" > "$failed_build"
  log "FAILED to build $latest: the code is back to $current, the site kept running; new try in 30 minutes"
  exit 1
fi
docker image prune -f > /dev/null # the images of the previous builds (about 1.5 GB each)

domain="$(sed -n 's/^APP_DOMAIN=//p' .env)"
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do # one minute at most
  if curl -fsS "https://$domain/api/health" > /dev/null 2>&1; then
    log "done: $latest is online"
    exit 0
  fi
  sleep 5
done
log "WARNING: $latest is installed but https://$domain/api/health does not answer: $compose logs hok-scrim-lab"
exit 1
