# start — Launch live API bridge

Run bash scripts/start-live-bridge.sh in background at session start.

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
