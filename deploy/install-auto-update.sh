#!/bin/sh
# Turns the automatic updates on (deploy/auto-update.sh every 2 minutes), once: running it again changes nothing.
#   sh deploy/install-auto-update.sh
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
line="*/2 * * * * sh $here/auto-update.sh >> $HOME/auto-update.log 2>&1"
if crontab -l 2> /dev/null | grep -qF "$here/auto-update.sh"; then
  echo "already on"
else
  (crontab -l 2> /dev/null; echo "$line") | crontab -
  echo "on"
fi
crontab -l
