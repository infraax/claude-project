# Skill: research-db

## When to load
Before querying, writing to, or modifying `data/research.db` (SQLite), or the LanceDB vector store at `vectors/`.

## Database locations

```
data/research.db        ← SQLite: all dispatch telemetry and usage events
<memory_path>/vectors/  ← LanceDB: 384-dim semantic embeddings
```

Override path: `RESEARCH_DB_PATH` env var (used by infra-monitor and ablation runner).

## Schema — `dispatch_observations`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `dispatch_id` | TEXT | dispatch-{uuid} |
| `task_type` | TEXT | code_gen, bug_fix, pipeline, etc. |
| `ablation_condition` | TEXT | baseline/cache_only/.../full_system |
| `protocol_condition` | TEXT | PD condition name |
| `tokens_total_input` | INTEGER | Total input tokens |
| `tokens_output` | INTEGER | Output tokens |
| `tokens_cache_read` | INTEGER | Cache read tokens (×10 cheaper) |
| `tokens_cache_write` | INTEGER | Cache write tokens (one-time cost) |
| `iterations` | INTEGER | Tool-use iterations used |
| `outcome` | TEXT | success / error / timeout |
| `latency_total_ms` | INTEGER | End-to-end latency |
| `compression_ratio` | REAL | LLMLingua ratio (1.0 = no compression) |
| `cost_usd` | REAL | Actual cost charged |
| `model` | TEXT | Model ID used |
| `ts` | TEXT | ISO timestamp |

## Schema — `usage_events` (infra-monitor)

| Column | Type | Description |
|--------|------|-------------|
| `service` | TEXT | pinecone, cloudflare_workers, etc. |
| `metric` | TEXT | read_units, requests, messages |
| `value` | REAL | Amount consumed |
| `context` | TEXT | Task description |
| `ts` | TEXT | ISO timestamp |

## Common analysis queries

```sql
-- Monthly cost by model
SELECT model, COUNT(*) as n, SUM(cost_usd) as total_cost,
       AVG(tokens_cache_read * 1.0 / tokens_total_input) as cache_hit_rate
FROM dispatch_observations
WHERE ts > strftime('%Y-%m-%d', 'now', 'start of month')
GROUP BY model;

-- Ablation comparison (avg cost per condition)
SELECT ablation_condition,
       COUNT(*) as tasks,
       AVG(tokens_total_input) as avg_input,
       AVG(tokens_cache_read) as avg_cache_read,
       AVG(cost_usd) as avg_cost,
       AVG(compression_ratio) as avg_compression
FROM dispatch_observations
WHERE ablation_condition IS NOT NULL
GROUP BY ablation_condition
ORDER BY avg_cost;

-- Cache effectiveness
SELECT
  SUM(CASE WHEN tokens_cache_read > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as hit_pct,
  AVG(tokens_cache_read) as avg_cache_tokens,
  AVG(tokens_total_input) as avg_input_tokens
FROM dispatch_observations;

-- Slowest dispatches
SELECT dispatch_id, task_type, latency_total_ms, iterations, outcome
FROM dispatch_observations
ORDER BY latency_total_ms DESC LIMIT 10;
```

## Python access pattern

```python
import sqlite3
conn = sqlite3.connect("data/research.db")
conn.row_factory = sqlite3.Row
rows = conn.execute("SELECT ...").fetchall()
conn.close()
```

Or via `better-sqlite3` (TypeScript):
```typescript
import Database from "better-sqlite3";
const db = new Database("data/research.db");
const rows = db.prepare("SELECT ...").all();
db.close();
```

## LanceDB (semantic memory)

Stored at: `<memory_path>/vectors/` (per-project)
Model: `all-MiniLM-L6-v2` (384 dimensions)

Access via MCP tools:
```python
store_memory(category="discovery", text="...")   # writes to SQLite + LanceDB
query_memory(query="...", limit=5)               # semantic search
find_related_files(query="...", limit=5)         # find related file summaries
```

## Adding a new column safely

```sql
-- SQLite ALTER TABLE only supports ADD COLUMN
ALTER TABLE dispatch_observations ADD COLUMN new_field TEXT DEFAULT NULL;
-- Never DROP or RENAME columns — SQLite requires full table rebuild
```

## Backup before schema changes

```bash
cp data/research.db data/research.db.bak.$(date +%Y%m%d)
```
