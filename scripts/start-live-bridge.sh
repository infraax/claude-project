#!/bin/bash
# start-live-bridge.sh
# Starts the API server + cloudflared tunnel.
# Writes public URL to data/tunnel.json and optionally pushes to gh-pages.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

PORT=3000
TUNNEL_JSON="data/tunnel.json"
LOG_DIR="/tmp/claude-bridge-logs"
mkdir -p "$LOG_DIR" data

echo "=== Claude Project Live Bridge ==="
echo "Starting API server on port $PORT..."

# Kill any existing server on this port
lsof -ti:$PORT | xargs kill -9 2>/dev/null || true

# Start API server (compiled JS)
node dist/api-server.js > "$LOG_DIR/api-server.log" 2>&1 &
API_PID=$!
echo "API server PID: $API_PID"

# Wait for it to be ready
for i in $(seq 1 10); do
  if curl -sf http://localhost:$PORT/health > /dev/null 2>&1; then
    echo "✅ API server ready"
    break
  fi
  sleep 1
  if [ $i -eq 10 ]; then
    echo "❌ API server failed to start. Check $LOG_DIR/api-server.log"
    cat "$LOG_DIR/api-server.log"
    exit 1
  fi
done

echo "Starting cloudflared tunnel..."

# Start cloudflared, capture URL from stderr
TUNNEL_LOG="$LOG_DIR/cloudflared.log"
cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate 2>"$TUNNEL_LOG" &
CF_PID=$!

# Wait for tunnel URL to appear in log
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -o 'https://[a-z0-9\-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "⚠️  Could not extract tunnel URL after 30s."
  echo "cloudflared log:"
  cat "$TUNNEL_LOG"
  # Keep running — API server is still accessible locally
  TUNNEL_URL="http://localhost:$PORT"
fi

echo "Tunnel URL: $TUNNEL_URL"

# Write tunnel.json
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$TUNNEL_JSON" << EOF
{
  "url": "$TUNNEL_URL",
  "started": "$STARTED_AT",
  "port": $PORT,
  "endpoints": [
    "$TUNNEL_URL/health",
    "$TUNNEL_URL/dispatches",
    "$TUNNEL_URL/budget",
    "$TUNNEL_URL/queue",
    "$TUNNEL_URL/tgch"
  ]
}
EOF

echo "Written: $TUNNEL_JSON"

# Commit tunnel URL to gh-pages if on that branch (or just current branch)
if git show-ref --quiet refs/remotes/origin/gh-pages 2>/dev/null; then
  git add "$TUNNEL_JSON"
  git commit -m "chore: update tunnel URL — $TUNNEL_URL" || true
  git push origin HEAD 2>/dev/null || true
  echo "Pushed tunnel.json to remote"
else
  # Just commit to current branch
  git add "$TUNNEL_JSON" 2>/dev/null || true
  git commit -m "chore: update tunnel URL — $TUNNEL_URL" 2>/dev/null || true
  git push -u origin HEAD 2>/dev/null || true
fi

echo ""
echo "✅ Live bridge active at: $TUNNEL_URL"
echo ""
echo "Endpoints:"
echo "  $TUNNEL_URL/health"
echo "  $TUNNEL_URL/dispatches"
echo "  $TUNNEL_URL/budget"
echo "  $TUNNEL_URL/queue"
echo "  $TUNNEL_URL/tgch"
echo ""
echo "Press Ctrl+C to stop."

# Cleanup on exit
cleanup() {
  echo "Shutting down..."
  kill $API_PID 2>/dev/null || true
  kill $CF_PID  2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

# Keep running, tail logs
tail -f "$LOG_DIR/api-server.log" &
wait $CF_PID
