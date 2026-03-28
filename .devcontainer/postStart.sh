#!/bin/bash
# postStart.sh — runs every time the Codespace starts (or resumes)
set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo ""
echo "── claude-project Codespace resuming ──"

# ── Re-unlock secrets if needed ───────────────────────────────────────────
if [ -n "${GIT_CRYPT_KEY_B64:-}" ]; then
  if ! git-crypt status 2>/dev/null | grep -q "unlocked" 2>/dev/null; then
    echo "$GIT_CRYPT_KEY_B64" | base64 -d > /tmp/gc.key
    git-crypt unlock /tmp/gc.key 2>/dev/null && echo "✅ git-crypt unlocked"
    rm -f /tmp/gc.key
  fi
fi

# ── Load .env ─────────────────────────────────────────────────────────────
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# ── Auto-start live API bridge (use case #2) ──────────────────────────────
if [ "${AUTOSTART_BRIDGE:-true}" = "true" ]; then
  echo "── Starting live API bridge ──"
  mkdir -p data

  # Start api-server in background if not running
  if ! pgrep -f "api-server.js\|ts-node.*api-server" >/dev/null 2>&1; then
    if [ -f dist/api-server.js ]; then
      nohup node dist/api-server.js > /tmp/api-server.log 2>&1 &
    else
      nohup npx tsx src/api-server.ts > /tmp/api-server.log 2>&1 &
    fi
    sleep 1
    echo "✅ API server started (port 3000)"
  else
    echo "✅ API server already running"
  fi

  # Start cloudflared tunnel
  if ! pgrep -f cloudflared >/dev/null 2>&1; then
    nohup cloudflared tunnel --url http://localhost:3000 \
      --logfile /tmp/cloudflared.log 2>&1 &
    # Wait for tunnel URL (up to 10s)
    for i in $(seq 1 10); do
      TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' /tmp/cloudflared.log 2>/dev/null | head -1)
      if [ -n "$TUNNEL_URL" ]; then
        echo "$TUNNEL_URL" > data/tunnel.url
        echo "{\"url\":\"$TUNNEL_URL\",\"started\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > data/tunnel.json
        echo "✅ Tunnel active: $TUNNEL_URL"
        break
      fi
      sleep 1
    done
    if [ -z "${TUNNEL_URL:-}" ]; then
      echo "⚠️  Tunnel URL not yet available — check: cat /tmp/cloudflared.log"
    fi
  else
    EXISTING=$(cat data/tunnel.url 2>/dev/null || echo "unknown")
    echo "✅ Tunnel already running: $EXISTING"
  fi
fi

echo ""
echo "  cc            → Launch Claude Code with MCP"
echo "  bridge-url    → Show live API URL"
echo "  ablate-full   → Run full_system ablation"
echo ""
