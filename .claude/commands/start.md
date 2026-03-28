# start — Launch live API bridge

## Step 0 — Unlock secrets (run first)
```bash
# Unlock git-crypt if key is present
if command -v git-crypt &>/dev/null && [ -f .keys/git-crypt-master.key ]; then
  git-crypt unlock .keys/git-crypt-master.key 2>/dev/null && echo "✅ git-crypt unlocked — .env decrypted" || echo "⚠️  git-crypt already unlocked"
elif [ -n "$GIT_CRYPT_KEY_B64" ]; then
  sudo apt-get install -y git-crypt -q 2>/dev/null
  echo "$GIT_CRYPT_KEY_B64" | base64 -d > /tmp/gc.key
  git-crypt unlock /tmp/gc.key && echo "✅ git-crypt unlocked via GIT_CRYPT_KEY_B64" || true
  rm -f /tmp/gc.key
else
  echo "⚠️  git-crypt key not found — .env may still be encrypted"
  echo "   Fix: copy .keys/git-crypt-master.key from iCloud or set GIT_CRYPT_KEY_B64"
fi

set -a; source .env 2>/dev/null; set +a
echo "✅ Secrets loaded: $(grep -v '^#' .env | grep -v '^$' | grep '=.' | wc -l | tr -d ' ') keys"
```

## Step 1 — Start the live API bridge
```bash
bash scripts/start-live-bridge.sh &
```

This starts:
1. `node dist/api-server.js` on port 3000
2. `cloudflared tunnel --url http://localhost:3000` for public HTTPS access
3. Writes `data/tunnel.json` with the public URL and commits/pushes it

After ~10 seconds, check the tunnel URL:
```bash
cat data/tunnel.json
```

Endpoints available once tunnel is up:
- `GET /health` — liveness check
- `GET /dispatches` — recent dispatches from research.db
- `GET /budget` — token cost summary by model
- `GET /queue` — pending dispatch queue
- `GET /tgch` — TGCH layer status with cache hit rates
