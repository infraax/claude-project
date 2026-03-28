# Skill: cost-control

## When to load
Before any multi-task batch, ablation run, or loop that calls the Claude API more than ~5 times.

## Pricing (Haiku 4.5 — primary dispatch model)

| Token type | Cost |
|-----------|------|
| Input | $1.00 / 1M tokens |
| Output | $5.00 / 1M tokens |
| Cache write | $1.25 / 1M tokens (one-time) |
| Cache read | $0.10 / 1M tokens (90% saving vs input) |

**Sonnet 4.6** (research/analysis only): ~5–10× more expensive than Haiku. Never use for dispatch.

## Cost estimation before a run

```python
# Quick estimate for N dispatch tasks:
avg_input_tokens  = 4500   # typical cached dispatch (4213 stable prefix + ~300 task)
avg_output_tokens = 800    # typical agent response

cache_read_cost  = (avg_input_tokens * 0.9 * N) / 1e6 * 0.10   # 90% of input is cache
cache_miss_cost  = (avg_input_tokens * 0.1 * N) / 1e6 * 1.00   # 10% uncached
output_cost      = (avg_output_tokens * N) / 1e6 * 5.00
total_estimate   = cache_read_cost + cache_miss_cost + output_cost
# e.g. N=10: ~$0.05   N=100: ~$0.50   N=1000: ~$5.00
```

## Check current month spend before a batch

```bash
bash scripts/cost-dashboard.sh
```

Or query directly:
```sql
SELECT
  SUM(cost_usd) as total_spent,
  COUNT(*) as dispatches,
  AVG(tokens_cache_read * 1.0 / tokens_total_input) as cache_hit_rate
FROM dispatch_observations
WHERE ts > strftime('%Y-%m-%d', 'now', 'start of month');
```

## Hard limits and abort rules

| Threshold | Action |
|-----------|--------|
| Spend > $80 | STOP — use Haiku only, halve batch sizes, report to user |
| Spend > $50 | MONITOR — log warning, continue with caution |
| Cache hit rate < 70% | Investigate stable prefix — something broke prefix determinism |
| Single dispatch > $0.10 | Something is wrong — output token count is too high |

## Model selection rules

```python
# CORRECT
model = "claude-haiku-4-5-20251001"  # dispatch tasks
model = "claude-sonnet-4-6"           # research/ablation analysis only

# WRONG — never do this for dispatch
model = "claude-sonnet-4-6"   # for routine dispatch tasks
model = "claude-opus-4-6"     # for anything in this repo
```

## Prompt cache — how it works here

The stable prefix is built from: CLAUDE.md + AGENT_STATE.md + phase file.
- Must exceed 4096 tokens for Haiku cache activation (currently at ~4213 ✅)
- Must be **identical bytes** across calls — any change invalidates all cached entries
- Cache write cost is one-time; subsequent reads are 10× cheaper

If cache hit rate drops suddenly:
1. Check if CLAUDE.md or AGENT_STATE.md was modified
2. Check if phase file changed
3. `grep "tokens_cache_read" data/research.db` to confirm

## After any batch — log cost

```python
# Always log so infra-monitor can track
use_mcp_tool("infra-monitor", "log_usage", {
    "service": "anthropic",
    "metric": "cost_usd",
    "value": actual_cost,
    "context": "ablation run condition 6 x10 tasks"
})
```

## Fallback if Anthropic budget runs low

1. Switch to `ALIBABA_MODEL_STUDIO_KEY` (Qwen) — 1M free tokens/month
2. Use Google Vertex AI Express (Gemini Flash) — 1M tokens/day free
3. Both wired in `.env` — update model name in dispatch call
