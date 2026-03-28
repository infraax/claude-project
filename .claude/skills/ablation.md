# Skill: ablation

## When to load
Before running, resuming, or interpreting ablation studies. Also load when tuning TGCH layer parameters.

## The 7 conditions

| Index | Name | Cache | Format Encode | Clarity | LLMLingua | PD |
|-------|------|-------|--------------|---------|-----------|-----|
| 0 | `baseline` | ✗ | ✗ | ✗ | ✗ | ✗ |
| 1 | `cache_only` | ✅ | ✗ | ✗ | ✗ | ✗ |
| 2 | `format_only` | ✗ | ✅ | ✗ | ✗ | ✗ |
| 3 | `clarity_only` | ✗ | ✗ | ✅ | ✗ | ✗ |
| 4 | `llmlingua_only` | ✗ | ✗ | ✗ | ✅ | ✗ |
| 5 | `pd_only` | ✗ | ✗ | ✗ | ✗ | ✅ |
| 6 | `full_system` | ✅ | ✅ | ✅ | ✅ | ✅ |

## Running the ablation runner

```bash
# Run all 7 conditions (10 tasks each = 70 dispatches)
python3 scripts/ablation_runner.py

# Run specific condition only
python3 scripts/ablation_runner.py --condition 6 --max-tasks 10

# Resume from a specific condition (checkpoint-aware)
python3 scripts/ablation_runner.py --start-condition 3

# Dry run — print plan, no API calls
python3 scripts/ablation_runner.py --dry-run

# Reset checkpoint (re-run from scratch)
python3 scripts/ablation_runner.py --reset

# View results
python3 scripts/compute_ablation_results.py
```

## VS Code tasks (Codespaces)

- "Ablation: Run full_system (10 tasks)" → condition 6
- "Ablation: Run cache_only (10 tasks)" → condition 1
- "Ablation: Run all conditions" → all 7
- "Ablation: Show results" → compute_ablation_results.py

## Shell shortcuts (after postCreate.sh)

```bash
ablate-full 10      # condition 6, 10 tasks
ablate-cache 10     # condition 1, 10 tasks
ablate-all 10       # all conditions, 10 tasks each
ablate-results      # print result table
```

## Checkpoint file

Location: `scripts/ablation_checkpoint.json`
```json
{"completed_conditions": ["baseline", "cache_only"], "started_at": "..."}
```
Delete or use `--reset` to re-run completed conditions.

## Interpreting results

Key metrics from `compute_ablation_results.py`:

| Metric | What it measures |
|--------|-----------------|
| `avg_input_tokens` | How much context each condition sends |
| `avg_cache_read` | How many tokens were served from cache (cheap) |
| `cache_hit_rate` | % of dispatches with cache hit |
| `avg_compression_ratio` | LLMLingua ratio (lower = more compressed) |
| `avg_cost_usd` | Actual per-dispatch cost |
| `avg_latency_ms` | End-to-end time |

Expected v3 results (from session history):
- `full_system` vs `baseline`: ~96% reduction in effective input tokens
- `cache_only`: ~90% cache hit rate once prefix is stable
- `llmlingua_only`: ~0.65 compression ratio on natural_language tasks

## How conditions are applied

The runner patches `.claude-project` `optimizations{}` before each batch:
```json
{
  "optimizations": {
    "cache_prefix": true,
    "format_encode": true,
    "clarity_layer": true,
    "llmlingua": true,
    "pd_registry": true
  }
}
```
Restores original settings after each condition completes.

## Cost estimate before running

- Baseline (condition 0): ~$0.04 per 10 tasks (no cache, no compression)
- Full system (condition 6): ~$0.005 per 10 tasks (cache + compression)
- Full 7-condition run (70 tasks): ~$0.15–0.25 total

Always call `get_budget_warning` via infra-monitor before starting a run.

## After a run — store key results

```python
store_memory(category="discovery",
  text="Ablation v3 full_system: 96% input token reduction vs baseline. Cache hit rate 90%.")
```
