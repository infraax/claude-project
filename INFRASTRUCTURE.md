# Infrastructure Catalog — claude-project
Last updated: 2026-03-27

> This file is safe to commit. All credentials are in `.env` (gitignored).
> Credential files live in `.google/` (gitignored) and `INFRA/` (gitignored).

## Source Control
- **GitHub**: infraax account — Pages live at https://infraax.github.io/claude-project/
- **GitLab**: infraax-group — Ultimate trial (30 days), SCIM provisioned, 50K CI min/trial
- **Bitbucket**: Free tier, 50 build min/month, unlimited private repos

## Cloud Compute

### AWS
- Account: `714930738710`
- Credits: ~$150
- CloudFront key pair configured (signing key in `.google/cloudfront/`)
- IAM credentials: `env AWS_ACCESS_KEY_ID` / `env AWS_SECRET_ACCESS_KEY`

### Alibaba Cloud (highest compute allocation)
- **AgentBay**: 10 simultaneous AI agent sessions, 100 CU points, 100GiB storage, 1yr validity
  - Images available: Ubuntu 22.04 (ComputerUse), Debian 12 (CodeSpace), Debian 12 (BrowserUse), Windows Server 2022, Android 12, OpenClaw Linux
  - `env ALIBABA_AGENTBAY_API_KEY` / `env ALIBABA_AGENTBAY_SSE_URL`
- **PolarDB**: Frankfurt cluster `pc-4xo53hr0vn192cmd9`, Enterprise PostgreSQL-compatible
- **Function Compute**: Trial plan active
- **Model Studio**: Qwen family models — workspace `ws-5319gw8vd0n77z95` (EU Central)
  - `env ALIBABA_MODEL_STUDIO_KEY`
- **OpenAPI MCP Server**: SSE endpoint — `env ALIBABA_OPENAPI_MCP_SSE`
- **RabbitMQ**: MCP-connected queue — `env ALIBABA_RABBITMQ_MCP_SSE`

### Google Cloud
- Project: `dexter-ai-identity`
- Service account: `claude@dexter-ai-identity.iam.gserviceaccount.com`
- Key file: `.google/service-account.json` (gitignored)
- Vertex AI Express configured — `env GOOGLE_API_KEY` / `env VERTEX_SA_EMAIL`
- OAuth Client: `env GOOGLE_OAUTH_CLIENT_ID` / `env GOOGLE_OAUTH_CLIENT_SECRET`

### Firebase
- Project: `claude-1bf44`
- Hosting: https://claudeproject.web.app (alternative to GitHub Pages)
- Admin SDK: `.google/firebase-adminsdk.json` (gitignored)
- Web config: `env FIREBASE_API_KEY` / `env FIREBASE_APP_ID` / `env FIREBASE_MEASUREMENT_ID`

## Databases

### Pinecone (vector)
- 2GB storage, 5 indexes, 1M reads, 2M writes/month
- `env PINECONE_API_KEY`

### Qdrant Cloud (vector) — EU Frankfurt
- Cluster: `81c822d4-9430-4dcd-804e-33ae15ac1f54.eu-central-1-0.aws.cloud.qdrant.io`
- `env QDRANT_URL` / `env QDRANT_API_KEY`

### Neon (PostgreSQL serverless) — EU Central
- 10 branches, 100 compute units, 0.5GB storage
- JWT auth endpoint configured
- `env NEON_API_KEY` / `env NEON_CONNECTION_STRING`

### Alibaba PolarDB — Frankfurt (enterprise)
- Cluster: `pc-4xo53hr0vn192cmd9`, PostgreSQL / Oracle 2.0 compatible
- Access via VPC `vpc-gw8mo6650hw32gwi43oqa`

## AI / ML APIs

### Cohere
- Trial key (expires 2026-04-03): `env COHERE_TRIAL_KEY`
- Production key: `env COHERE_API_KEY`
- Private Vault: `env COHERE_VAULT_URL` (deployed models: embed-multilingual-v3.0, rerank-v3.5, sparse-multilingual-v1.0)
- Use case: embeddings for RAG, reranking dispatch results

### Hugging Face
- READ token: `env HF_TOKEN_READ`
- WRITE token: `env HF_TOKEN_WRITE`
- Space: https://huggingface.co/spaces/Infraxx/claude (Gradio, 2vCPU/16GB free CPU)

### Alibaba Model Studio
- Qwen family models, EU Central workspace
- `env ALIBABA_MODEL_STUDIO_KEY`

## Queue / Messaging

### Upstash QStash — EU Central
- HTTP-triggered async jobs with signed delivery
- `env QSTASH_URL` / `env QSTASH_TOKEN` / signing keys

### Upstash Redis
- KV store, ~10K commands/day free
- `env UPSTASH_REDIS_KEY`

### Alibaba RabbitMQ
- MCP-connected message queue
- `env ALIBABA_RABBITMQ_MCP_SSE`

## CDN / Edge / DNS

### Cloudflare — full account
- Services: Workers, R2, D1, KV, Pages, Queues, AI Gateway, Vectorize, Workers AI, Tunnels, Zero Trust, Pub/Sub, Containers, Calls, Hyperdrive, DNS, WAF
- `env CLOUDFLARE_API_TOKEN` / `env CLOUDFLARE_GLOBAL_KEY` / `env CLOUDFLARE_ACCOUNT_ID`
- Primary use: Workers (API gateway) + R2 (object storage) + D1 (edge SQLite) + cloudflared tunnel

## Dev Environments

### Gitpod
- Personal access token: `env GITPOD_TOKEN`

## Secret Storage Strategy

Three layers — all environments covered:

| Layer | Location | Used by |
|-------|----------|---------|
| `.env` local | MacBook only, gitignored | Claude Code local sessions |
| GitHub Secrets | Repo settings → Secrets | GitHub Actions CI + Codespaces |
| Cloudflare Workers Secrets | Cloudflare dashboard | Workers API, runtime edge |

## Architecture Overview

```
Users → Firebase Hosting / Cloudflare Pages / HuggingFace Spaces
      → Cloudflare Edge (Workers, Tunnel, Zero Trust, KV, D1, R2, AI Gateway)
      → Database Layer (Neon PostgreSQL, Firebase Firestore, Alibaba PolarDB)
      → Queue Layer (Upstash QStash, Upstash Redis, Alibaba RabbitMQ)
      → Agent Compute (Alibaba AgentBay — 10 simultaneous VMs)
      → Vector/AI Layer (Pinecone, Qdrant, Cohere, Claude, Qwen, HuggingFace)
      → CI/CD (GitHub Actions → Firebase + Cloudflare deploy)
```

## Build Order (4 weeks)

**Week 1 — Foundation**
1. Migrate `research.db` → Neon PostgreSQL
2. Cloudflare Worker as API proxy → Neon → JSON
3. Deploy dashboard to Firebase Hosting
4. Firebase Firestore for realtime dispatch event streaming

**Week 2 — Intelligence**
5. Cohere embed in dispatch-runner (embed every task body)
6. Store embeddings in Pinecone with task metadata
7. Cohere Rerank on dispatch result candidates
8. LLMLingua warming via Pinecone pattern matching

**Week 3 — Scale**
9. Alibaba AgentBay `code_latest` as persistent dispatch target
10. QStash for scheduled ablation triggers
11. Cloudflare AI Gateway proxy for all AI calls

**Week 4 — VectorBrain**
12. Qdrant collection for robot memory
13. HuggingFace Space FastAPI + Gradio
14. VectorBrain observation pipeline: Cohere Embed → Qdrant
