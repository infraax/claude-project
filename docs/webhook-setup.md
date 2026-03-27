# Webhook Configuration (Manual — GitHub Settings UI)

## Webhook 1: Pipeline Status Notifications

- **URL:** https://infraax.github.io/claude-project/webhook-receiver
  (placeholder — update when Supabase/tunnel is live)
- **Content type:** application/json
- **Secret:** generate with: `openssl rand -hex 32`
  Store as repo secret: `WEBHOOK_SECRET`
- **Events to send:**
  - [x] Push
  - [x] Workflow runs
  - [x] Releases
  - [x] Deployments

## Triggering Webhooks FROM Claude Code to GitHub Actions

Claude Code can trigger the `repository_dispatch` webhook with:

```bash
curl -X POST \
  -H "Authorization: Bearer $GITHUB_PAT" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/infraax/claude-project/dispatches \
  -d '{"event_type":"export-data","client_payload":{"source":"claude-code"}}'
```

**Setup:**
1. Add `GITHUB_PAT` to `.env` (Personal Access Token with `repo` scope)
2. This is how Claude Code can trigger GitHub Actions remotely

**Available event types:**
- `run-ablation` — Trigger ablation pipeline
- `export-data` — Export pipeline data to gh-pages
- `cache-smoke-test` — Run cache validation
- `deploy-dashboard` — Trigger dashboard deployment
