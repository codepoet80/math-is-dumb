#!/bin/sh
# deploy.sh — rebuild, then sync the repo to the web server.
#
# The repo root is the webroot: index.html and assets/ sit where the server wants
# them, so syncing the repo IS the deploy. Nothing is built on the server, and no
# PHP runs at request time.
#
# Set TARGET to your host and webroot, e.g.
#   TARGET=jon@example.com:/var/www/math/
TARGET="${TARGET:-}"

set -e
cd "$(dirname "$0")"

if [ -z "$TARGET" ]; then
  echo "deploy.sh: set TARGET first, e.g."
  echo "  TARGET=you@host:/var/www/math/ ./deploy.sh"
  exit 1
fi

node build.js

# --delete keeps the remote clean. The excludes are the things that are either
# local-only or have no business being served.
rsync -avz --delete \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude 'build/' \
  --exclude '*.sh' \
  ./ "$TARGET"

echo
echo "Synced to $TARGET"
