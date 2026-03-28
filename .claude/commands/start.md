# start — Session bootstrap

Run this at the start of every session to unlock secrets, load .env, and start the API bridge.

## Bootstrap (unlock + load all secrets)
```bash
source scripts/bootstrap.sh
```

Detects environment (MacBook / Sandbox / Codespaces / Actions), installs git-crypt if missing,
unlocks .env, loads all secrets, installs missing tools, verifies npm deps.

## Start live API bridge (optional)
```bash
bash scripts/start-live-bridge.sh &
```

After ~10 seconds:
```bash
cat data/tunnel.json   # public cloudflared URL
```

## Environment detection
```bash
bash scripts/detect-env.sh --print
```

## Dual-env cheat sheet

| Environment | Command |
|-------------|---------|
| MacBook | `source scripts/bootstrap.sh` |
| Sandbox / Claude Code | `source scripts/bootstrap.sh` |
| Codespaces | auto-runs on open via devcontainer.json |
| GitHub Actions | unlock step in workflow → `npm ci` |

If secrets missing after bootstrap:
- Option A: `.keys/git-crypt-master.key` must be present (copy from iCloud)
- Option B: `export GIT_CRYPT_KEY_B64=<base64-key>` then re-run bootstrap
