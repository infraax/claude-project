# INFRASTRUCTURE.md
# infraax/claude-project — Free Tier Registry
# Last updated: 2026-03-28
# Owner: Dexter (infraax)
# Purpose: Single source of truth for all free-tier services.
#          Agents MUST read this before deploying, storing, or querying anything.
#          Check limits before use. Never exceed free tier without owner approval.

---

## How to read this file

Each service entry has:
- **Env var(s)**: the variable names in .env that hold credentials
- **Free limits**: exact quotas — hard numbers only
- **Resets**: when the quota refreshes
- **CC required**: whether a credit card was needed to sign up
- **Status**: ACTIVE (key set) | CONFIGURED (key not yet set) | UNUSED
- **Agent notes**: what agents are and aren't allowed to do with this service

---

## COMPUTE & SANDBOXES

### Alibaba AgentBay (Wuying)
- **Env vars**: `ALIBABA_AGENTBAY_API_KEY`, `AGENTBAY_API_KEY`
- **MCP SSE**: `ALIBABA_OPENAPI_MCP_SSE`, `ALIBABA_OPENAPI_MCP_HTTP`
- **Free limits**:
  - 5 concurrent sandbox sessions
  - 60 min/session timeout (auto-terminate)
  - Images: linux_latest, code_latest, browser_latest, windows-server-2022, android-12, openclaw-ubuntu-2204
- **CC required**: No (Alibaba Cloud international free tier)
- **Status**: ACTIVE
- **Agent notes**: PRIMARY sandbox environment for Claude Code. Use `code_latest` for coding tasks, `linux_latest` for shell-only tasks. Do NOT leave sessions idle — terminate after task completes to preserve quota.

### GitHub Codespaces
- **Env vars**: none (uses GitHub OAuth)
- **Free limits**:
  - 120 core-hours/month (personal account)
  - 15 GB storage/month
  - 2-core machine default
- **Resets**: Monthly
- **CC required**: No
- **Status**: CONFIGURED
- **Agent notes**: Use for tasks requiring persistent filesystem between sessions. Do NOT use for long-running compute — it burns core-hours fast. Prefer AgentBay for disposable sandboxes.

---

## AI / LLM SERVICES

### Anthropic Claude API
- **Env vars**: `ANTHROPIC_API_KEY`
- **Free limits**: None — pay-as-you-go Tier 1
- **Budget**: $100/month hard cap (set in Anthropic console)
- **Spent (March 2026)**: $1.11 of $100 (1.1%)
- **Rate limits**: 50 req/min, 50K tokens/min (Haiku); 5 req/min, 40K tokens/min (Sonnet)
- **Models in use**:
  - `claude-haiku-4-5-20251001` — dispatch (cheapest, cached)
  - `claude-sonnet-4-6` — research/cache testing
- **Cache threshold**: Haiku 4096 tokens (✅ MET at 4213), Sonnet 1024 tokens (✅ MET)
- **CC required**: Yes (Tier 1 API)
- **Status**: ACTIVE
- **Agent notes**: Always use Haiku for dispatch tasks. Sonnet only for research/analysis. Log every dispatch to research.db. Check `scripts/cost-dashboard.sh` before running large batches.

### Cohere
- **Env vars**: `COHERE_API_KEY`, `COHERE_TRIAL_KEY`, `COHERE_VAULT_URL`
- **Free limits** (Trial key):
  - 1000 API calls/month
  - Embed, Generate, Rerank, Classify
  - No SLA
- **Trial key expiry**: 2026-04-03 — ROTATE before this date
- **CC required**: No (trial)
- **Status**: ACTIVE (trial)
- **Agent notes**: Use for embedding tasks only — preserve call budget. Do NOT use for generation (use Anthropic). Trial key expires 2026-04-03, upgrade or rotate.

### Alibaba Model Studio (DashScope)
- **Env vars**: `ALIBABA_MODEL_STUDIO_KEY`
- **Free limits**:
  - Qwen models: 1M free tokens/month
  - Embedding: 1M tokens/month free
- **CC required**: No
- **Status**: CONFIGURED
- **Agent notes**: Backup LLM. Use if Anthropic budget is running low at month end.

### Hugging Face
- **Env vars**: `HF_TOKEN_READ`, `HF_TOKEN_WRITE`
- **Space**: `Infraxx/claude`
- **Free limits**:
  - Inference API: ~1000 requests/day (rate limited)
  - HF Spaces: unlimited (CPU basic, sleeps after 48h inactive)
  - Datasets/Models: 1 GB storage free
- **CC required**: No
- **Status**: ACTIVE
- **Agent notes**: Use HF Spaces to host lightweight demos. Do NOT use Inference API for production — too rate-limited. Use for model downloads/testing only.

### Google Vertex AI Express
- **Env vars**: `VERTEX_SA_EMAIL`, `VERTEX_EXPRESS_KEY`, `GOOGLE_PROJECT_ID`
- **Project**: `dexter-ai-identity`
- **Free limits**:
  - Gemini Flash: 1M tokens/day free (Vertex Express tier)
  - Gemini Pro: 60 requests/minute free
- **CC required**: Yes (GCP account required, but Express tier has no charge)
- **Status**: CONFIGURED
- **Agent notes**: Available as Gemini fallback. Use Flash for cheap high-volume tasks.

---

## VECTOR STORES

### Pinecone
- **Env vars**: `PINECONE_API_KEY`
- **Free limits**:
  - 2 GB storage
  - 1M read units/month
  - 2M write units/month
  - 5 serverless indexes
  - 100 namespaces/index
  - 2 organization members
- **Resets**: Monthly (read/write units)
- **CC required**: No
- **Status**: ACTIVE
- **Agent notes**: PRIMARY vector store. Use `serverless` index type only (free tier). Namespace by project: `claude-project`, `research`, `ablation`. Check read unit balance before batch operations.

### Qdrant Cloud
- **Env vars**: `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_MANAGEMENT_KEY`
- **Cluster**: `81c822d4-9430-4dcd-804e-33ae15ac1f54.eu-central-1-0.aws.cloud.qdrant.io`
- **Free limits**:
  - 1 GB RAM / 1 vCPU cluster
  - 0.5 GB disk
  - 1 free cluster
- **CC required**: No
- **Status**: ACTIVE
- **Agent notes**: SECONDARY vector store / fallback. Use for experimental collections. Do NOT store large datasets here (0.5 GB disk limit).

---

## DATABASES

### Neon (Postgres)
- **Env vars**: `NEON_API_KEY`, `NEON_CONNECTION_STRING`, `NEON_AUTH_URL`, `NEON_JWKS_URL`
- **Auth endpoint**: `ep-snowy-waterfall-agrzeu8g.neonauth.c-2.eu-central-1.aws.neon.tech`
- **Free limits**:
  - 0.5 GB storage
  - 1 project
  - Unlimited databases
  - Auto-suspend after 5 min idle (cold start ~500ms)
  - 100 hours compute/month
- **CC required**: No
- **Status**: ACTIVE
- **Agent notes**: Use for structured app data. Auth endpoint wired for JWT/JWKS auth. research.db (SQLite local) remains PRIMARY for pipeline telemetry — Neon for user/app data.

### Alibaba PolarDB
- **Env vars**: `ALIBABA_POLARDB_CLUSTER_ID`, `ALIBABA_POLARDB_REGION`
- **Cluster**: `pc-4xo53hr0vn192cmd9` (eu-central-1)
- **Free limits**: Free trial tier (check Alibaba console for expiry)
- **CC required**: No (international account)
- **Status**: CONFIGURED
- **Agent notes**: Available but not in active use. Check free tier expiry before relying on this.

### Firebase Realtime / Firestore
- **Env vars**: `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID` (claude-1bf44)
- **Free limits (Spark plan)**:
  - Firestore: 1 GB storage, 50K reads/day, 20K writes/day, 20K deletes/day
  - Realtime DB: 1 GB storage, 10 GB/month transfer
  - Cloud Storage: 5 GB storage, 1 GB/day download
  - Hosting: 10 GB/month transfer, 1 GB storage
  - Functions: 125K invocations/month, 40K GB-seconds/month
  - Auth: Unlimited users (email/Google)
- **CC required**: No (Spark plan)
- **Status**: CONFIGURED
- **Agent notes**: Use Firebase Hosting for static deploys. Firestore for real-time app data. Do NOT exceed 50K reads/day — check dashboard.

---

## MESSAGING / QUEUES

### Upstash Redis
- **Env vars**: `UPSTASH_REDIS_KEY`
- **Free limits**:
  - 10K commands/day
  - 256 MB storage
  - 1 database
- **Resets**: Daily (commands)
- **CC required**: No
- **Status**: ACTIVE
- **Agent notes**: Use for caching hot data (last N dispatch results, rate limit counters). Do NOT use as primary store — 10K cmd/day runs out fast under load.

### Upstash QStash
- **Env vars**: `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`
- **URL**: `qstash-eu-central-1.upstash.io`
- **Free limits**:
  - 500 messages/day
  - 3 topics
  - HTTPS delivery to any endpoint
- **Resets**: Daily
- **CC required**: No
- **Status**: ACTIVE
- **Agent notes**: Use for async task dispatch (webhook-style). Each dispatch task = 1 message. At 500/day limit and typical 10 tasks/session, this covers 50 sessions/day — fine for current load.

### Alibaba RabbitMQ (via MCP)
- **Env vars**: `ALIBABA_RABBITMQ_MCP_SSE`, `ALIBABA_RABBITMQ_MCP_HTTP`
- **Free limits**: Free tier via Alibaba Cloud (check console for quota)
- **Status**: CONFIGURED
- **Agent notes**: Available as queue fallback. Not in active pipeline yet.

---

## CDN / EDGE / HOSTING

### Cloudflare (Free plan)
- **Env vars**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_GLOBAL_KEY`, `CLOUDFLARE_READ_TOKEN`, `CLOUDFLARE_ORIGIN_CA_KEY`
- **Account**: `6e76b36bcc7c2f4a599bf40f8cc79f1c`
- **Free limits**:
  - Workers: 100K requests/day, 10ms CPU/request
  - Pages: Unlimited requests, 500 builds/month, 1 build at a time
  - KV: 100K reads/day, 1K writes/day, 1K deletes/day, 1 GB storage
  - R2: 10 GB storage, 1M Class-A ops/month, 10M Class-B ops/month
  - D1 (SQLite): 5M reads/day, 100K writes/day, 5 GB storage
  - Queues: 1M messages/month
  - AI Gateway: Unlimited (logging/caching proxy for Anthropic calls)
  - DNS: Unlimited
  - CDN/Cache: Unlimited bandwidth
  - Tunnels (cloudflared): Free, unlimited
- **CC required**: No
- **Status**: ACTIVE
- **Agent notes**: PRIMARY edge layer. Workers for API endpoints, Pages for static hosting, KV for config/rate-limit data, R2 for blob storage, D1 as edge SQLite. AI Gateway should wrap ALL Anthropic API calls for logging + caching.

### GitHub Pages
- **Free limits**:
  - Unlimited bandwidth (public repos)
  - 1 GB storage
  - Custom domains supported
- **URL**: `https://infraax.github.io/claude-project/`
- **Status**: ACTIVE
- **Agent notes**: Use for static dashboards/docs. Currently hosts the pipeline dashboard.

### HuggingFace Spaces
- **Free limits**: CPU Basic tier, unlimited requests, sleeps after 48h inactive
- **Status**: CONFIGURED (`Infraxx/claude`)
- **Agent notes**: Available for demo hosting. Auto-wakes on request (cold start ~30s).

---

## DEVOPS / CI

### GitHub Actions
- **Free limits** (public repo or personal account):
  - 2000 minutes/month
  - Concurrent jobs: 20
  - Storage: 500 MB artifacts
- **Resets**: Monthly
- **CC required**: No
- **Status**: ACTIVE
- **Agent notes**: Use for CI only — not for long compute jobs. Security Guardian workflow runs on every push/PR. Currently consuming ~2 min/run. At 2000 min/month = ~1000 runs budget.

### GitLab CI
- **Env vars**: `GITLAB_ACCESS_TOKEN`, `GITLAB_FEED_TOKEN`, `GITLAB_SCIM_TOKEN`
- **Free limits**:
  - 400 CI minutes/month (shared runners)
  - 5 GB storage
- **Status**: CONFIGURED
- **Agent notes**: Available as GitHub Actions fallback. Not currently in active pipeline.

### Gitpod
- **Env vars**: `GITPOD_TOKEN`
- **Free limits**: 50 hours/month (personal)
- **Status**: CONFIGURED
- **Agent notes**: Available as dev environment. Prefer AgentBay for agent sandboxes.

---

## SOURCE CONTROL

### GitHub (Free)
- **Free limits**:
  - Unlimited public/private repos
  - Community support, Dependabot alerts
  - 500 MB Packages storage
  - 2000 Actions minutes/month
  - GitHub Pages (public repos)
- **Status**: ACTIVE (primary)

### GitLab
- **Free limits**:
  - Unlimited repos
  - 400 CI minutes/month
  - 5 GB storage
  - Container Registry
- **Status**: CONFIGURED (backup)

### Bitbucket
- **Env vars**: `BITBUCKET_API_TOKEN`
- **Free limits**: 5 users, unlimited repos, 50 CI minutes/month (Pipelines)
- **Status**: CONFIGURED (backup)

---

## MONTHLY QUOTA SUMMARY TABLE

| Service | Key Metric | Monthly Free Limit | Resets | Status |
|---------|-----------|-------------------|--------|--------|
| Anthropic API | Cost | $100 budget cap | Monthly | $1.11 spent |
| GitHub Actions | CI minutes | 2,000 min | Monthly | ~50 used |
| Codespaces | Core-hours | 120 hrs | Monthly | Minimal use |
| Pinecone | Read units | 1M | Monthly | Monitor |
| Pinecone | Write units | 2M | Monthly | Monitor |
| Upstash Redis | Commands | 10K/day | Daily | Monitor |
| Upstash QStash | Messages | 500/day | Daily | Monitor |
| Cloudflare Workers | Requests | 100K/day | Daily | Low use |
| Cloudflare KV | Reads | 100K/day | Daily | Low use |
| Cloudflare KV | Writes | 1K/day | Daily | Low use |
| Firebase Firestore | Reads | 50K/day | Daily | Unused |
| Firebase Firestore | Writes | 20K/day | Daily | Unused |
| Neon | Compute hours | 100 hrs | Monthly | Low use |
| Cohere Trial | API calls | 1K | Monthly | Expires 2026-04-03 |
| GitLab CI | CI minutes | 400 min | Monthly | Unused |

---

## DEPLOYMENT TARGETS (where agents can deploy to)

| Target | Type | Command | Notes |
|--------|------|---------|-------|
| Cloudflare Pages | Static hosting | `npx wrangler pages deploy` | Primary static host |
| Cloudflare Workers | Edge functions | `npx wrangler deploy` | API endpoints |
| GitHub Pages | Static hosting | Push to `gh-pages` branch | Dashboard |
| Firebase Hosting | Static hosting | `firebase deploy --only hosting` | Backup |
| HF Spaces | App hosting | `git push hf-spaces` | Demo apps |
| Alibaba AgentBay | Sandbox | SDK `createSession()` | Ephemeral compute |

---

## AGENT DEPLOYMENT RULES

1. **Always check this file before deploying** — confirm the target has free capacity
2. **Never deploy to paid tiers** without explicit owner (Dexter) approval
3. **Cloudflare is preferred** for all edge/API deployments — most generous free tier
4. **Log usage** — after any batch operation update `data/usage-snapshot.json`
5. **Alert if approaching 80% of any daily limit** — write a warning to console and HANDOFF.md
6. **Cohere trial key expires 2026-04-03** — do not start new Cohere-dependent features without rotation
