#!/bin/sh
# serve.sh — serve the repo on the LAN so the phone and the TouchPad can reach it.
#
# Serves the repo root, which is exactly what the web server sees once the repo
# is synced — so what you test here is what you get there.
set -e
cd "$(dirname "$0")"

PORT="${PORT:-8000}"
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")

node build.js

echo
echo "  Serving the repo on port $PORT"
echo "  On this Mac    : http://localhost:$PORT/"
if [ -n "$IP" ]; then
  echo "  Phone/TouchPad : http://$IP:$PORT/"
else
  echo "  (no LAN address found — check Wi-Fi)"
fi
echo "  Ctrl-C to stop."
echo

exec python3 -m http.server "$PORT" --bind 0.0.0.0
