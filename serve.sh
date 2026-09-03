#!/bin/sh
# serve.sh — serve the repo on the LAN so the phone and the TouchPad can reach it.
#
# Serves the repo root, which is exactly what the web server sees once the repo
# is synced — so what you test here is what you get there.
#
# Uses PHP's built-in server when php is installed, so state.php works and the
# cross-device sync can be tested for real. Without php it falls back to a
# static server: the sheet still works, the JS just reports "not synced".
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
if command -v php >/dev/null 2>&1; then
  echo "  state.php      : live (php -S), state lands in data/state.json"
  echo "  Ctrl-C to stop."
  echo
  exec php -S "0.0.0.0:$PORT"
else
  echo "  state.php      : NOT running (no php on this Mac) — sync shows as off"
  echo "  Ctrl-C to stop."
  echo
  exec python3 -m http.server "$PORT" --bind 0.0.0.0
fi
