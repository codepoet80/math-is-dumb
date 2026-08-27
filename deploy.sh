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

# --delete keeps the remote clean.
#
# Everything the site does not actually serve is excluded here rather than hidden
# by server config. That way it works the same on any web server, and there is no
# rule to keep in sync. What lands on the server is exactly what the site needs.
#
# Nothing in this repo is secret -- it is a static maths reference -- so this is
# tidiness, not security. content/rules.json is deliberately kept: it is the
# source of truth and it is useful to be able to curl it.
rsync -avz --delete \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude 'build/' \
  --exclude 'tools/' \
  --exclude '*.sh' \
  --exclude '*.py' \
  --exclude 'build.js' \
  --exclude 'README.md' \
  ./ "$TARGET"

echo
echo "Synced to $TARGET"
