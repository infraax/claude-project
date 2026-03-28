# Skill: deploy-cloudflare

## When to load
Before deploying anything to Cloudflare Workers, Pages, KV, R2, or D1.

## Pre-deploy checklist (always run first)

```python
# 1. Check quota via infra-monitor
use_mcp_tool("infra-monitor", "check_cloudflare", {})
# Verify: workers < limit, KV writes today < 1000, pages builds this month < 500

# 2. Check budget warning
use_mcp_tool("infra-monitor", "get_budget_warning", {})
```

## Required env vars

```bash
CLOUDFLARE_API_TOKEN      # scoped: Workers, Pages, KV, R2, D1 (edit)
CLOUDFLARE_ACCOUNT_ID     # 6e76b36bcc7c2f4a599bf40f8cc79f1c
```

## Deploy: Cloudflare Workers

```bash
# Deploy worker from src file
npx wrangler deploy src/worker.ts --name my-worker

# Deploy with env vars (use wrangler.toml for persistent config)
npx wrangler deploy --env production

# Tail live logs
npx wrangler tail my-worker

# Check worker exists
npx wrangler list
```

`wrangler.toml` minimal config:
```toml
name = "claude-project-api"
main = "src/worker.ts"
compatibility_date = "2024-01-01"
account_id = "6e76b36bcc7c2f4a599bf40f8cc79f1c"

[vars]
ENVIRONMENT = "production"
```

## Deploy: Cloudflare Pages (static)

```bash
# Deploy public/ directory to Pages
npx wrangler pages deploy public/ --project-name claude-project

# First-time project creation
npx wrangler pages project create claude-project

# List projects
npx wrangler pages project list
```

Pages also auto-deploys via `dashboard.yml` GitHub Actions on push to main.

## KV: read/write patterns

```bash
# CLI
npx wrangler kv key put --binding=MY_KV "key" "value"
npx wrangler kv key get --binding=MY_KV "key"
npx wrangler kv key list --binding=MY_KV

# In Worker code
const value = await env.MY_KV.get("key");
await env.MY_KV.put("key", "value", { expirationTtl: 3600 });
```

Free tier: 100K reads/day · 1K writes/day · 1K deletes/day · 1 GB storage

## D1 (edge SQLite): query patterns

```bash
# Create database
npx wrangler d1 create claude-project-db

# Run SQL
npx wrangler d1 execute claude-project-db --command "SELECT * FROM dispatches LIMIT 5"
npx wrangler d1 execute claude-project-db --file schema.sql
```

Free tier: 5M reads/day · 100K writes/day · 5 GB storage

## R2 (blob storage): patterns

```bash
# Create bucket
npx wrangler r2 bucket create claude-artifacts

# Upload file
npx wrangler r2 object put claude-artifacts/path/to/file.json --file local-file.json

# List objects
npx wrangler r2 object list claude-artifacts
```

Free tier: 10 GB storage · 1M Class-A ops/month · 10M Class-B ops/month

## Rollback

```bash
# List deployments
npx wrangler deployments list

# Roll back to previous
npx wrangler rollback
```

## After deploy — log usage

```python
use_mcp_tool("infra-monitor", "log_usage", {
    "service": "cloudflare_pages",
    "metric": "builds",
    "value": 1,
    "context": "dashboard deploy from feat/xyz"
})
```

## MCP tools available (Cloudflare MCP server)

The session has a Cloudflare MCP server connected with tools:
`workers_list`, `workers_get_worker`, `workers_get_worker_code`,
`kv_namespaces_list`, `kv_namespace_create`, `kv_namespace_get`,
`r2_buckets_list`, `r2_bucket_create`, `d1_databases_list`, `d1_database_query`,
`search_cloudflare_documentation`

Use these for inspection and live queries before/after deploys.
