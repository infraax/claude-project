# Skill: infra-monitor

## When to use this skill
Load this skill BEFORE any of the following operations:
- Deploying to Cloudflare Workers, Pages, or KV
- Running batch vector operations on Pinecone or Qdrant
- Sending messages via Upstash QStash
- Running ablation batches (Anthropic API cost)
- Starting AgentBay sandbox sessions
- Any operation that consumes free-tier quota

## Quick usage pattern

```typescript
// Step 1: Check budget warnings first (fast)
const warnings = await use_mcp_tool("infra-monitor", "get_budget_warning", {});
if (warnings.includes("CRITICAL")) {
  // STOP — report to user, do not proceed
  throw new Error(`Infrastructure budget exceeded: ${warnings}`);
}

// Step 2: Check specific service before use
const pineconeStatus = await use_mcp_tool("infra-monitor", "check_pinecone", {});
// Read the index counts and fullness before writing

// Step 3: After batch operation, log usage
await use_mcp_tool("infra-monitor", "log_usage", {
  service: "pinecone",
  metric: "write_units",
  value: 5000,
  context: "ablation v3 embedding run"
});
```

## Available tools

| Tool | When to call | Key output |
|------|-------------|-----------|
| `get_infra_status` | Session start, before any deployment | Full registry with limits |
| `get_budget_warning` | Before any batch operation | CRITICAL/MONITOR/OK per service |
| `check_pinecone` | Before vector read/write batches | Index count, vector count, fullness |
| `check_upstash` | Before queue/cache operations | Command counts |
| `check_cloudflare` | Before Worker/KV/Pages deploys | Worker list, KV namespaces |
| `check_neon` | Before DB operations | Connection status |
| `log_usage` | After any quota-consuming operation | Persists to research.db + snapshot |

## Decision rules

- If any service is CRITICAL (>80% limit): **STOP**, report to user, await instructions
- If any service is MONITOR (>50% limit): proceed but note in HANDOFF.md
- If Cohere trial is expired or <7 days: flag it, do not start new Cohere features
- If Pinecone at 5/5 indexes: do not create new indexes — reuse or ask owner
- If Upstash QStash at >400/500 daily messages: defer non-urgent tasks to next day
- If Anthropic >$80: use Haiku only, no Sonnet, reduce batch sizes

## INFRASTRUCTURE.md
Full service specs, limits, and deployment rules live at:
  /INFRASTRUCTURE.md

Read it at session start. It is the authoritative reference for all free-tier limits.
