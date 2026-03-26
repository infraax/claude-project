# 03 — TARGET ARCHITECTURE
## The System We Are Building

> **Checkpoint ID:** `phase3_architecture_read`
> **Action:** Read and understand. Form your implementation plan. Write nothing yet.
> **Reference:** `llm-multi-agent-protocols-report.md` (provided separately)

---

## Architecture Overview

The system has three layers that never bleed into each other:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    HUMAN INTERFACE LAYER                             │
│  VS Code extension │ Obsidian export (async, optional) │ CLI status  │
│  CLAUDE.md (read-only export) │ WAKEUP.md (deprecated → export only) │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ export only, never source of truth
┌────────────────────────────────▼────────────────────────────────────┐
│                    AGENT INTERFACE LAYER                             │
│                     (MCP server — server.py)                         │
│                                                                      │
│  INPUT PIPELINE:                                                     │
│  raw_input → Clarity Layer → LLMLingua → Stable Prefix Builder      │
│                                       → Claude Code API              │
│                                                                      │
│  MCP TOOLS:                                                          │
│  get_context() │ get_pd() │ register_pd() │ search_pd()             │
│  get_file_summary() │ set_file_summary() │ query_decisions()         │
│  log_observation() │ get_session_state() │ dispatch_task()           │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ structured queries only
┌────────────────────────────────▼────────────────────────────────────┐
│                    STATE & MEMORY LAYER                              │
│                                                                      │
│  SQLite (FTS5)          LanceDB (embedded)      Kuzu (embedded)     │
│  ─ Event log             ─ Semantic memory       ─ Dependency graph  │
│  ─ Episodic memory       ─ File summaries        ─ Decision provenance│
│  ─ PD usage log          ─ PD embeddings         ─ Agent relations   │
│  ─ Dispatch observations ─ Task similarity                           │
│                                                                      │
│  Redis (hot cache)                                                   │
│  ─ Session working memory                                            │
│  ─ PD hash → PD text (fast lookup)                                  │
│  ─ Prompt cache state tracking                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: A Single Prompt, End to End

```
1. Damian types a prompt (possibly messy/scattered)
   ↓
2. CLARITY LAYER (M1 MacBook, Ollama + Qwen2.5-7B, ~1-2s, $0)
   - Reconstructs intent
   - Flags ambiguities as clarifying questions if needed
   - Output: clean, complete, unambiguous text
   ↓
3. TASK ROUTER
   - Classifies task type: code_gen | refactor | analysis | retrieval | planning | test | pipeline
   - Selects format: CodeAct | typed_pseudocode | DSL | TOON | natural_language
   - Checks interaction_pair frequency → trigger PD negotiation if threshold hit
   ↓
4. FORMAT ENCODER
   - Encodes prompt in selected format
   - Natural language portions → LLMLingua compression (up to 20× reduction)
   ↓
5. STABLE PREFIX BUILDER
   - Constructs deterministic prefix: system_prompt + project_context + DSL_grammar + tool_schemas
   - All stable prefix tokens tagged with cache_control: ephemeral
   - Prefix is byte-identical on every request → maximum cache hits (90% cost reduction)
   ↓
6. STATE QUERY (replaces file reads)
   - get_context() → returns typed struct, ~200 tokens vs thousands
   - get_file_summary(file) → returns 1-line summary, ~15 tokens vs reading full file
   - All state queries reference content by hash, not by reading raw files
   ↓
7. CLAUDE CODE API CALL
   - Input: stable_prefix (cached) + compressed_message + state_refs
   - Response includes: usage.cache_creation_input_tokens, usage.cache_read_input_tokens
   ↓
8. OBSERVATION RECORDER
   - Full DispatchObservation written to SQLite immediately after response
   - Includes all token breakdown fields, latency, protocol condition, cache hit/miss
   ↓
9. STATE UPDATE
   - Decisions/facts extracted → SQLite + LanceDB + Kuzu
   - File changes detected → update file summary index
   - PD usage → log_pd_usage()
   ↓
10. ASYNC EXPORTS (never blocking)
    - Obsidian sync (if configured)
    - CLAUDE.md regeneration
```

---

## Protocol Document (PD) Lifecycle

```
FIRST USE of interaction pattern (e.g., planner→tool_executor):
  - natural_language mode
  - DispatchObservation records protocol_condition = "natural_language"
  - interaction_tracker increments count for this pair

THRESHOLD HIT (default: 3 occurrences of same pattern):
  - automation.ts fires negotiation_controller agent
  - negotiation_controller searches PD registry for existing matching PD
  - If found: adopt existing PD, record pd_id
  - If not found: negotiate new PD using natural language (one-time cost)
  - New PD stored: SHA-256(full_pd_text) as key

SUBSEQUENT USE:
  - protocol_condition = "pd_negotiated"
  - pd_was_cached = true (if Redis hit) or false (first use after negotiation)
  - body encoded in PD schema
  - DispatchObservation records tokens_saved vs NL baseline

RESEARCH MEASUREMENT:
  - break_even_N = C_negotiate / (C_NL - C_PD) computed per interaction_pair per task_type
  - Results written to SQLite pd_research_results table
```

---

## Database Schema Overview

### SQLite Tables

```sql
CREATE TABLE dispatch_observations (
  id TEXT PRIMARY KEY,
  dispatch_id TEXT,
  session_id TEXT,
  interaction_pair TEXT,
  task_type TEXT,
  protocol_condition TEXT,
  protocol_id TEXT,
  pd_was_cached INTEGER,
  tokens_system_prompt INTEGER,
  tokens_project_context INTEGER,
  tokens_tool_schemas INTEGER,
  tokens_user_message INTEGER,
  tokens_tool_outputs INTEGER,
  tokens_total_input INTEGER,
  tokens_output INTEGER,
  tokens_cache_write INTEGER,
  tokens_cache_read INTEGER,
  latency_clarity_ms INTEGER,
  latency_compression_ms INTEGER,
  latency_pd_lookup_ms INTEGER,
  latency_inference_ms INTEGER,
  latency_tool_exec_ms INTEGER,
  latency_total_ms INTEGER,
  compression_ratio REAL,
  outcome TEXT,
  iterations INTEGER,
  task_completed INTEGER,
  ts TEXT
);

CREATE TABLE pd_registry (
  id TEXT PRIMARY KEY,           -- SHA-256(full_pd_text)
  text TEXT NOT NULL,
  yaml_meta TEXT,
  task_type TEXT,
  interaction_pair TEXT,
  created_at TEXT,
  created_by TEXT,
  use_count INTEGER DEFAULT 0,
  last_used TEXT,
  deprecated INTEGER DEFAULT 0,
  superseded_by TEXT
);

CREATE TABLE pd_usage_log (
  id TEXT PRIMARY KEY,
  pd_id TEXT REFERENCES pd_registry(id),
  dispatch_id TEXT,
  session_id TEXT,
  project_id TEXT,
  tokens_saved INTEGER,
  ts TEXT
);

CREATE TABLE file_summaries (
  path TEXT PRIMARY KEY,
  project_id TEXT,
  summary TEXT,
  summary_hash TEXT,
  file_hash TEXT,
  updated_at TEXT
);

CREATE TABLE pd_research_results (
  id TEXT PRIMARY KEY,
  interaction_pair TEXT,
  task_type TEXT,
  c_negotiate INTEGER,
  c_nl_mean REAL,
  c_pd_mean REAL,
  n_breakeven REAL,
  n_observations INTEGER,
  confidence REAL,
  computed_at TEXT
);
```

### LanceDB Collections

```python
# memory_vec
{"id": str, "vector": list, "category": str, "text": str, "project_id": str, "ts": str}

# file_summaries_vec
{"path": str, "vector": list, "project_id": str, "summary": str}

# pd_embeddings
{"id": str, "vector": list, "task_type": str, "interaction_pair": str, "use_count": int, "summary": str}
```

### Kuzu Graph Schema

```cypher
CREATE NODE TABLE Agent(id STRING, name STRING, model STRING, backend STRING, PRIMARY KEY(id));
CREATE NODE TABLE File(path STRING, project_id STRING, summary STRING, PRIMARY KEY(path));
CREATE NODE TABLE Decision(id STRING, text STRING, project_id STRING, ts STRING, PRIMARY KEY(id));
CREATE NODE TABLE Protocol(id STRING, task_type STRING, PRIMARY KEY(id));

CREATE REL TABLE IMPORTS(FROM File TO File);
CREATE REL TABLE DEPENDS_ON(FROM File TO File);
CREATE REL TABLE AFFECTS(FROM Decision TO File);
CREATE REL TABLE USES_PROTOCOL(FROM Agent TO Protocol);
CREATE REL TABLE SUPERSEDES(FROM Protocol TO Protocol);
```

---

## New .claude-project Schema v5 (additions only)

```json
{
  "version": "5",
  "research": {
    "enabled": true,
    "observation_store": "sqlite",
    "pd_negotiation_threshold": 3,
    "baseline_collection_phase": true
  },
  "agents": {
    "negotiation_controller": {
      "role": "protocol_negotiator",
      "model": "claude-opus-4-5",
      "backend": "claude",
      "instructions": "Design and register Protocol Documents when no existing PD covers a required inter-agent interaction. Query PD registry first. Invoke negotiation only when interaction_pair frequency exceeds threshold.",
      "tools": ["get_pd", "register_pd", "search_pd", "log_pd_usage"]
    }
  },
  "infrastructure": {
    "clarity_layer": {
      "enabled": true,
      "host": "http://localhost:11434",
      "model": "qwen2.5:7b"
    },
    "databases": {
      "sqlite_path": "~/.claude/projects/{project_id}/research.db",
      "lancedb_path": "~/.claude/projects/{project_id}/vectors",
      "kuzu_path": "~/.claude/projects/{project_id}/graph"
    }
  }
}
```

---

## Completion Checkpoint

```json
{
  "phase": "phase3_architecture_read",
  "implementation_plan_formed": true,
  "questions_for_blocked_md": []
}
```

**Then read: `04_PHASE1_MEASUREMENT.md` and begin implementation.**
```

***

Say **"next"** for `04_PHASE1_MEASUREMENT.md`.

Bronnen

## `04_PHASE1_MEASUREMENT.md`

```markdown