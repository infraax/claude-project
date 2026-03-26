# 00 — MASTER INSTRUCTION FILE
## Claude-Project Agent Upgrade Mission

> **READ THIS FILE FIRST. Every session starts here.**
> This is the single entry point for all upgrade work on `claude-project`.

---

## What This Mission Is

You are upgrading `claude-project` — a Claude Code project-brain tool — from a
human-readable, Obsidian-centric system into a **fully agent-optimized, research-grade
multi-agent orchestration infrastructure**. The upgrade is grounded in published research
on token-efficient agent communication, content-addressed state, and protocol negotiation.

The upgrade also positions this project as **original research** — you will instrument
it to be the first system to empirically measure PD-negotiation break-even points and
operate a content-addressed Protocol Document registry. Two open problems in the current
literature will be answered by this project.

---

## Context Budget Strategy

**You will run out of context. This is expected and planned for.**

Before any context compaction occurs, you MUST:
1. Write your current checkpoint to `AGENT_STATE.md` (template in this repo)
2. Complete the current atomic task fully before starting the next
3. Run verification commands and record results in `AGENT_STATE.md`
4. Never split a single file modification across two sessions

**On every session start:**
1. Read `AGENT_STATE.md` first — it tells you exactly where you are
2. Read only the instruction file for the current phase
3. Do not re-read completed phases unless `AGENT_STATE.md` flags a regression

---

## Instruction Files Index

| File | Phase | Prerequisite |
|------|-------|--------------|
| `00_MASTER.md` | Entry point | — |
| `01_RESEARCH_DOWNLOAD.md` | Download all papers, libraries, repos | None |
| `02_CODEBASE_AUDIT.md` | Reference audit of current state | Phase 1 done |
| `03_TARGET_ARCHITECTURE.md` | Full target system design | Phase 1 done |
| `04_PHASE1_MEASUREMENT.md` | Research instrumentation layer | Phase 1 done |
| `05_PHASE2_DATABASE.md` | Replace Obsidian with SQLite+LanceDB+Kuzu | Phase 4 done |
| `06_PHASE3_PD_REGISTRY.md` | Protocol Document registry | Phase 5 done |
| `07_PHASE4_TYPED_DISPATCH.md` | Typed dispatch + task routing | Phase 6 done |
| `08_PHASE5_COMPRESSION.md` | LLMLingua + Clarity Layer + caching | Phase 7 done |
| `09_TESTING_STRATEGY.md` | Full test plan, verification, rollback | Reference throughout |
| `AGENT_STATE.md` | Your live progress tracker | Write every session |

---

## Execution Order

Phase 0: Read AGENT_STATE.md → determine current position
Phase 1: 01_RESEARCH_DOWNLOAD.md → download all assets
Phase 2: 02_CODEBASE_AUDIT.md → read only, no changes
Phase 3: 03_TARGET_ARCHITECTURE.md → read only, form implementation plan
Phase 4: 04_PHASE1_MEASUREMENT.md → implement + test + checkpoint
Phase 5: 05_PHASE2_DATABASE.md → implement + test + checkpoint
Phase 6: 06_PHASE3_PD_REGISTRY.md → implement + test + checkpoint
Phase 7: 07_PHASE4_TYPED_DISPATCH.md → implement + test + checkpoint
Phase 8: 08_PHASE5_COMPRESSION.md → implement + test + checkpoint
Phase 9: 09_TESTING_STRATEGY.md → full integration test


**Never skip a phase. Never start a phase without completing the previous one.**

---

## Key Constraint: Agent-Only Optimization

Every decision must be evaluated against this rule:

> **Does this exist for human readability/comfort? If yes, it does not belong
> in the agent data layer.**

Human-facing features (VS Code extension, Obsidian sync, WAKEUP.md, CLAUDE.md generation)
are kept but strictly isolated from the agent data layer. They become read-only exports,
never the source of truth.

---

## Research Context

All design decisions in these files are grounded in published research.
The research report `llm-multi-agent-protocols-report.md` is provided alongside
these instruction files. Key papers to download are listed in `01_RESEARCH_DOWNLOAD.md`.

The two primary open research problems this project will answer:

**Problem 1:** At what interaction frequency (N) does one-time PD negotiation break even
versus continuing in natural language? Formula: N_breakeven = C_negotiate / (C_NL - C_PD)

**Problem 2:** Can a content-addressed PD registry scale across projects and agents,
and does cross-session PD reuse reduce token cost measurably?

---

## Communication With Damian

If you are blocked, need a decision, or encounter an ambiguity not covered in the
instruction files, write a `BLOCKED.md` file with:
- Current phase and task
- The specific question
- Two or three options with trade-offs

Do not guess. Do not proceed past a block.

---

## Version

Instruction set version: 1.0.0
Created: 2026-03-26
Project repo: https://github.com/infraax/claude-project


# 01 — RESEARCH DOWNLOAD & ENVIRONMENT SETUP
## Phase 1: Acquire All Reference Material

> **Checkpoint ID:** `phase1_research_download`
> **Prerequisite:** None — this is always the first phase
> **Estimated tokens:** Low — mostly shell commands

---

## Step 1.1 — Create Research Directory

```bash
mkdir -p ~/claude-project-research/papers
mkdir -p ~/claude-project-research/repos
mkdir -p ~/claude-project-research/benchmarks
cd ~/claude-project-research


## `01_RESEARCH_DOWNLOAD.md`

```markdown
# 01 — RESEARCH DOWNLOAD & ENVIRONMENT SETUP
## Phase 1: Acquire All Reference Material

> **Checkpoint ID:** `phase1_research_download`
> **Prerequisite:** None — this is always the first phase
> **Estimated tokens:** Low — mostly shell commands

---

## Step 1.1 — Create Research Directory

```bash
mkdir -p ~/claude-project-research/papers
mkdir -p ~/claude-project-research/repos
mkdir -p ~/claude-project-research/benchmarks
cd ~/claude-project-research
```

Write to AGENT_STATE.md: `step_1_1_complete: true`

---

## Step 1.2 — Download Research Papers

Download each paper as PDF. Use `curl -L` for arxiv links.
If a download fails, note it in AGENT_STATE.md and continue — do not block on one paper.

### Core Papers (Required)

```bash
# CodeAgents: Typed pseudocode inter-agent communication (55-87% token reduction)
curl -L "https://arxiv.org/pdf/2507.03254.pdf" -o papers/codeagents_2507.03254.pdf

# CodeAct: Executable code actions for LLM agents
curl -L "https://arxiv.org/pdf/2402.01030.pdf" -o papers/codeact_2402.01030.pdf

# CaveAgent: Dual-stream stateful runtime for LLMs
curl -L "https://arxiv.org/pdf/2601.01569.pdf" -o papers/caveagent_2601.01569.pdf

# Anka DSL: Domain-specific language for reliable LLM code generation
curl -L "https://arxiv.org/pdf/2512.23214.pdf" -o papers/anka_dsl_2512.23214.pdf

# LLMLingua-2: Token-level prompt compression
curl -L "https://arxiv.org/pdf/2403.12968.pdf" -o papers/llmlingua2_2403.12968.pdf

# How Different Tokenization Algorithms Impact LLMs
curl -L "https://arxiv.org/pdf/2511.03825.pdf" -o papers/tokenization_impact_2511.03825.pdf

# Beyond Self-Talk: Communication-Centric Survey of LLM Multi-Agent Systems
curl -L "https://arxiv.org/pdf/2502.14321.pdf" -o papers/multiagent_survey_2502.14321.pdf
```

### Protocol Papers (Required)

```bash
# Agora protocol
curl -L "https://arxiv.org/pdf/2501.00003.pdf" -o papers/agora_protocol.pdf || \
  echo "WARN: Agora PDF not at this URL — check agent-network-protocol.com/paper"

# ANP (Agent Network Protocol) specification
curl -L "https://agent-network-protocol.com/papers/anp-spec.pdf" -o papers/anp_spec.pdf || \
  echo "WARN: ANP spec PDF not found — note in AGENT_STATE.md"

# LACP: LLM Agent Communication Protocol
curl -L "https://arxiv.org/pdf/2504.15854.pdf" -o papers/lacp_2504.15854.pdf

# LDP: LLM Delegate Protocol
curl -L "https://arxiv.org/pdf/2505.00001.pdf" -o papers/ldp_protocol.pdf || \
  echo "WARN: LDP PDF URL uncertain — note in AGENT_STATE.md"
```

### Supplementary Papers (Download if possible, not blocking)

```bash
# CaveAgent extended version
curl -L "https://arxiv.org/pdf/2601.01569v3.pdf" -o papers/caveagent_v3.pdf

# CodeAgent: Tool-integrated code generation
curl -L "https://arxiv.org/pdf/2401.07339.pdf" -o papers/codeagent_2401.07339.pdf

# Chain of Agents: LLMs collaborating on long-context tasks
curl -L "https://arxiv.org/pdf/2406.02818.pdf" -o papers/chain_of_agents.pdf

# Agentic Plan Caching
curl -L "https://arxiv.org/pdf/2504.09823.pdf" -o papers/plan_caching.pdf || \
  echo "WARN: Plan caching paper URL uncertain"
```

Write to AGENT_STATE.md: `step_1_2_papers_downloaded: true` with list of any failures.

---

## Step 1.3 — Clone Reference Repositories

```bash
cd ~/claude-project-research/repos

# Agora reference implementation
git clone --depth=1 https://github.com/agora-protocol/agora.git || \
  echo "WARN: Agora repo URL may differ — check agent-network-protocol.com/github"

# ANP reference implementation
git clone --depth=1 https://github.com/agent-network-protocol/python-sdk.git anp-sdk || \
  echo "WARN: ANP SDK repo not found"

# LLMLingua: Microsoft prompt compression
git clone --depth=1 https://github.com/microsoft/LLMLingua.git

# CaveAgent reference implementation
git clone --depth=1 https://github.com/acodercat/cave-agent.git || \
  echo "WARN: CaveAgent repo URL uncertain — check arxiv paper for GitHub link"

# TOON: Token-Oriented Object Notation
git clone --depth=1 https://github.com/toon-format/toon.git

# claude-code-mcp-enhanced: MCP orchestration reference
git clone --depth=1 https://github.com/grahama1970/claude-code-mcp-enhanced.git
```

Write to AGENT_STATE.md: `step_1_3_repos_cloned: true` with list of any failures.

---

## Step 1.4 — Install Python Dependencies

```bash
cd /path/to/claude-project   # adjust to actual repo path
python3 -m venv .venv-research
source .venv-research/bin/activate

pip install mcp fastmcp
pip install llmlingua
pip install lancedb
pip install kuzu
pip install sqlite-utils
pip install sentence-transformers
pip install toon-format || pip install git+https://github.com/toon-format/toon.git
pip install anthropic>=0.40.0
pip install pandas numpy scipy

pip freeze > requirements-research.txt
```

Write to AGENT_STATE.md: `step_1_4_python_deps: true`

---

## Step 1.5 — Install Node Dependencies

```bash
cd /path/to/claude-project
npm install

npm run build 2>&1 | tail -5
npx vitest run 2>&1 | tail -10
```

Record build status and test results in AGENT_STATE.md under `step_1_5_node_build`.
If tests fail before any changes, record exact failures — this is your baseline.

---

## Step 1.6 — Verify Anthropic API Key Returns Cache Fields

```python
# Save as ~/claude-project-research/verify_cache_fields.py
import anthropic, json

client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=10,
    system=[{"type": "text", "text": "You are a test assistant.", "cache_control": {"type": "ephemeral"}}],
    messages=[{"role": "user", "content": "Say hi"}]
)
print(json.dumps({
    "input_tokens": response.usage.input_tokens,
    "output_tokens": response.usage.output_tokens,
    "cache_creation_input_tokens": getattr(response.usage, "cache_creation_input_tokens", "MISSING"),
    "cache_read_input_tokens": getattr(response.usage, "cache_read_input_tokens", "MISSING"),
}, indent=2))
```

```bash
python3 ~/claude-project-research/verify_cache_fields.py
```

Expected: both cache fields present (even if 0).
If `MISSING` appears — note in AGENT_STATE.md, Phase 4 measurement will need adjustment.

Write to AGENT_STATE.md: `step_1_6_api_cache_fields_verified: true/false`

---

## Completion Checkpoint

```bash
ls ~/claude-project-research/papers/ | wc -l   # should be >= 6
ls ~/claude-project-research/repos/ | wc -l    # should be >= 4
python3 -c "import llmlingua, lancedb, kuzu; print('OK')"
npm run build
```

Write to AGENT_STATE.md:
```json
{
  "phase": "phase1_complete",
  "papers_downloaded": N,
  "repos_cloned": N,
  "python_deps_ok": true,
  "node_build_ok": true,
  "api_cache_fields": true,
  "baseline_test_failures": []
}
```

**Then read: `02_CODEBASE_AUDIT.md`**
```

***

Say **"next"** for `02_CODEBASE_AUDIT.md`.

Bronnen


## `02_CODEBASE_AUDIT.md`

```markdown
# 02 — CODEBASE AUDIT: Current State
## Reference Document — Read Only, No Changes

> **Checkpoint ID:** `phase2_audit_read`
> **Action:** Read and understand. Write nothing to the codebase yet.
> **Purpose:** Ground truth before any changes. Return here if confused about original state.

---

## Repository Structure

```
claude-project/
├── src/
│   ├── extension.ts              # VS Code extension entry
│   ├── cli.ts                    # CLI entry point
│   └── lib/
│       ├── registry.ts           # Global ~/.claude/registry.json
│       ├── project.ts            # .claude-project schema + file-finding
│       ├── paths.ts              # Path resolution utilities
│       ├── mcp-inject.ts         # MCP config injection into Claude Code
│       ├── events.ts             # Append-only JSONL event log
│       ├── dispatch-runner.ts    # Claude API agentic tool loop
│       └── automation.ts         # Trigger/action automation engine
│   └── commands/
│       ├── init.ts               # Project initialization
│       ├── sync.ts               # Registry sync
│       ├── status.ts             # Project status display
│       ├── dispatch.ts           # Dispatch CLI commands
│       ├── generate-claude-md.ts # CLAUDE.md auto-generation
│       ├── hooks.ts              # Session hook management
│       ├── hook-run.ts           # Hook execution
│       └── ...
├── mcp/
│   └── server.py                 # Python MCP server (FastMCP)
├── schema/
│   └── claude-project.schema.json
└── docs/
```

---

## Component Assessment: Human-Oriented vs Agent-Optimized

### ❌ REMOVE FROM AGENT DATA LAYER (human-oriented, zero agent value)

| Component | Location | Why It Must Change |
|-----------|----------|-------------------|
| `WAKEUP.md` | `memory/WAKEUP.md` | Markdown prose for human reading. Agent needs typed JSON state record. |
| `SESSION_JOURNAL.md` | `memory/SESSION_JOURNAL.md` | Narrative journal duplicates event log. Redundant. Delete. |
| `generate-claude-md.ts` | `src/commands/generate-claude-md.ts` | Generates a human-readable document. Replace with MCP `get_context()` typed struct. |
| Obsidian sync (every write) | `mcp/server.py`, `automation.ts` | Pure human UX. Adds write latency, machine-specific paths. Decouple to optional async export. |
| Source attribution as strings | `events.ts`, `mcp/server.py` | `"MacBook / gebruiker"` is human-readable. Replace with structured `{device_id, hostname, user}`. |

### 🟡 KEEP BUT UPGRADE (right intent, wrong implementation)

| Component | Location | What Must Change |
|-----------|----------|--------------------|
| `events.jsonl` | Per-project JSONL file | Add mandatory typed fields per event type. Add research measurement fields. |
| `DispatchFile.usage` | `dispatch-runner.ts` | Currently `{input_tokens, output_tokens}` only. Expand to full `DispatchObservation`. |
| `mcp/server.py` tools | `mcp/server.py` | Tools return raw text. Add compression pass on output. Add PD registry tools. |
| `dispatch-runner.ts` | `src/lib/dispatch-runner.ts` | Dispatch body is free-form string. Add task classification, protocol condition, full timing. |
| `.claude-project` schema | `schema/claude-project.schema.json` | Missing `backend` field on agents. Missing `protocol_id` on dispatches. |

### ✅ KEEP AS-IS (agent-optimized, correct design)

| Component | Location | Why It Is Correct |
|-----------|----------|------------------|
| `registry.ts` | `src/lib/registry.ts` | Global JSON lookup, no filesystem scan — correct pattern. |
| `project.ts` walk-up | `src/lib/project.ts` | .git-style project discovery — correct pattern. |
| `events.ts` JSONL append | `src/lib/events.ts` | Structured, queryable, append-only — correct pattern. |
| `AgentDefinition` interface | `src/lib/project.ts` | Typed agent roster with model, tools, tags — correct pattern. |
| `automation.ts` trigger system | `src/lib/automation.ts` | Event/cron/file-change triggers — correct. Extend, not replace. |
| VS Code extension | `src/extension.ts` | Human UX layer — keep isolated, never let it influence agent data. |
| Background daemon | Launchd plist | Correct pattern. Extend to systemd for Linux. |

---

## Current MCP Server Tools (server.py)

| Tool | Input | Output | Problem |
|------|-------|--------|---------|
| `journal_write` | category, content, tags | Writes .md file | Prose-based, markdown output |
| `journal_read` | category, limit | Raw markdown text | No compression, full text returned |
| `remember` | key, value | Stores text blob | No structure, no semantic indexing |
| `recall` | query | Raw stored text | No compression on output |
| `list_memories` | — | File list | Files as memory — wrong abstraction |

**Missing entirely:** PD registry tools, file summary tools, semantic search, compression, cache management.

---

## Current Dispatch File Schema

```typescript
interface DispatchFile {
  id: string;
  title: string;        // FREE-FORM STRING — no type safety
  body: string;         // FREE-FORM STRING — no schema
  agent?: string;
  priority?: "low" | "normal" | "high";
  status: "pending" | "running" | "completed" | "failed";
  created?: string;
  started_at?: string;
  completed_at?: string;
  source?: string;
  result?: string;
  error?: string;
  tool_calls?: Array<{ tool: string; input: unknown; output_summary: string }>;
  usage?: { input_tokens: number; output_tokens: number };  // INCOMPLETE
}
```

**Missing:** task_type, protocol_condition, protocol_id, session_id, interaction_pair, token breakdown (cache fields), latency timing, compression stats, backend routing.

---

## Current Event Schema

```typescript
interface ProjectEvent {
  id: string;        // 8-char UUID prefix
  ts: string;        // ISO timestamp
  type: EventType;   // union of strings
  source: string;    // HUMAN STRING: "MacBook / gebruiker"
  project_id: string;
   Record<string, unknown>;  // UNTYPED — no enforcement
  tags?: string[];
}
```

**Missing:** typed data schemas per event type, session_id grouping, research fields.

---

## Baseline Metrics to Record NOW (before any changes)

```bash
cat ~/.claude/projects/*/dispatches/*.json | python3 -c "
import json, sys
for line in sys.stdin:
    d = json.loads(line)
    if d.get('usage'):
        print(json.dumps(d['usage']))
" | head -20

wc -l ~/.claude/projects/*/events.jsonl 2>/dev/null
du -sh ~/.claude/projects/*/memory/ 2>/dev/null
ls ~/.claude/projects/*/dispatches/*.json 2>/dev/null | wc -l
```

Write all output to AGENT_STATE.md under `baseline_metrics`.

---

## Completion Checkpoint

```json
{
  "phase": "phase2_audit_complete",
  "baseline_metrics_recorded": true,
  "audit_understood": true
}
```

**Then read: `03_TARGET_ARCHITECTURE.md`**
```

***

Say **"next"** for `03_TARGET_ARCHITECTURE.md`.

Bronnen


## `03_TARGET_ARCHITECTURE.md`

```markdown
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
# 04 — PHASE 1: RESEARCH INSTRUMENTATION
## Implement the Measurement Layer

> **Checkpoint ID:** `phase4_measurement`
> **Prerequisites:** Phases 1-3 complete, baseline metrics recorded
> **Goal:** Every dispatch produces a full DispatchObservation. Zero data is lost.
> **Research papers:** `codeagents_2507.03254.pdf`, `caveagent_2601.01569.pdf`

---

## Context Budget Warning

This phase touches 3 files and creates 2 new files.
If context compacts mid-phase:
1. Read AGENT_STATE.md to find last completed step
2. Read ONLY this file (04_PHASE1_MEASUREMENT.md)
3. Resume from last completed step
4. Never re-run completed steps

---

## Step 4.1 — Create SQLite Research Database Module

**Create file:** `src/lib/research-db.ts`

```typescript
// src/lib/research-db.ts
import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import { ClaudeProject } from "./project.js";
import { resolvePaths } from "./paths.js";

export interface DispatchObservation {
  id: string;
  dispatch_id: string;
  session_id: string;
  interaction_pair: string;
  task_type: TaskType;
  protocol_condition: "natural_language" | "typed_schema" | "pd_negotiated";
  protocol_id?: string;
  pd_was_cached: boolean;
  tokens: {
    system_prompt: number;
    project_context: number;
    tool_schemas: number;
    user_message: number;
    tool_outputs: number;
    total_input: number;
    output: number;
    cache_write: number;
    cache_read: number;
  };
  compression?: {
    input_raw_chars: number;
    input_post_clarity: number;
    input_post_lingua: number;
    compression_ratio: number;
  };
  latency_ms: {
    clarity_layer: number;
    compression: number;
    pd_lookup: number;
    inference: number;
    tool_execution: number;
    total: number;
  };
  outcome: "success" | "failure" | "partial";
  iterations: number;
  task_completed: boolean;
  ts: string;
}

export type TaskType =
  | "code_gen" | "refactor" | "analysis" | "retrieval"
  | "planning" | "test_gen" | "pipeline" | "documentation" | "unknown";

export function getResearchDbPath(project: ClaudeProject, projectDir: string): string {
  const paths = resolvePaths(project, projectDir);
  return path.join(path.dirname(paths.memoryDir), "research.db");
}

export function initResearchDb(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS dispatch_observations (
      id TEXT PRIMARY KEY,
      dispatch_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      interaction_pair TEXT NOT NULL,
      task_type TEXT NOT NULL,
      protocol_condition TEXT NOT NULL,
      protocol_id TEXT,
      pd_was_cached INTEGER NOT NULL DEFAULT 0,
      tokens_system_prompt INTEGER NOT NULL DEFAULT 0,
      tokens_project_context INTEGER NOT NULL DEFAULT 0,
      tokens_tool_schemas INTEGER NOT NULL DEFAULT 0,
      tokens_user_message INTEGER NOT NULL DEFAULT 0,
      tokens_tool_outputs INTEGER NOT NULL DEFAULT 0,
      tokens_total_input INTEGER NOT NULL DEFAULT 0,
      tokens_output INTEGER NOT NULL DEFAULT 0,
      tokens_cache_write INTEGER NOT NULL DEFAULT 0,
      tokens_cache_read INTEGER NOT NULL DEFAULT 0,
      latency_clarity_ms INTEGER NOT NULL DEFAULT 0,
      latency_compression_ms INTEGER NOT NULL DEFAULT 0,
      latency_pd_lookup_ms INTEGER NOT NULL DEFAULT 0,
      latency_inference_ms INTEGER NOT NULL DEFAULT 0,
      latency_tool_exec_ms INTEGER NOT NULL DEFAULT 0,
      latency_total_ms INTEGER NOT NULL DEFAULT 0,
      compression_ratio REAL,
      compression_input_raw INTEGER,
      compression_post_clarity INTEGER,
      compression_post_lingua INTEGER,
      outcome TEXT NOT NULL,
      iterations INTEGER NOT NULL DEFAULT 0,
      task_completed INTEGER NOT NULL DEFAULT 0,
      ts TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pd_registry (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      yaml_meta TEXT,
      task_type TEXT,
      interaction_pair TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used TEXT,
      deprecated INTEGER NOT NULL DEFAULT 0,
      superseded_by TEXT
    );

    CREATE TABLE IF NOT EXISTS pd_usage_log (
      id TEXT PRIMARY KEY,
      pd_id TEXT NOT NULL REFERENCES pd_registry(id),
      dispatch_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      tokens_saved INTEGER,
      ts TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS file_summaries (
      path TEXT NOT NULL,
      project_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      summary_hash TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (path, project_id)
    );

    CREATE TABLE IF NOT EXISTS interaction_counts (
      pair TEXT NOT NULL,
      project_id TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      last_seen TEXT NOT NULL,
      pd_assigned TEXT,
      PRIMARY KEY (pair, project_id)
    );

    CREATE TABLE IF NOT EXISTS pd_research_results (
      id TEXT PRIMARY KEY,
      interaction_pair TEXT NOT NULL,
      task_type TEXT NOT NULL,
      c_negotiate INTEGER,
      c_nl_mean REAL,
      c_pd_mean REAL,
      n_breakeven REAL,
      n_observations INTEGER,
      confidence REAL,
      computed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_obs_dispatch ON dispatch_observations(dispatch_id);
    CREATE INDEX IF NOT EXISTS idx_obs_task_type ON dispatch_observations(task_type);
    CREATE INDEX IF NOT EXISTS idx_obs_protocol ON dispatch_observations(protocol_condition);
    CREATE INDEX IF NOT EXISTS idx_obs_ts ON dispatch_observations(ts);
    CREATE INDEX IF NOT EXISTS idx_pd_task ON pd_registry(task_type);
    CREATE INDEX IF NOT EXISTS idx_ic_pair ON interaction_counts(pair, project_id);
  `);

  return db;
}

export function writeObservation(db: Database.Database, obs: DispatchObservation): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO dispatch_observations VALUES (
      @id, @dispatch_id, @session_id, @interaction_pair, @task_type,
      @protocol_condition, @protocol_id, @pd_was_cached,
      @tokens_system_prompt, @tokens_project_context, @tokens_tool_schemas,
      @tokens_user_message, @tokens_tool_outputs, @tokens_total_input,
      @tokens_output, @tokens_cache_write, @tokens_cache_read,
      @latency_clarity_ms, @latency_compression_ms, @latency_pd_lookup_ms,
      @latency_inference_ms, @latency_tool_exec_ms, @latency_total_ms,
      @compression_ratio, @compression_input_raw, @compression_post_clarity,
      @compression_post_lingua, @outcome, @iterations, @task_completed, @ts
    )
  `);
  stmt.run({
    id: obs.id,
    dispatch_id: obs.dispatch_id,
    session_id: obs.session_id,
    interaction_pair: obs.interaction_pair,
    task_type: obs.task_type,
    protocol_condition: obs.protocol_condition,
    protocol_id: obs.protocol_id ?? null,
    pd_was_cached: obs.pd_was_cached ? 1 : 0,
    tokens_system_prompt: obs.tokens.system_prompt,
    tokens_project_context: obs.tokens.project_context,
    tokens_tool_schemas: obs.tokens.tool_schemas,
    tokens_user_message: obs.tokens.user_message,
    tokens_tool_outputs: obs.tokens.tool_outputs,
    tokens_total_input: obs.tokens.total_input,
    tokens_output: obs.tokens.output,
    tokens_cache_write: obs.tokens.cache_write,
    tokens_cache_read: obs.tokens.cache_read,
    latency_clarity_ms: obs.latency_ms.clarity_layer,
    latency_compression_ms: obs.latency_ms.compression,
    latency_pd_lookup_ms: obs.latency_ms.pd_lookup,
    latency_inference_ms: obs.latency_ms.inference,
    latency_tool_exec_ms: obs.latency_ms.tool_execution,
    latency_total_ms: obs.latency_ms.total,
    compression_ratio: obs.compression?.compression_ratio ?? null,
    compression_input_raw: obs.compression?.input_raw_chars ?? null,
    compression_post_clarity: obs.compression?.input_post_clarity ?? null,
    compression_post_lingua: obs.compression?.input_post_lingua ?? null,
    outcome: obs.outcome,
    iterations: obs.iterations,
    task_completed: obs.task_completed ? 1 : 0,
    ts: obs.ts,
  });
}
```

```bash
npm install better-sqlite3 @types/better-sqlite3
```

Write to AGENT_STATE.md: `step_4_1_research_db_ts: complete`

---

## Step 4.2 — Create Task Classifier Module

**Create file:** `src/lib/task-classifier.ts`

```typescript
// src/lib/task-classifier.ts
import { TaskType } from "./research-db.js";

const TASK_PATTERNS: Array<{ type: TaskType; patterns: RegExp[] }> = [
  { type: "test_gen",      patterns: [/\btest(s|ing)?\b/i, /\bspec\b/i, /\bvitest\b/i, /\bjest\b/i] },
  { type: "refactor",      patterns: [/\brefactor\b/i, /\bclean up\b/i, /\brewrite\b/i, /\bimprove\b/i] },
  { type: "code_gen",      patterns: [/\bimplement\b/i, /\bcreate\b/i, /\bbuild\b/i, /\badd\b.*\bfunction\b/i] },
  { type: "analysis",      patterns: [/\banalyze\b/i, /\banalyse\b/i, /\breview\b/i, /\bcheck\b/i, /\binspect\b/i] },
  { type: "documentation", patterns: [/\bdoc(s|ument)?\b/i, /\breadme\b/i, /\bcomment\b/i, /\bjsdoc\b/i] },
  { type: "pipeline",      patterns: [/\bpipeline\b/i, /\btransform\b/i, /\bprocess\b/i, /\betl\b/i] },
  { type: "planning",      patterns: [/\bplan\b/i, /\barchitect\b/i, /\bdesign\b/i, /\bstrateg\b/i] },
  { type: "retrieval",     patterns: [/\bfind\b/i, /\bsearch\b/i, /\blookup\b/i, /\bwhere\b.*\bis\b/i] },
];

export function classifyTaskType(title: string, body: string): TaskType {
  const combined = `${title} ${body}`.toLowerCase();
  for (const { type, patterns } of TASK_PATTERNS) {
    if (patterns.some((p) => p.test(combined))) return type;
  }
  return "unknown";
}

export function inferInteractionPair(agentName?: string, callerContext?: string): string {
  const caller = callerContext ?? "user";
  const target = agentName ?? "main";
  return `${caller}→${target}`;
}
```

Write to AGENT_STATE.md: `step_4_2_task_classifier: complete`

---

## Step 4.3 — Upgrade dispatch-runner.ts

**Modify file:** `src/lib/dispatch-runner.ts`

Add imports at top:
```typescript
import { randomUUID } from "crypto";
import { initResearchDb, writeObservation, getResearchDbPath, DispatchObservation } from "./research-db.js";
import { classifyTaskType, inferInteractionPair } from "./task-classifier.js";
```

Add near top of `runDispatch` function:
```typescript
const sessionId = process.env["CLAUDE_SESSION_ID"] ?? process.env["CP_SESSION_ID"] ?? randomUUID().slice(0, 8);
const taskStart = Date.now();
const timings = { clarity_layer: 0, compression: 0, pd_lookup: 0, inference: 0, tool_execution: 0, total: 0 };
```

Wrap the API call to capture inference latency:
```typescript
const inferenceStart = Date.now();
const response = await client.messages.create(/* existing params */);
timings.inference = Date.now() - inferenceStart;
```

After dispatch status is set, add observation recording:
```typescript
try {
  const dbPath = getResearchDbPath(project, projectDir);
  const db = initResearchDb(dbPath);
  const usage = response?.usage ?? { input_tokens: 0, output_tokens: 0 };
  timings.total = Date.now() - taskStart;

  const obs: DispatchObservation = {
    id: randomUUID().slice(0, 8),
    dispatch_id: dispatch.id,
    session_id: sessionId,
    interaction_pair: inferInteractionPair(dispatch.agent),
    task_type: classifyTaskType(dispatch.title, dispatch.body ?? ""),
    protocol_condition: dispatch.protocol_id ? "pd_negotiated" : "natural_language",
    protocol_id: dispatch.protocol_id,
    pd_was_cached: false,
    tokens: {
      system_prompt: 0,
      project_context: 0,
      tool_schemas: BUILTIN_TOOLS_TOKEN_COUNT,
      user_message: 0,
      tool_outputs: 0,
      total_input: usage.input_tokens ?? 0,
      output: usage.output_tokens ?? 0,
      cache_write: (usage as any).cache_creation_input_tokens ?? 0,
      cache_read: (usage as any).cache_read_input_tokens ?? 0,
    },
    latency_ms: timings,
    outcome: dispatch.status === "completed" ? "success" : "failure",
    iterations: dispatch.tool_calls?.length ?? 0,
    task_completed: dispatch.status === "completed",
    ts: new Date().toISOString(),
  };

  writeObservation(db, obs);
  db.close();
} catch (err) {
  console.error("[research] Failed to write observation:", err);
}
```

Also extend `DispatchFile` interface:
```typescript
export interface DispatchFile {
  // ... existing fields unchanged ...
  protocol_id?: string;
  protocol_condition?: "natural_language" | "typed_schema" | "pd_negotiated";
  session_id?: string;
  task_type?: string;
}
```

Write to AGENT_STATE.md: `step_4_3_dispatch_runner_upgraded: complete`

---

## Step 4.4 — Measure BUILTIN_TOOLS_TOKEN_COUNT

```python
# scripts/measure_tool_tokens.py
import anthropic, json

client = anthropic.Anthropic()
tools = [
  {"name": "read_file", "description": "Read a file from the project directory.",
   "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
  {"name": "list_files", "description": "List files in a directory.",
   "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": []}},
  {"name": "write_file", "description": "Write content to a file.",
   "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}},
  {"name": "bash", "description": "Run a shell command.",
   "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
  {"name": "log_event", "description": "Append a custom event.",
   "input_schema": {"type": "object", "properties": {"type": {"type": "string"}, "data": {"type": "string"}}, "required": ["type"]}},
]
response = client.messages.create(
  model="claude-haiku-4-5", max_tokens=1, tools=tools,
  messages=[{"role": "user", "content": "x"}]
)
print(f"BUILTIN_TOOLS_TOKEN_COUNT = {response.usage.input_tokens}")
```

```bash
python3 scripts/measure_tool_tokens.py
```

Record the number in `dispatch-runner.ts`:
```typescript
const BUILTIN_TOOLS_TOKEN_COUNT = N;  // replace N with measured value
```

Write to AGENT_STATE.md: `step_4_4_tool_token_count: N`

---

## Step 4.5 — Build and Test

```bash
npm run build
npx vitest run

# Verify research.db is created with data after a dispatch
python3 -c "
import sqlite3, json, glob
dbs = glob.glob(os.path.expanduser('~/.claude/projects/*/research.db'))
if not dbs: print('NO DB FOUND')
else:
    db = sqlite3.connect(dbs)
    rows = db.execute('SELECT id, task_type, protocol_condition, tokens_total_input, tokens_cache_read FROM dispatch_observations LIMIT 5').fetchall()
    for r in rows: print(r)
"
```

Expected: rows present, `tokens_cache_read` = 0 at this stage (caching not yet implemented — that is correct).

Write to AGENT_STATE.md:
```json
{
  "phase": "phase4_measurement_complete",
  "observation_db_created": true,
  "build_passing": true,
  "sample_token_count": N
}
```

**Phase 1 complete. Then read: `05_PHASE2_DATABASE.md`**
```

***

Say **"next"** for `05_PHASE2_DATABASE.md`.

Bronnen


## `05_PHASE2_DATABASE.md`

```markdown
# 05 — PHASE 2: DATABASE LAYER
## Replace Obsidian with SQLite + LanceDB + Kuzu

> **Checkpoint ID:** `phase5_database`
> **Prerequisites:** Phase 4 (measurement) complete
> **Goal:** Agent memory stored in queryable databases. Obsidian becomes async export only.
> **Research:** `caveagent_2601.01569.pdf` (dual-stream architecture)

---

## Context Budget Warning

This phase modifies `mcp/server.py` substantially and creates new Python modules.
If context compacts, re-read only this file and AGENT_STATE.md.
The existing server.py is preserved — you are adding new tools alongside existing ones,
then migrating existing tools to use the new store.

---

## Step 5.1 — Initialize Database Layer in server.py

**Add to `mcp/server.py`** after existing imports:

```python
import sqlite3
import hashlib
import lancedb
import kuzu
import uuid
import json
import os
import threading
from pathlib import Path
from datetime import datetime, timezone
from sentence_transformers import SentenceTransformer

_EMBED_MODEL = None

def _get_embed_model():
    global _EMBED_MODEL
    if _EMBED_MODEL is None:
        _EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    return _EMBED_MODEL

def _get_db_paths(memory_dir: Path) -> dict:
    project_dir = memory_dir.parent
    return {
        "sqlite":  project_dir / "research.db",
        "lancedb": project_dir / "vectors",
        "kuzu":    project_dir / "graph",
    }

def _init_sqlite(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            text TEXT NOT NULL,
            text_hash TEXT NOT NULL,
            project_id TEXT NOT NULL,
            source TEXT NOT NULL,
            tags TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS file_summaries (
            path TEXT NOT NULL,
            project_id TEXT NOT NULL,
            summary TEXT NOT NULL,
            summary_hash TEXT NOT NULL,
            file_hash TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (path, project_id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS session_state (
            project_id TEXT PRIMARY KEY,
            stage TEXT,
            blockers TEXT,
            open_questions TEXT,
            critical_facts TEXT,
            last_session_summary TEXT,
            updated_at TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_mem_project ON memories(project_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_mem_category ON memories(category)")
    conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(id, text, category)")
    conn.commit()
    return conn

def _init_lancedb(lancedb_path: Path):
    lancedb_path.mkdir(parents=True, exist_ok=True)
    db = lancedb.connect(str(lancedb_path))
    if "memory_vec" not in db.table_names():
        import pyarrow as pa
        db.create_table("memory_vec", schema=pa.schema([
            pa.field("id", pa.string()),
            pa.field("vector", pa.list_(pa.float32(), 384)),
            pa.field("category", pa.string()),
            pa.field("text", pa.string()),
            pa.field("project_id", pa.string()),
            pa.field("ts", pa.string()),
        ]))
    if "file_summaries_vec" not in db.table_names():
        import pyarrow as pa
        db.create_table("file_summaries_vec", schema=pa.schema([
            pa.field("path", pa.string()),
            pa.field("vector", pa.list_(pa.float32(), 384)),
            pa.field("project_id", pa.string()),
            pa.field("summary", pa.string()),
        ]))
    return db

def _get_source_structured() -> dict:
    import socket
    return {
        "device_id": socket.gethostname(),
        "hostname":  socket.gethostname().lower(),
        "user":      os.getenv("USER", "unknown"),
        "ssh_client": os.getenv("SSH_CLIENT", None),
    }
```

Write to AGENT_STATE.md: `step_5_1_db_init_code: complete`

---

## Step 5.2 — Add New Agent-Optimized MCP Tools

Add these tools to `mcp/server.py`. Do NOT delete existing tools yet.

```python
@mcp.tool()
def store_memory(category: str, text: str, tags: list[str] | None = None) -> dict:
    """
    Store a memory entry. category: decision|discovery|fact|milestone|question
    Returns: {id, category, text_hash}
    """
    valid = ("decision", "discovery", "fact", "milestone", "question")
    if category not in valid:
        return {"error": f"Invalid category. Use: {' | '.join(valid)}"}

    memory_dir, _, _ = _resolve_paths()
    db_paths = _get_db_paths(memory_dir)
    conn = _init_sqlite(db_paths["sqlite"])
    lance_db = _init_lancedb(db_paths["lancedb"])

    entry_id   = str(uuid.uuid4())[:8]
    text_hash  = hashlib.sha256(text.encode()).hexdigest()[:16]
    project_id = _current_project_id()
    source     = json.dumps(_get_source_structured())
    now        = datetime.now(timezone.utc).isoformat()

    conn.execute(
        "INSERT INTO memories (id, category, text, text_hash, project_id, source, tags, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (entry_id, category, text, text_hash, project_id, source, json.dumps(tags or []), now)
    )
    conn.execute("INSERT INTO memories_fts (id, text, category) VALUES (?,?,?)", (entry_id, text, category))
    conn.commit()

    vector = _get_embed_model().encode(text).tolist()
    lance_db.open_table("memory_vec").add([{
        "id": entry_id, "vector": vector, "category": category,
        "text": text, "project_id": project_id, "ts": now
    }])

    _async_obsidian_export(category, text, entry_id)
    conn.close()
    return {"id": entry_id, "category": category, "text_hash": text_hash}


@mcp.tool()
def query_memory(query: str, category: str | None = None, limit: int = 5) -> list[dict]:
    """
    Semantic search over memories. Returns {id, category, text, score}.
    Never returns a full prose dump.
    """
    memory_dir, _, _ = _resolve_paths()
    lance_db    = _init_lancedb(_get_db_paths(memory_dir)["lancedb"])
    project_id  = _current_project_id()
    query_vec   = _get_embed_model().encode(query).tolist()

    results = (
        lance_db.open_table("memory_vec")
        .search(query_vec)
        .where(f"project_id = '{project_id}'")
        .limit(limit)
        .to_list()
    )
    if category:
        results = [r for r in results if r["category"] == category]

    return [{"id": r["id"], "category": r["category"],
             "text": r["text"][:500], "score": round(float(r["_distance"]), 4)}
            for r in results]


@mcp.tool()
def get_context() -> dict:
    """
    Compact typed session context. Replaces WAKEUP.md — 95% fewer tokens.
    Returns: {stage, blockers, open_questions, critical_facts, last_session_summary}
    """
    memory_dir, _, _ = _resolve_paths()
    conn       = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    row        = conn.execute("SELECT * FROM session_state WHERE project_id = ?", (project_id,)).fetchone()
    conn.close()

    if not row:
        return {"stage": "unknown", "blockers": [], "open_questions": [],
                "critical_facts": [], "last_session_summary": None}
    return {
        "stage":                row["stage"],
        "blockers":             json.loads(row["blockers"] or "[]"),
        "open_questions":       json.loads(row["open_questions"] or "[]"),
        "critical_facts":       json.loads(row["critical_facts"] or "[]"),
        "last_session_summary": row["last_session_summary"],
    }


@mcp.tool()
def set_context(stage: str | None = None, blockers: list[str] | None = None,
                open_questions: list[str] | None = None,
                critical_facts: list[str] | None = None,
                last_session_summary: str | None = None) -> dict:
    """Update session state. Only provided fields are changed."""
    memory_dir, _, _ = _resolve_paths()
    conn       = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    now        = datetime.now(timezone.utc).isoformat()
    existing   = conn.execute("SELECT * FROM session_state WHERE project_id = ?", (project_id,)).fetchone()

    if existing:
        updates = {"updated_at": now}
        if stage is not None:                updates["stage"] = stage
        if blockers is not None:             updates["blockers"] = json.dumps(blockers)
        if open_questions is not None:       updates["open_questions"] = json.dumps(open_questions)
        if critical_facts is not None:       updates["critical_facts"] = json.dumps(critical_facts)
        if last_session_summary is not None: updates["last_session_summary"] = last_session_summary
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE session_state SET {set_clause} WHERE project_id = ?",
                     (*updates.values(), project_id))
    else:
        conn.execute(
            "INSERT INTO session_state (project_id, stage, blockers, open_questions, critical_facts, last_session_summary, updated_at) VALUES (?,?,?,?,?,?,?)",
            (project_id, stage, json.dumps(blockers or []), json.dumps(open_questions or []),
             json.dumps(critical_facts or []), last_session_summary, now)
        )
    conn.commit()
    conn.close()
    return {"updated": True, "project_id": project_id}


@mcp.tool()
def set_file_summary(file_path: str, summary: str) -> dict:
    """
    Store a 1-line semantic summary for a file.
    Call after any file analysis. Prevents re-reading files.
    """
    memory_dir, _, _ = _resolve_paths()
    db_paths   = _get_db_paths(memory_dir)
    conn       = _init_sqlite(db_paths["sqlite"])
    lance_db   = _init_lancedb(db_paths["lancedb"])
    project_id = _current_project_id()
    now        = datetime.now(timezone.utc).isoformat()

    full_path  = os.path.join(os.getcwd(), file_path) if not os.path.isabs(file_path) else file_path
    file_hash  = ""
    if os.path.exists(full_path):
        with open(full_path, "rb") as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()[:16]

    summary_hash = hashlib.sha256(summary.encode()).hexdigest()[:16]
    conn.execute(
        "INSERT OR REPLACE INTO file_summaries (path, project_id, summary, summary_hash, file_hash, updated_at) VALUES (?,?,?,?,?,?)",
        (file_path, project_id, summary, summary_hash, file_hash, now)
    )
    conn.commit()

    vector = _get_embed_model().encode(summary).tolist()
    table  = lance_db.open_table("file_summaries_vec")
    table.delete(f"path = '{file_path}'")
    table.add([{"path": file_path, "vector": vector, "project_id": project_id, "summary": summary}])

    conn.close()
    return {"path": file_path, "summary_hash": summary_hash, "file_hash": file_hash}


@mcp.tool()
def get_file_summary(file_path: str) -> dict:
    """
    Get stored summary for a file. Returns staleness signal if file has changed.
    Always call this before reading a file to avoid token waste.
    """
    memory_dir, _, _ = _resolve_paths()
    conn       = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    row        = conn.execute(
        "SELECT * FROM file_summaries WHERE path = ? AND project_id = ?", (file_path, project_id)
    ).fetchone()
    conn.close()

    if not row:
        return {"found": False, "path": file_path}

    full_path = os.path.join(os.getcwd(), file_path) if not os.path.isabs(file_path) else file_path
    current_hash = ""
    if os.path.exists(full_path):
        with open(full_path, "rb") as f:
            current_hash = hashlib.sha256(f.read()).hexdigest()[:16]

    return {
        "found": True, "path": file_path, "summary": row["summary"],
        "is_stale": current_hash != row["file_hash"] if current_hash else False,
        "updated_at": row["updated_at"]
    }


@mcp.tool()
def find_related_files(query: str, limit: int = 5) -> list[dict]:
    """Semantic search over file summaries. Returns relevant files without reading them."""
    memory_dir, _, _ = _resolve_paths()
    lance_db   = _init_lancedb(_get_db_paths(memory_dir)["lancedb"])
    project_id = _current_project_id()
    query_vec  = _get_embed_model().encode(query).tolist()

    results = (
        lance_db.open_table("file_summaries_vec")
        .search(query_vec)
        .where(f"project_id = '{project_id}'")
        .limit(limit)
        .to_list()
    )
    return [{"path": r["path"], "summary": r["summary"],
             "score": round(float(r["_distance"]), 4)} for r in results]
```

Write to AGENT_STATE.md: `step_5_2_new_mcp_tools: complete`

---

## Step 5.3 — Decouple Obsidian Sync

Find all Obsidian sync calls in `server.py`. Wrap in fire-and-forget helper. Never block on it.

```python
def _async_obsidian_export(category: str, text: str, entry_id: str):
    """Fire-and-forget. Obsidian export failures must never propagate."""
    ctx = _find_project_context()
    if not ctx:
        return
    if not ctx.get("obsidian_sync", {}).get("enabled", False):
        return
    def _export():
        try:
            pass  # move existing Obsidian write logic here
        except Exception:
            pass
    threading.Thread(target=_export, daemon=True).start()
```

Add to `.claude-project` schema default: `"obsidian_sync": {"enabled": false}`
Obsidian is now **opt-in, off by default.**

Write to AGENT_STATE.md: `step_5_3_obsidian_decoupled: complete`

---

## Step 5.4 — Build and Test

```bash
# Smoke test all new tools register correctly
python3 -c "
import sys; sys.path.insert(0, 'mcp')
from server import mcp
tools = [t.name for t in mcp.list_tools()]
required = ['store_memory','query_memory','get_context','set_context',
            'set_file_summary','get_file_summary','find_related_files']
missing = [t for t in required if t not in tools]
print('MISSING:', missing) if missing else print('ALL TOOLS OK')
"

# Test round-trip: set_context → get_context
python3 -c "
# call set_context with test data, then get_context, assert values match
print('Round-trip test — implement inline or via MCP client')
"
```

Write to AGENT_STATE.md:
```json
{
  "phase": "phase5_database_complete",
  "new_tools_registered": true,
  "obsidian_decoupled": true,
  "round_trip_test_passed": true
}
```

**Phase 2 complete. Then read: `06_PHASE3_PD_REGISTRY.md`**
```

***

That's all 6 files from Batch 1. Ready for **Batch 2** whenever you say so — that's the PD registry, typed dispatch, compression layer, testing strategy, and the AGENT_STATE template.

Bronnen


Got it — same method. I'll write each file directly here, one per prompt. Starting with the first file of Batch 2:

***

## `06_PHASE3_PD_REGISTRY.md`

```markdown
# 06 — PHASE 3: PROTOCOL DOCUMENT REGISTRY
## Content-Addressed PD Store + Negotiation Controller

> **Checkpoint ID:** `phase6_pd_registry`
> **Prerequisites:** Phase 5 (database layer) complete
> **Goal:** Every inter-agent interaction can be governed by a reusable, hash-addressed Protocol Document.
> **Research:** `agora_protocol.pdf`, `lacp_2504.15854.pdf`, `multiagent_survey_2502.14321.pdf`

---

## Context Budget Warning

This phase creates one new Python module and adds 5 MCP tools.
If context compacts mid-phase:
1. Read AGENT_STATE.md → find last completed step
2. Read ONLY this file
3. Resume from last completed step
4. The pd_registry table already exists from Phase 4 — do not recreate it

---

## What a Protocol Document Is

A Protocol Document (PD) is a compact, machine-readable agreement between two agents
about how they will communicate for a specific task type. It replaces natural language
negotiation on every message with a one-time negotiation cost.

**PD format (YAML header + body):**

```yaml
***
pd_version: "1.0"
task_type: code_gen
interaction_pair: user→main
format: typed_pseudocode
compression: llmlingua
token_budget: 2000
output_schema:
  type: object
  fields:
    - name: files_modified
      type: list[string]
    - name: summary
      type: string
      max_chars: 200
    - name: next_action
      type: enum
      values: [done, needs_review, blocked]
negotiated_at: "2026-03-26T14:00:00Z"
negotiated_by: negotiation_controller
***
# Communication Rules
1. Omit all preamble. Start directly with output.
2. File paths are relative to project root.
3. summary field: one sentence max.
4. next_action: always explicit.
```

The SHA-256 of the full PD text (header + body) is its permanent ID.

---

## Step 6.1 — Create pd-registry.py Module

**Create file:** `mcp/pd_registry.py`

```python
# mcp/pd_registry.py
import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def register_pd_entry(
    conn: sqlite3.Connection,
    text: str,
    task_type: str,
    interaction_pair: str,
    created_by: str,
    yaml_meta: Optional[dict] = None,
) -> dict:
    """
    Content-address and store a Protocol Document.
    Returns {id, is_new} — id is SHA-256 of full text.
    If identical PD already exists, returns existing id with is_new=False.
    """
    pd_id = _sha256(text)
    now = datetime.now(timezone.utc).isoformat()

    existing = conn.execute(
        "SELECT id, use_count FROM pd_registry WHERE id = ?", (pd_id,)
    ).fetchone()

    if existing:
        return {"id": pd_id, "is_new": False, "use_count": existing["use_count"]}

    conn.execute(
        """INSERT INTO pd_registry
           (id, text, yaml_meta, task_type, interaction_pair, created_at, created_by,
            use_count, deprecated)
           VALUES (?,?,?,?,?,?,?,0,0)""",
        (
            pd_id, text,
            json.dumps(yaml_meta) if yaml_meta else None,
            task_type, interaction_pair, now, created_by,
        ),
    )
    conn.commit()
    return {"id": pd_id, "is_new": True, "use_count": 0}


def get_pd_entry(conn: sqlite3.Connection, pd_id: str) -> Optional[dict]:
    row = conn.execute("SELECT * FROM pd_registry WHERE id = ?", (pd_id,)).fetchone()
    if not row:
        return None
    return dict(row)


def search_pd_entries(
    conn: sqlite3.Connection,
    task_type: Optional[str] = None,
    interaction_pair: Optional[str] = None,
    limit: int = 5,
) -> list[dict]:
    """
    Find matching PDs by task_type and/or interaction_pair.
    Returns most-used, non-deprecated PDs first.
    """
    clauses = ["deprecated = 0"]
    params = []
    if task_type:
        clauses.append("task_type = ?")
        params.append(task_type)
    if interaction_pair:
        clauses.append("interaction_pair = ?")
        params.append(interaction_pair)

    where = " AND ".join(clauses)
    rows = conn.execute(
        f"SELECT id, task_type, interaction_pair, use_count, created_at "
        f"FROM pd_registry WHERE {where} ORDER BY use_count DESC LIMIT ?",
        (*params, limit),
    ).fetchall()
    return [dict(r) for r in rows]


def log_pd_use(
    conn: sqlite3.Connection,
    pd_id: str,
    dispatch_id: str,
    session_id: str,
    project_id: str,
    tokens_saved: Optional[int] = None,
) -> None:
    """Record a PD usage event and increment use_count."""
    now = datetime.now(timezone.utc).isoformat()
    log_id = str(uuid.uuid4())[:8]

    conn.execute(
        """INSERT INTO pd_usage_log
           (id, pd_id, dispatch_id, session_id, project_id, tokens_saved, ts)
           VALUES (?,?,?,?,?,?,?)""",
        (log_id, pd_id, dispatch_id, session_id, project_id, tokens_saved, now),
    )
    conn.execute(
        "UPDATE pd_registry SET use_count = use_count + 1, last_used = ? WHERE id = ?",
        (now, pd_id),
    )
    conn.commit()


def deprecate_pd(
    conn: sqlite3.Connection, pd_id: str, superseded_by: Optional[str] = None
) -> dict:
    conn.execute(
        "UPDATE pd_registry SET deprecated = 1, superseded_by = ? WHERE id = ?",
        (superseded_by, pd_id),
    )
    conn.commit()
    return {"deprecated": pd_id, "superseded_by": superseded_by}


def increment_interaction_count(
    conn: sqlite3.Connection, pair: str, project_id: str
) -> int:
    """Increment and return new count for an interaction pair."""
    now = datetime.now(timezone.utc).isoformat()
    existing = conn.execute(
        "SELECT count FROM interaction_counts WHERE pair = ? AND project_id = ?",
        (pair, project_id),
    ).fetchone()

    if existing:
        new_count = existing["count"] + 1
        conn.execute(
            "UPDATE interaction_counts SET count = ?, last_seen = ? WHERE pair = ? AND project_id = ?",
            (new_count, now, pair, project_id),
        )
    else:
        new_count = 1
        conn.execute(
            "INSERT INTO interaction_counts (pair, project_id, count, last_seen) VALUES (?,?,?,?)",
            (pair, project_id, 1, now),
        )
    conn.commit()
    return new_count
```

Write to AGENT_STATE.md: `step_6_1_pd_registry_module: complete`

---

## Step 6.2 — Add PD MCP Tools to server.py

**Add to `mcp/server.py`:**

```python
from pd_registry import (
    register_pd_entry, get_pd_entry, search_pd_entries,
    log_pd_use, deprecate_pd, increment_interaction_count,
)

@mcp.tool()
def register_pd(text: str, task_type: str, interaction_pair: str) -> dict:
    """
    Register a new Protocol Document.
    text: full PD content (YAML header + body rules).
    Returns: {id, is_new} — id is SHA-256, stable forever.
    If same PD already registered, returns existing id without duplication.
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    result = register_pd_entry(
        conn, text, task_type, interaction_pair,
        created_by="negotiation_controller"
    )
    conn.close()
    return result


@mcp.tool()
def get_pd(pd_id: str) -> dict:
    """
    Retrieve a Protocol Document by its SHA-256 id.
    Returns full PD text + metadata, or {found: false}.
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    entry = get_pd_entry(conn, pd_id)
    conn.close()
    if not entry:
        return {"found": False, "id": pd_id}
    return {
        "found": True,
        "id": entry["id"],
        "text": entry["text"],
        "task_type": entry["task_type"],
        "interaction_pair": entry["interaction_pair"],
        "use_count": entry["use_count"],
        "created_at": entry["created_at"],
        "deprecated": bool(entry["deprecated"]),
        "superseded_by": entry["superseded_by"],
    }


@mcp.tool()
def search_pd(task_type: str | None = None,
              interaction_pair: str | None = None,
              limit: int = 5) -> list[dict]:
    """
    Search for existing Protocol Documents.
    Call this BEFORE negotiating a new PD — reuse before creating.
    Returns: [{id, task_type, interaction_pair, use_count, created_at}]
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    results = search_pd_entries(conn, task_type, interaction_pair, limit)
    conn.close()
    return results


@mcp.tool()
def log_pd_usage(pd_id: str, dispatch_id: str, tokens_saved: int | None = None) -> dict:
    """
    Record that a PD was used in a dispatch. Increments use_count.
    tokens_saved: estimated tokens saved vs natural language baseline.
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    session_id = os.getenv("CLAUDE_SESSION_ID", "unknown")
    log_pd_use(conn, pd_id, dispatch_id, session_id, project_id, tokens_saved)
    conn.close()
    return {"logged": True, "pd_id": pd_id}


@mcp.tool()
def check_negotiation_threshold(interaction_pair: str) -> dict:
    """
    Check if an interaction pair has hit the PD negotiation threshold.
    Returns: {pair, count, threshold, should_negotiate, existing_pd_id}
    Call this at the start of each dispatch to decide if a PD should be negotiated.
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    threshold = 3  # default; read from .claude-project if configured

    row = conn.execute(
        "SELECT count, pd_assigned FROM interaction_counts WHERE pair = ? AND project_id = ?",
        (interaction_pair, project_id)
    ).fetchone()

    count = row["count"] if row else 0
    pd_assigned = row["pd_assigned"] if row else None

    conn.close()
    return {
        "pair": interaction_pair,
        "count": count,
        "threshold": threshold,
        "should_negotiate": count >= threshold and pd_assigned is None,
        "existing_pd_id": pd_assigned,
    }
```

Write to AGENT_STATE.md: `step_6_2_pd_mcp_tools: complete`

---

## Step 6.3 — Add Negotiation Controller Agent to .claude-project

In `.claude-project` (or the default schema), add this agent definition:

```json
{
  "agents": {
    "negotiation_controller": {
      "id": "negotiation_controller",
      "role": "protocol_negotiator",
      "model": "claude-opus-4-5",
      "backend": "claude",
      "system_prompt": "You design Protocol Documents (PDs) for inter-agent communication. A PD is a compact YAML+rules document that replaces natural language negotiation. When asked to negotiate a PD: 1) call search_pd first — reuse if match found. 2) If no match: design a minimal PD with YAML header (pd_version, task_type, interaction_pair, format, output_schema) and numbered rules. 3) Call register_pd to store it. 4) Return only the pd_id. Never return the full PD text in your response.",
      "tools": ["search_pd", "register_pd", "get_pd", "log_pd_usage", "check_negotiation_threshold"],
      "trigger": "interaction_threshold_reached"
    }
  }
}
```

Write to AGENT_STATE.md: `step_6_3_negotiation_controller_defined: complete`

---

## Step 6.4 — Wire Threshold Check into dispatch-runner.ts

In `dispatch-runner.ts`, before the API call, add:

```typescript
// Check if PD negotiation is needed for this interaction pair
const interactionPair = inferInteractionPair(dispatch.agent);
// Call check_negotiation_threshold via MCP, or direct DB query
// If should_negotiate === true and no existing_pd_id:
//   fire negotiation_controller agent (async, non-blocking for current dispatch)
//   current dispatch continues in natural_language mode
// If existing_pd_id present:
//   dispatch.protocol_id = existing_pd_id
//   dispatch.protocol_condition = "pd_negotiated"
```

The negotiation always happens **after the current dispatch completes** — never blocking it.
Record `protocol_condition = "natural_language"` for the current dispatch regardless.

Write to AGENT_STATE.md: `step_6_4_threshold_wired: complete`

---

## Step 6.5 — Test PD Registry

```bash
python3 -c "
import sys; sys.path.insert(0, 'mcp')
import sqlite3
from pd_registry import register_pd_entry, search_pd_entries, log_pd_use, get_pd_entry

conn = sqlite3.connect('/tmp/test_pd.db')
conn.row_factory = sqlite3.Row
conn.execute(open('schema_init.sql').read())  # or inline CREATE TABLE

test_pd = '''---
pd_version: \"1.0\"
task_type: code_gen
interaction_pair: user→main
format: typed_pseudocode
***
1. Output files_modified list first.
2. Summary max 1 sentence.
3. next_action always explicit.
'''

r1 = register_pd_entry(conn, test_pd, 'code_gen', 'user→main', 'test')
r2 = register_pd_entry(conn, test_pd, 'code_gen', 'user→main', 'test')  # should return is_new=False
assert r1['id'] == r2['id'], 'Content-addressing broken'
assert not r2['is_new'], 'Dedup broken'

results = search_pd_entries(conn, task_type='code_gen')
assert len(results) > 0, 'Search broken'

entry = get_pd_entry(conn, r1['id'])
assert entry['text'] == test_pd, 'Retrieval broken'

print('ALL PD REGISTRY TESTS PASSED')
conn.close()
"
```

Write to AGENT_STATE.md:
```json
{
  "phase": "phase6_pd_registry_complete",
  "pd_module_created": true,
  "mcp_tools_added": 5,
  "dedup_test_passed": true,
  "negotiation_controller_defined": true
}
```

**Phase 3 complete. Then read: `07_PHASE4_TYPED_DISPATCH.md`**
```

***

Say **"next"** for `07_PHASE4_TYPED_DISPATCH.md`.

Bronnen

Got it — same method. I'll write each file directly here, one per prompt. Starting with the first file of Batch 2:

***

## `06_PHASE3_PD_REGISTRY.md`

```markdown
# 06 — PHASE 3: PROTOCOL DOCUMENT REGISTRY
## Content-Addressed PD Store + Negotiation Controller

> **Checkpoint ID:** `phase6_pd_registry`
> **Prerequisites:** Phase 5 (database layer) complete
> **Goal:** Every inter-agent interaction can be governed by a reusable, hash-addressed Protocol Document.
> **Research:** `agora_protocol.pdf`, `lacp_2504.15854.pdf`, `multiagent_survey_2502.14321.pdf`

---

## Context Budget Warning

This phase creates one new Python module and adds 5 MCP tools.
If context compacts mid-phase:
1. Read AGENT_STATE.md → find last completed step
2. Read ONLY this file
3. Resume from last completed step
4. The pd_registry table already exists from Phase 4 — do not recreate it

---

## What a Protocol Document Is

A Protocol Document (PD) is a compact, machine-readable agreement between two agents
about how they will communicate for a specific task type. It replaces natural language
negotiation on every message with a one-time negotiation cost.

**PD format (YAML header + body):**

```yaml
***
pd_version: "1.0"
task_type: code_gen
interaction_pair: user→main
format: typed_pseudocode
compression: llmlingua
token_budget: 2000
output_schema:
  type: object
  fields:
    - name: files_modified
      type: list[string]
    - name: summary
      type: string
      max_chars: 200
    - name: next_action
      type: enum
      values: [done, needs_review, blocked]
negotiated_at: "2026-03-26T14:00:00Z"
negotiated_by: negotiation_controller
***
# Communication Rules
1. Omit all preamble. Start directly with output.
2. File paths are relative to project root.
3. summary field: one sentence max.
4. next_action: always explicit.
```

The SHA-256 of the full PD text (header + body) is its permanent ID.

---

## Step 6.1 — Create pd-registry.py Module

**Create file:** `mcp/pd_registry.py`

```python
# mcp/pd_registry.py
import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def register_pd_entry(
    conn: sqlite3.Connection,
    text: str,
    task_type: str,
    interaction_pair: str,
    created_by: str,
    yaml_meta: Optional[dict] = None,
) -> dict:
    """
    Content-address and store a Protocol Document.
    Returns {id, is_new} — id is SHA-256 of full text.
    If identical PD already exists, returns existing id with is_new=False.
    """
    pd_id = _sha256(text)
    now = datetime.now(timezone.utc).isoformat()

    existing = conn.execute(
        "SELECT id, use_count FROM pd_registry WHERE id = ?", (pd_id,)
    ).fetchone()

    if existing:
        return {"id": pd_id, "is_new": False, "use_count": existing["use_count"]}

    conn.execute(
        """INSERT INTO pd_registry
           (id, text, yaml_meta, task_type, interaction_pair, created_at, created_by,
            use_count, deprecated)
           VALUES (?,?,?,?,?,?,?,0,0)""",
        (
            pd_id, text,
            json.dumps(yaml_meta) if yaml_meta else None,
            task_type, interaction_pair, now, created_by,
        ),
    )
    conn.commit()
    return {"id": pd_id, "is_new": True, "use_count": 0}


def get_pd_entry(conn: sqlite3.Connection, pd_id: str) -> Optional[dict]:
    row = conn.execute("SELECT * FROM pd_registry WHERE id = ?", (pd_id,)).fetchone()
    if not row:
        return None
    return dict(row)


def search_pd_entries(
    conn: sqlite3.Connection,
    task_type: Optional[str] = None,
    interaction_pair: Optional[str] = None,
    limit: int = 5,
) -> list[dict]:
    """
    Find matching PDs by task_type and/or interaction_pair.
    Returns most-used, non-deprecated PDs first.
    """
    clauses = ["deprecated = 0"]
    params = []
    if task_type:
        clauses.append("task_type = ?")
        params.append(task_type)
    if interaction_pair:
        clauses.append("interaction_pair = ?")
        params.append(interaction_pair)

    where = " AND ".join(clauses)
    rows = conn.execute(
        f"SELECT id, task_type, interaction_pair, use_count, created_at "
        f"FROM pd_registry WHERE {where} ORDER BY use_count DESC LIMIT ?",
        (*params, limit),
    ).fetchall()
    return [dict(r) for r in rows]


def log_pd_use(
    conn: sqlite3.Connection,
    pd_id: str,
    dispatch_id: str,
    session_id: str,
    project_id: str,
    tokens_saved: Optional[int] = None,
) -> None:
    """Record a PD usage event and increment use_count."""
    now = datetime.now(timezone.utc).isoformat()
    log_id = str(uuid.uuid4())[:8]

    conn.execute(
        """INSERT INTO pd_usage_log
           (id, pd_id, dispatch_id, session_id, project_id, tokens_saved, ts)
           VALUES (?,?,?,?,?,?,?)""",
        (log_id, pd_id, dispatch_id, session_id, project_id, tokens_saved, now),
    )
    conn.execute(
        "UPDATE pd_registry SET use_count = use_count + 1, last_used = ? WHERE id = ?",
        (now, pd_id),
    )
    conn.commit()


def deprecate_pd(
    conn: sqlite3.Connection, pd_id: str, superseded_by: Optional[str] = None
) -> dict:
    conn.execute(
        "UPDATE pd_registry SET deprecated = 1, superseded_by = ? WHERE id = ?",
        (superseded_by, pd_id),
    )
    conn.commit()
    return {"deprecated": pd_id, "superseded_by": superseded_by}


def increment_interaction_count(
    conn: sqlite3.Connection, pair: str, project_id: str
) -> int:
    """Increment and return new count for an interaction pair."""
    now = datetime.now(timezone.utc).isoformat()
    existing = conn.execute(
        "SELECT count FROM interaction_counts WHERE pair = ? AND project_id = ?",
        (pair, project_id),
    ).fetchone()

    if existing:
        new_count = existing["count"] + 1
        conn.execute(
            "UPDATE interaction_counts SET count = ?, last_seen = ? WHERE pair = ? AND project_id = ?",
            (new_count, now, pair, project_id),
        )
    else:
        new_count = 1
        conn.execute(
            "INSERT INTO interaction_counts (pair, project_id, count, last_seen) VALUES (?,?,?,?)",
            (pair, project_id, 1, now),
        )
    conn.commit()
    return new_count
```

Write to AGENT_STATE.md: `step_6_1_pd_registry_module: complete`

---

## Step 6.2 — Add PD MCP Tools to server.py

**Add to `mcp/server.py`:**

```python
from pd_registry import (
    register_pd_entry, get_pd_entry, search_pd_entries,
    log_pd_use, deprecate_pd, increment_interaction_count,
)

@mcp.tool()
def register_pd(text: str, task_type: str, interaction_pair: str) -> dict:
    """
    Register a new Protocol Document.
    text: full PD content (YAML header + body rules).
    Returns: {id, is_new} — id is SHA-256, stable forever.
    If same PD already registered, returns existing id without duplication.
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    result = register_pd_entry(
        conn, text, task_type, interaction_pair,
        created_by="negotiation_controller"
    )
    conn.close()
    return result


@mcp.tool()
def get_pd(pd_id: str) -> dict:
    """
    Retrieve a Protocol Document by its SHA-256 id.
    Returns full PD text + metadata, or {found: false}.
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    entry = get_pd_entry(conn, pd_id)
    conn.close()
    if not entry:
        return {"found": False, "id": pd_id}
    return {
        "found": True,
        "id": entry["id"],
        "text": entry["text"],
        "task_type": entry["task_type"],
        "interaction_pair": entry["interaction_pair"],
        "use_count": entry["use_count"],
        "created_at": entry["created_at"],
        "deprecated": bool(entry["deprecated"]),
        "superseded_by": entry["superseded_by"],
    }


@mcp.tool()
def search_pd(task_type: str | None = None,
              interaction_pair: str | None = None,
              limit: int = 5) -> list[dict]:
    """
    Search for existing Protocol Documents.
    Call this BEFORE negotiating a new PD — reuse before creating.
    Returns: [{id, task_type, interaction_pair, use_count, created_at}]
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    results = search_pd_entries(conn, task_type, interaction_pair, limit)
    conn.close()
    return results


@mcp.tool()
def log_pd_usage(pd_id: str, dispatch_id: str, tokens_saved: int | None = None) -> dict:
    """
    Record that a PD was used in a dispatch. Increments use_count.
    tokens_saved: estimated tokens saved vs natural language baseline.
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    session_id = os.getenv("CLAUDE_SESSION_ID", "unknown")
    log_pd_use(conn, pd_id, dispatch_id, session_id, project_id, tokens_saved)
    conn.close()
    return {"logged": True, "pd_id": pd_id}


@mcp.tool()
def check_negotiation_threshold(interaction_pair: str) -> dict:
    """
    Check if an interaction pair has hit the PD negotiation threshold.
    Returns: {pair, count, threshold, should_negotiate, existing_pd_id}
    Call this at the start of each dispatch to decide if a PD should be negotiated.
    """
    memory_dir, _, _ = _resolve_paths()
    conn = _init_sqlite(_get_db_paths(memory_dir)["sqlite"])
    project_id = _current_project_id()
    threshold = 3  # default; read from .claude-project if configured

    row = conn.execute(
        "SELECT count, pd_assigned FROM interaction_counts WHERE pair = ? AND project_id = ?",
        (interaction_pair, project_id)
    ).fetchone()

    count = row["count"] if row else 0
    pd_assigned = row["pd_assigned"] if row else None

    conn.close()
    return {
        "pair": interaction_pair,
        "count": count,
        "threshold": threshold,
        "should_negotiate": count >= threshold and pd_assigned is None,
        "existing_pd_id": pd_assigned,
    }
```

Write to AGENT_STATE.md: `step_6_2_pd_mcp_tools: complete`

---

## Step 6.3 — Add Negotiation Controller Agent to .claude-project

In `.claude-project` (or the default schema), add this agent definition:

```json
{
  "agents": {
    "negotiation_controller": {
      "id": "negotiation_controller",
      "role": "protocol_negotiator",
      "model": "claude-opus-4-5",
      "backend": "claude",
      "system_prompt": "You design Protocol Documents (PDs) for inter-agent communication. A PD is a compact YAML+rules document that replaces natural language negotiation. When asked to negotiate a PD: 1) call search_pd first — reuse if match found. 2) If no match: design a minimal PD with YAML header (pd_version, task_type, interaction_pair, format, output_schema) and numbered rules. 3) Call register_pd to store it. 4) Return only the pd_id. Never return the full PD text in your response.",
      "tools": ["search_pd", "register_pd", "get_pd", "log_pd_usage", "check_negotiation_threshold"],
      "trigger": "interaction_threshold_reached"
    }
  }
}
```

Write to AGENT_STATE.md: `step_6_3_negotiation_controller_defined: complete`

---

## Step 6.4 — Wire Threshold Check into dispatch-runner.ts

In `dispatch-runner.ts`, before the API call, add:

```typescript
// Check if PD negotiation is needed for this interaction pair
const interactionPair = inferInteractionPair(dispatch.agent);
// Call check_negotiation_threshold via MCP, or direct DB query
// If should_negotiate === true and no existing_pd_id:
//   fire negotiation_controller agent (async, non-blocking for current dispatch)
//   current dispatch continues in natural_language mode
// If existing_pd_id present:
//   dispatch.protocol_id = existing_pd_id
//   dispatch.protocol_condition = "pd_negotiated"
```

The negotiation always happens **after the current dispatch completes** — never blocking it.
Record `protocol_condition = "natural_language"` for the current dispatch regardless.

Write to AGENT_STATE.md: `step_6_4_threshold_wired: complete`

---

## Step 6.5 — Test PD Registry

```bash
python3 -c "
import sys; sys.path.insert(0, 'mcp')
import sqlite3
from pd_registry import register_pd_entry, search_pd_entries, log_pd_use, get_pd_entry

conn = sqlite3.connect('/tmp/test_pd.db')
conn.row_factory = sqlite3.Row
conn.execute(open('schema_init.sql').read())  # or inline CREATE TABLE

test_pd = '''---
pd_version: \"1.0\"
task_type: code_gen
interaction_pair: user→main
format: typed_pseudocode
***
1. Output files_modified list first.
2. Summary max 1 sentence.
3. next_action always explicit.
'''

r1 = register_pd_entry(conn, test_pd, 'code_gen', 'user→main', 'test')
r2 = register_pd_entry(conn, test_pd, 'code_gen', 'user→main', 'test')  # should return is_new=False
assert r1['id'] == r2['id'], 'Content-addressing broken'
assert not r2['is_new'], 'Dedup broken'

results = search_pd_entries(conn, task_type='code_gen')
assert len(results) > 0, 'Search broken'

entry = get_pd_entry(conn, r1['id'])
assert entry['text'] == test_pd, 'Retrieval broken'

print('ALL PD REGISTRY TESTS PASSED')
conn.close()
"
```

Write to AGENT_STATE.md:
```json
{
  "phase": "phase6_pd_registry_complete",
  "pd_module_created": true,
  "mcp_tools_added": 5,
  "dedup_test_passed": true,
  "negotiation_controller_defined": true
}
```

**Phase 3 complete. Then read: `07_PHASE4_TYPED_DISPATCH.md`**
```

***

Say **"next"** for `07_PHASE4_TYPED_DISPATCH.md`.

Bronnen


## `07_PHASE4_TYPED_DISPATCH.md`

```markdown
# 07 — PHASE 4: TYPED DISPATCH & TASK ROUTING
## Format Selection Per Task Type + Backend Routing

> **Checkpoint ID:** `phase7_typed_dispatch`
> **Prerequisites:** Phase 6 (PD registry) complete
> **Goal:** Every dispatch is encoded in the most token-efficient format for its task type.
>           Natural language is the fallback, never the default.
> **Research:** `codeagents_2507.03254.pdf` (55-87% reduction), `anka_dsl_2512.23214.pdf`,
>               `codeact_2402.01030.pdf`

---

## Context Budget Warning

This phase modifies dispatch-runner.ts and creates one new module (format-encoder.ts).
If context compacts mid-phase:
1. Read AGENT_STATE.md → find last completed step
2. Read ONLY this file (07_PHASE4_TYPED_DISPATCH.md)
3. Resume from last completed step

---

## Format Selection Logic

Each task type maps to an optimal encoding format based on published benchmarks.
The format determines how the dispatch body is encoded before sending to the API.

| Task Type     | Primary Format     | Fallback     | Token Saving vs NL |
|---------------|-------------------|--------------|-------------------|
| code_gen      | typed_pseudocode  | CodeAct      | 55–87%            |
| refactor      | typed_pseudocode  | CodeAct      | 55–87%            |
| test_gen      | typed_pseudocode  | CodeAct      | 55–87%            |
| pipeline      | DSL               | typed_pseudo | 40–70%            |
| analysis      | TOON              | typed_pseudo | 30–50%            |
| retrieval     | TOON              | natural_lang | 30–50%            |
| planning      | natural_language  | —            | 0% (NL optimal)   |
| documentation | natural_language  | —            | 0% (NL optimal)   |
| unknown       | natural_language  | —            | 0% (NL optimal)   |

**Rule:** Never apply compression to `planning` or `documentation` — these depend on
natural language nuance and compression degrades quality.

---

## Step 7.1 — Create format-encoder.ts

**Create file:** `src/lib/format-encoder.ts`

```typescript
// src/lib/format-encoder.ts
import { TaskType } from "./research-db.js";

export type DispatchFormat =
  | "typed_pseudocode"
  | "codeact"
  | "dsl"
  | "toon"
  | "natural_language";

export interface EncodedDispatch {
  format: DispatchFormat;
  encoded_body: string;
  original_chars: number;
  encoded_chars: number;
  compression_ratio: number;
}

// DSL grammar header for pipeline tasks (Anka-style)
const DSL_GRAMMAR_HEADER = `
# DSL Grammar v1.0
# PIPELINE := STEP+
# STEP := step_id ":" ACTION ("→" STEP_ID)*
# ACTION := "read" | "transform" | "write" | "call" | "branch"
# Types: str, int, float, bool, list[T], dict[K,V], optional[T]
`.trim();

// Typed pseudocode wrapper
function encodeAsTypedPseudocode(body: string, taskType: TaskType): string {
  return `[DISPATCH:${taskType.toUpperCase()}]
INPUT: string
OUTPUT: {
  result: string,
  files_modified: list[string],
  next_action: "done" | "needs_review" | "blocked",
  summary: string  // max 1 sentence
}
RULES:
  - Omit all preamble
  - Start directly with OUTPUT
  - file paths relative to project root
TASK:
${body.trim()}
[/DISPATCH]`;
}

// CodeAct wrapper — executable Python/bash actions
function encodeAsCodeAct(body: string): string {
  return `<action_request>
<format>codeact</format>
<task>${body.trim()}</task>
<constraints>
  - Express actions as executable code blocks
  - Use <execute_python> or <execute_bash> tags
  - Output final result in <result> tag
</constraints>
</action_request>`;
}

// TOON wrapper — Token-Oriented Object Notation
function encodeAsTOON(body: string, taskType: TaskType): string {
  return `{T:${taskType}|Q:${body.trim().replace(/\s+/g, " ")}|O:struct}`;
}

// DSL wrapper for pipeline tasks
function encodeAsDSL(body: string): string {
  return `${DSL_GRAMMAR_HEADER}\n\nPIPELINE:\n${body.trim()}`;
}

export function selectFormat(taskType: TaskType, protocolCondition: string): DispatchFormat {
  // If a PD is active, the PD itself specifies the format — respect it
  if (protocolCondition === "pd_negotiated") return "typed_pseudocode";

  switch (taskType) {
    case "code_gen":
    case "refactor":
    case "test_gen":
      return "typed_pseudocode";
    case "pipeline":
      return "dsl";
    case "analysis":
    case "retrieval":
      return "toon";
    case "planning":
    case "documentation":
    case "unknown":
    default:
      return "natural_language";
  }
}

export function encodeDispatchBody(
  body: string,
  taskType: TaskType,
  format: DispatchFormat
): EncodedDispatch {
  const original_chars = body.length;
  let encoded_body: string;

  switch (format) {
    case "typed_pseudocode":
      encoded_body = encodeAsTypedPseudocode(body, taskType);
      break;
    case "codeact":
      encoded_body = encodeAsCodeAct(body);
      break;
    case "toon":
      encoded_body = encodeAsTOON(body, taskType);
      break;
    case "dsl":
      encoded_body = encodeAsDSL(body);
      break;
    case "natural_language":
    default:
      encoded_body = body;
      break;
  }

  const encoded_chars = encoded_body.length;
  const compression_ratio =
    original_chars > 0
      ? parseFloat((1 - encoded_chars / original_chars).toFixed(4))
      : 0;

  return {
    format,
    encoded_body,
    original_chars,
    encoded_chars,
    compression_ratio,
  };
}
```

Write to AGENT_STATE.md: `step_7_1_format_encoder: complete`

---

## Step 7.2 — Extend DispatchFile Interface

**Modify `src/lib/dispatch-runner.ts`** — extend DispatchFile interface:

```typescript
export interface DispatchFile {
  // --- existing fields (unchanged) ---
  id: string;
  title: string;
  body: string;
  agent?: string;
  priority?: "low" | "normal" | "high";
  status: "pending" | "running" | "completed" | "failed";
  created?: string;
  started_at?: string;
  completed_at?: string;
  source?: string;
  result?: string;
  error?: string;
  tool_calls?: Array<{ tool: string; input: unknown; output_summary: string }>;

  // --- new fields ---
  task_type?: TaskType;
  dispatch_format?: DispatchFormat;
  protocol_condition?: "natural_language" | "typed_schema" | "pd_negotiated";
  protocol_id?: string;
  session_id?: string;
  encoded_chars?: number;
  original_chars?: number;
  compression_ratio?: number;

  // --- upgraded usage (replaces old {input_tokens, output_tokens}) ---
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}
```

Write to AGENT_STATE.md: `step_7_2_dispatch_interface_extended: complete`

---

## Step 7.3 — Wire Format Encoder into runDispatch

**Modify `src/lib/dispatch-runner.ts`** — add imports and encoding step:

Add to imports:
```typescript
import { selectFormat, encodeDispatchBody, DispatchFormat } from "./format-encoder.js";
```

Add encoding step BEFORE the API call (after task classification):

```typescript
// --- Format encoding ---
const taskType = classifyTaskType(dispatch.title, dispatch.body ?? "");
const protocolCondition: string = dispatch.protocol_id ? "pd_negotiated" : "natural_language";
const selectedFormat = selectFormat(taskType, protocolCondition);

const encodingStart = Date.now();
const encoded = encodeDispatchBody(
  dispatch.body ?? "",
  taskType,
  selectedFormat
);
timings.compression = Date.now() - encodingStart;

// Store encoding metadata back onto dispatch for observation recording
dispatch.task_type = taskType;
dispatch.dispatch_format = selectedFormat;
dispatch.encoded_chars = encoded.encoded_chars;
dispatch.original_chars = encoded.original_chars;
dispatch.compression_ratio = encoded.compression_ratio;

// Use encoded body for the actual API call
const messageBody = encoded.encoded_body;
```

Then use `messageBody` (not `dispatch.body`) in the messages array passed to the API.

Write to AGENT_STATE.md: `step_7_3_encoding_wired: complete`

---

## Step 7.4 — Add Backend Routing Field to AgentDefinition

**Modify `src/lib/project.ts`** — extend AgentDefinition:

```typescript
export interface AgentDefinition {
  id: string;
  name?: string;
  role?: string;
  model: string;
  backend: "claude" | "ollama" | "openai" | "local";  // NEW: explicit backend
  system_prompt?: string;
  tools?: string[];
  tags?: string[];
  trigger?: string;
  instructions?: string;
}
```

Add backend routing logic in dispatch-runner.ts:

```typescript
function resolveApiClient(agent: AgentDefinition | undefined) {
  const backend = agent?.backend ?? "claude";
  switch (backend) {
    case "ollama":
      // Return Ollama-compatible client (OpenAI-compatible endpoint)
      return { type: "ollama", baseUrl: process.env["OLLAMA_HOST"] ?? "http://localhost:11434" };
    case "openai":
      return { type: "openai", apiKey: process.env["OPENAI_API_KEY"] ?? "" };
    case "claude":
    default:
      return { type: "claude" };
  }
}
```

**Clarity Layer agent** (runs on Ollama) must always use `backend: "ollama"`.
**negotiation_controller** uses `backend: "claude"` (needs best reasoning).
**All other agents** default to `backend: "claude"` unless explicitly set.

Write to AGENT_STATE.md: `step_7_4_backend_routing: complete`

---

## Step 7.5 — Update DispatchObservation to Record Format

In `dispatch-runner.ts`, in the observation recording block added in Phase 4,
add format fields to the observation:

```typescript
const obs: DispatchObservation = {
  // ... existing fields ...
  tokens: {
    // ... existing ...
  },
  compression: {
    input_raw_chars: dispatch.original_chars ?? dispatch.body?.length ?? 0,
    input_post_clarity: dispatch.original_chars ?? 0,  // updated after clarity layer in Phase 5
    input_post_lingua: dispatch.encoded_chars ?? 0,
    compression_ratio: dispatch.compression_ratio ?? 0,
  },
  // ... rest of existing fields ...
};
```

Write to AGENT_STATE.md: `step_7_5_observation_format_fields: complete`

---

## Step 7.6 — Build and Test

```bash
npm run build

# Verify format selection logic
npx ts-node -e "
import { selectFormat, encodeDispatchBody } from './src/lib/format-encoder.js';
const tests = [
  ['code_gen', 'natural_language'],
  ['pipeline', 'natural_language'],
  ['analysis', 'natural_language'],
  ['planning', 'natural_language'],
];
for (const [task, proto] of tests) {
  const fmt = selectFormat(task as any, proto);
  const enc = encodeDispatchBody('implement a file reader', task as any, fmt);
  console.log(task, '->', fmt, '| ratio:', enc.compression_ratio);
}
"

# Verify all existing tests still pass
npx vitest run
```

Expected output example:
```
code_gen    -> typed_pseudocode | ratio: -0.8  (overhead added — this is correct for short inputs)
pipeline    -> dsl              | ratio: -0.5
analysis    -> toon             | ratio: 0.3
planning    -> natural_language | ratio: 0
```

Note: Negative compression ratio on short inputs is expected and correct.
The savings appear at real dispatch lengths (500+ chars).

Write to AGENT_STATE.md:
```json
{
  "phase": "phase7_typed_dispatch_complete",
  "format_encoder_created": true,
  "dispatch_interface_extended": true,
  "encoding_wired": true,
  "backend_routing_added": true,
  "build_passing": true,
  "tests_passing": true
}
```

**Phase 4 complete. Then read: `08_PHASE5_COMPRESSION.md`**
```

***

Say **"next"** for `08_PHASE5_COMPRESSION.md`.

Bronnen


## `08_PHASE5_COMPRESSION.md`

```markdown
# 08 — PHASE 5: COMPRESSION LAYER
## LLMLingua + Clarity Layer + Stable Prefix + Prompt Cache

> **Checkpoint ID:** `phase8_compression`
> **Prerequisites:** Phase 7 (typed dispatch) complete
> **Goal:** Every token that hits the API has been earned. Cache hits > 80% steady state.
> **Research:** `llmlingua2_2403.12968.pdf`, `tokenization_impact_2511.03825.pdf`,
>               `plan_caching.pdf`, `caveagent_2601.01569.pdf`

---

## Context Budget Warning

This phase creates two new Python modules and modifies server.py + dispatch-runner.ts.
If context compacts mid-phase:
1. Read AGENT_STATE.md → find last completed step
2. Read ONLY this file
3. Resume from last completed step
4. Clarity layer and LLMLingua are independent — either can be skipped if Ollama unavailable

---

## Architecture Recap (read before implementing)

```
raw user input
    │
    ▼
[CLARITY LAYER]  ← Ollama/Qwen2.5-7B, local, ~1-2s, $0
    │  cleans input, resolves ambiguity
    ▼
[LLMLINGUA]      ← local Python, ~200ms, $0
    │  compresses natural language portions only
    │  NEVER compresses typed_pseudocode / DSL / TOON (already dense)
    ▼
[STABLE PREFIX BUILDER]
    │  prepends byte-identical cached prefix to every request
    │  prefix = system_prompt + project_context + tool_schemas
    ▼
[CLAUDE API]
    │  stable prefix hits cache (90% cost reduction on prefix tokens)
    ▼
[CACHE STATE TRACKER]
    │  records cache_write vs cache_read per request
    ▼
[OBSERVATION RECORDER]  ← from Phase 4
```

---

## Step 8.1 — Create clarity-layer.py Module

**Create file:** `mcp/clarity_layer.py`

The Clarity Layer uses a local Ollama model to clean user input before it reaches Claude.
It runs at zero API cost. If Ollama is unavailable, it passes input through unchanged.

```python
# mcp/clarity_layer.py
"""
Clarity Layer: local LLM pre-processor for user input.
Cleans, completes, and deambiguates input before sending to Claude API.
Falls back to passthrough if Ollama is unavailable.
"""
import time
import urllib.request
import urllib.error
import json
import os
from typing import Optional


OLLAMA_HOST   = os.getenv("OLLAMA_HOST", "http://localhost:11434")
CLARITY_MODEL = os.getenv("CLARITY_MODEL", "qwen2.5:7b")

CLARITY_SYSTEM_PROMPT = """You are a precision input processor. Your only job:
1. Fix typos and grammatical errors silently
2. Expand abbreviations to full terms
3. Resolve ambiguous pronouns using prior context
4. Complete incomplete sentences into full instructions
5. If input is already clear and complete, return it unchanged

RULES:
- Output ONLY the cleaned input text. No commentary. No explanation.
- Never add information not implied by the input
- Never change the meaning or intent
- If genuinely ambiguous with no resolution possible, prepend: [AMBIGUOUS: <question>]
- Max output length: same as input length ± 20%"""


def _ollama_available() -> bool:
    try:
        req = urllib.request.Request(f"{OLLAMA_HOST}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def _call_ollama(text: str, context: Optional[str] = None) -> str:
    messages = [{"role": "system", "content": CLARITY_SYSTEM_PROMPT}]
    if context:
        messages.append({"role": "user", "content": f"Context: {context}"})
        messages.append({"role": "assistant", "content": "Understood."})
    messages.append({"role": "user", "content": text})

    payload = json.dumps({
        "model": CLARITY_MODEL,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0.0, "num_predict": 2048},
    }).encode()

    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        result = json.loads(r.read())
        return result["message"]["content"].strip()


def clarify(
    text: str,
    context: Optional[str] = None,
    force: bool = False
) -> dict:
    """
    Run input through the Clarity Layer.

    Returns:
    {
        "output": str,          # cleaned text (or original if passthrough)
        "passthrough": bool,    # True if Clarity Layer was skipped
        "latency_ms": int,
        "input_chars": int,
        "output_chars": int,
    }
    """
    start = time.monotonic()
    input_chars = len(text)

    # Skip clarity for short, clearly structured inputs
    if not force and len(text) < 50:
        return {
            "output": text, "passthrough": True,
            "latency_ms": 0, "input_chars": input_chars, "output_chars": len(text)
        }

    # Skip if Ollama unavailable (unless forced)
    if not force and not _ollama_available():
        return {
            "output": text, "passthrough": True,
            "latency_ms": 0, "input_chars": input_chars, "output_chars": len(text)
        }

    try:
        cleaned = _call_ollama(text, context)
        latency_ms = int((time.monotonic() - start) * 1000)
        return {
            "output": cleaned, "passthrough": False,
            "latency_ms": latency_ms,
            "input_chars": input_chars, "output_chars": len(cleaned)
        }
    except Exception as e:
        # Always fall through — never block on Clarity Layer failure
        return {
            "output": text, "passthrough": True,
            "latency_ms": int((time.monotonic() - start) * 1000),
            "input_chars": input_chars, "output_chars": len(text),
            "error": str(e)
        }
```

Write to AGENT_STATE.md: `step_8_1_clarity_layer: complete`

---

## Step 8.2 — Create prompt-cache.py Module

**Create file:** `mcp/prompt_cache.py`

```python
# mcp/prompt_cache.py
"""
Stable Prefix Builder + Prompt Cache State Tracker.

The stable prefix is the byte-identical system block sent on every request.
By making it deterministic and tagging it with cache_control: ephemeral,
Claude caches it after the first request — 90% cost reduction on prefix tokens.

Rules for stable prefix:
1. Content must be IDENTICAL byte-for-byte on every request (same session or not)
2. Order: system_prompt → project_context → tool_schemas → DSL_grammar (if applicable)
3. Never include session-specific data in the stable prefix
4. Minimum 1024 tokens for cache to activate (Anthropic minimum)
"""
import hashlib
import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


# ── Stable prefix construction ─────────────────────────────────────────────────

BASE_SYSTEM_PROMPT = """You are an expert software engineer working inside claude-project,
an agent-optimized project brain. You have access to structured tools for memory,
file summaries, Protocol Documents, and session state.

Core operating principles:
1. Always call get_context() at session start — never ask what was done before
2. Always call get_file_summary(path) before reading any file
3. Store decisions with store_memory(category="decision", ...)
4. Store discoveries with store_memory(category="discovery", ...)
5. Output in the format specified by the active dispatch format
6. Never produce prose when a structured output schema is defined
7. Call set_context() at session end with updated stage and summary"""

DSL_GRAMMAR_BLOCK = """
## Active DSL Grammar (pipeline tasks)
PIPELINE := STEP+
STEP     := step_id ":" ACTION ("→" STEP_ID)*
ACTION   := "read" | "transform" | "write" | "call" | "branch" | "filter"
Types    : str, int, float, bool, list[T], dict[K,V], optional[T]
"""

TYPED_PSEUDO_SCHEMA = """
## Typed Pseudocode Schema (code tasks)
DISPATCH[TASK_TYPE]
  INPUT:  <type>
  OUTPUT: { result: str, files_modified: list[str],
            next_action: "done"|"needs_review"|"blocked",
            summary: str }
"""


def build_stable_prefix(
    project_context: dict,
    tool_schemas: list[dict],
    include_dsl: bool = False,
) -> list[dict]:
    """
    Build the stable prefix as a list of Anthropic message system blocks.
    All blocks tagged with cache_control for prompt caching.

    Returns list ready for use as `system` param in messages.create().
    """
    blocks = []

    # Block 1: Base system prompt (always identical)
    blocks.append({
        "type": "text",
        "text": BASE_SYSTEM_PROMPT,
        "cache_control": {"type": "ephemeral"},
    })

    # Block 2: Project context (stable per-project, changes rarely)
    context_text = (
        f"## Project Context\n"
        f"project_id: {project_context.get('id', 'unknown')}\n"
        f"name: {project_context.get('name', 'unknown')}\n"
        f"description: {project_context.get('description', '')}\n"
        f"tech_stack: {json.dumps(project_context.get('tech_stack', []))}\n"
        f"agents: {json.dumps(list(project_context.get('agents', {}).keys()))}\n"
    )
    blocks.append({
        "type": "text",
        "text": context_text,
        "cache_control": {"type": "ephemeral"},
    })

    # Block 3: Tool schemas (stable, changes only on tool additions)
    if tool_schemas:
        tool_text = "## Available MCP Tools\n" + json.dumps(tool_schemas, indent=2)
        blocks.append({
            "type": "text",
            "text": tool_text,
            "cache_control": {"type": "ephemeral"},
        })

    # Block 4: DSL grammar (only for pipeline tasks)
    if include_dsl:
        blocks.append({
            "type": "text",
            "text": DSL_GRAMMAR_BLOCK + TYPED_PSEUDO_SCHEMA,
            "cache_control": {"type": "ephemeral"},
        })

    return blocks


def prefix_hash(blocks: list[dict]) -> str:
    """Compute deterministic hash of prefix for cache tracking."""
    content = json.dumps(blocks, sort_keys=True)
    return hashlib.sha256(content.encode()).hexdigest()[:16]


# ── Cache state tracking ───────────────────────────────────────────────────────

def record_cache_event(
    conn: sqlite3.Connection,
    dispatch_id: str,
    session_id: str,
    prefix_hash_val: str,
    cache_write_tokens: int,
    cache_read_tokens: int,
    total_input_tokens: int,
) -> None:
    """Record cache hit/miss data for a dispatch."""
    now = datetime.now(timezone.utc).isoformat()
    is_hit = cache_read_tokens > 0
    savings_tokens = cache_read_tokens  # tokens NOT charged at full price

    conn.execute("""
        CREATE TABLE IF NOT EXISTS cache_events (
            id TEXT PRIMARY KEY,
            dispatch_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            prefix_hash TEXT NOT NULL,
            cache_write_tokens INTEGER,
            cache_read_tokens INTEGER,
            total_input_tokens INTEGER,
            is_hit INTEGER NOT NULL,
            savings_tokens INTEGER,
            ts TEXT NOT NULL
        )
    """)

    import uuid
    conn.execute(
        """INSERT INTO cache_events
           (id, dispatch_id, session_id, prefix_hash,
            cache_write_tokens, cache_read_tokens,
            total_input_tokens, is_hit, savings_tokens, ts)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (str(uuid.uuid4())[:8], dispatch_id, session_id, prefix_hash_val,
         cache_write_tokens, cache_read_tokens, total_input_tokens,
         1 if is_hit else 0, savings_tokens, now)
    )
    conn.commit()


def get_cache_hit_rate(conn: sqlite3.Connection, session_id: Optional[str] = None) -> dict:
    """Return cache hit rate stats."""
    where = f"WHERE session_id = '{session_id}'" if session_id else ""
    row = conn.execute(f"""
        SELECT
            COUNT(*) as total,
            SUM(is_hit) as hits,
            SUM(savings_tokens) as tokens_saved,
            AVG(CAST(cache_read_tokens AS FLOAT) /
                NULLIF(total_input_tokens, 0)) as avg_cache_ratio
        FROM cache_events {where}
    """).fetchone()
    if not row or row["total"] == 0:
        return {"total": 0, "hits": 0, "hit_rate": 0.0, "tokens_saved": 0}
    return {
        "total": row["total"],
        "hits": row["hits"],
        "hit_rate": round((row["hits"] / row["total"]) * 100, 1),
        "tokens_saved": row["tokens_saved"] or 0,
        "avg_cache_ratio": round(row["avg_cache_ratio"] or 0, 4),
    }
```

Write to AGENT_STATE.md: `step_8_2_prompt_cache_module: complete`

---

## Step 8.3 — Add LLMLingua Compression to server.py

**Add to `mcp/server.py`** — LLMLingua compressor:

```python
# Add after existing imports in server.py
from llmlingua import PromptCompressor

_LINGUA_COMPRESSOR = None

def _get_lingua_compressor():
    """Lazy-load LLMLingua compressor. Falls back to passthrough if unavailable."""
    global _LINGUA_COMPRESSOR
    if _LINGUA_COMPRESSOR is None:
        try:
            _LINGUA_COMPRESSOR = PromptCompressor(
                model_name="microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank",
                use_llmlingua2=True,
                device_map="cpu",
            )
        except Exception as e:
            print(f"[compression] LLMLingua unavailable: {e}. Using passthrough.")
            _LINGUA_COMPRESSOR = "unavailable"
    return _LINGUA_COMPRESSOR


def compress_natural_language(text: str, target_ratio: float = 0.6) -> dict:
    """
    Compress natural language text using LLMLingua-2.
    ONLY call on natural_language format dispatches.
    Never call on typed_pseudocode, DSL, or TOON — they are already dense.

    target_ratio: 0.6 = keep 60% of tokens (40% compression)
    Returns: {compressed: str, original_chars: int, compressed_chars: int, ratio: float}
    """
    import time
    start = time.monotonic()
    original_chars = len(text)

    compressor = _get_lingua_compressor()
    if compressor == "unavailable" or len(text) < 200:
        # Don't compress short texts — overhead not worth it
        return {
            "compressed": text, "original_chars": original_chars,
            "compressed_chars": original_chars, "ratio": 1.0,
            "latency_ms": 0, "passthrough": True
        }

    try:
        result = compressor.compress_prompt(
            text,
            rate=target_ratio,
            force_tokens=["\n", ".", "!", "?"],  # preserve sentence structure
            drop_consecutive=True,
        )
        compressed = result["compressed_prompt"]
        latency_ms = int((time.monotonic() - start) * 1000)
        return {
            "compressed": compressed,
            "original_chars": original_chars,
            "compressed_chars": len(compressed),
            "ratio": round(len(compressed) / original_chars, 4),
            "latency_ms": latency_ms,
            "passthrough": False,
        }
    except Exception as e:
        return {
            "compressed": text, "original_chars": original_chars,
            "compressed_chars": original_chars, "ratio": 1.0,
            "latency_ms": 0, "passthrough": True, "error": str(e)
        }
```

Write to AGENT_STATE.md: `step_8_3_llmlingua_added: complete`

---

## Step 8.4 — Wire Clarity + Compression into MCP Tool dispatch_task

Add a new MCP tool that runs the full pipeline before dispatching:

```python
@mcp.tool()
def dispatch_task(
    title: str,
    body: str,
    agent: str | None = None,
    priority: str = "normal",
    context: str | None = None,
) -> dict:
    """
    Full-pipeline dispatch: Clarity → Compression → Format Encode → Submit.
    Prefer this over direct dispatch for all natural language inputs.
    Returns: {dispatch_id, task_type, format, compression_ratio, clarity_passthrough}
    """
    from clarity_layer import clarify
    import time

    timings = {}

    # Step 1: Clarity Layer
    t0 = time.monotonic()
    clarity_result = clarify(body, context=context)
    timings["clarity_ms"] = clarity_result["latency_ms"]
    clean_body = clarity_result["output"]

    # Step 2: LLMLingua compression (only for natural language)
    # Task classification happens first to decide if compression is appropriate
    from task_classifier_py import classify_task_type  # Python port of task-classifier.ts
    task_type = classify_task_type(title, clean_body)

    compress_result = {"ratio": 1.0, "passthrough": True, "latency_ms": 0}
    if task_type in ("planning", "documentation", "unknown"):
        compress_result = compress_natural_language(clean_body, target_ratio=0.65)
        clean_body = compress_result["compressed"]
    timings["compression_ms"] = compress_result.get("latency_ms", 0)

    # Step 3: Create dispatch file and queue it
    memory_dir, dispatches_dir, _ = _resolve_paths()
    dispatch_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()

    dispatch_data = {
        "id": dispatch_id,
        "title": title,
        "body": clean_body,
        "original_body_chars": len(body),
        "encoded_body_chars": len(clean_body),
        "compression_ratio": compress_result["ratio"],
        "task_type": task_type,
        "agent": agent,
        "priority": priority,
        "status": "pending",
        "created": now,
        "protocol_condition": "natural_language",
    }

    dispatch_path = dispatches_dir / f"{dispatch_id}.json"
    with open(dispatch_path, "w") as f:
        json.dump(dispatch_data, f, indent=2)

    return {
        "dispatch_id": dispatch_id,
        "task_type": task_type,
        "clarity_passthrough": clarity_result["passthrough"],
        "compression_ratio": compress_result["ratio"],
        "original_chars": len(body),
        "final_chars": len(clean_body),
        "timings_ms": timings,
    }
```

Write to AGENT_STATE.md: `step_8_4_dispatch_task_tool: complete`

---

## Step 8.5 — Create Python Task Classifier Port

**Create file:** `mcp/task_classifier_py.py`
(Python port of `src/lib/task-classifier.ts` for use in server.py)

```python
# mcp/task_classifier_py.py
import re
from typing import Optional

TASK_PATTERNS = [
    ("test_gen",      [r"\btest(s|ing)?\b", r"\bspec\b", r"\bvitest\b", r"\bjest\b"]),
    ("refactor",      [r"\brefactor\b", r"\bclean up\b", r"\brewrite\b", r"\bimprove\b"]),
    ("code_gen",      [r"\bimplement\b", r"\bcreate\b", r"\bbuild\b", r"\badd\b.{0,20}\bfunction\b"]),
    ("analysis",      [r"\banalyze\b", r"\banalyse\b", r"\breview\b", r"\bcheck\b", r"\binspect\b"]),
    ("documentation", [r"\bdoc(s|ument)?\b", r"\breadme\b", r"\bcomment\b", r"\bjsdoc\b"]),
    ("pipeline",      [r"\bpipeline\b", r"\btransform\b", r"\bprocess\b", r"\betl\b"]),
    ("planning",      [r"\bplan\b", r"\barchitect\b", r"\bdesign\b", r"\bstrateg\b"]),
    ("retrieval",     [r"\bfind\b", r"\bsearch\b", r"\blookup\b", r"\bwhere\b.{0,10}\bis\b"]),
]

def classify_task_type(title: str, body: str) -> str:
    combined = f"{title} {body}".lower()
    for task_type, patterns in TASK_PATTERNS:
        if any(re.search(p, combined) for p in patterns):
            return task_type
    return "unknown"
```

Write to AGENT_STATE.md: `step_8_5_python_classifier: complete`

---

## Step 8.6 — Verify Ollama + Qwen Available

```bash
# Check Ollama is running
curl -s http://localhost:11434/api/tags | python3 -c "import json,sys; d=json.load(sys.stdin); print([m['name'] for m in d.get('models',[])])"

# Pull Qwen2.5 if not present
ollama pull qwen2.5:7b

# Test clarity layer
python3 -c "
import sys; sys.path.insert(0, 'mcp')
from clarity_layer import clarify
result = clarify('implment the fiel reader thingy we talked about')
print('Passthrough:', result['passthrough'])
print('Output:', result['output'])
print('Latency:', result['latency_ms'], 'ms')
"
```

If Ollama is unavailable, note in AGENT_STATE.md — clarity layer will passthrough silently.
This is acceptable; compression still runs via LLMLingua.

Write to AGENT_STATE.md: `step_8_6_ollama_verified: true/false`

---

## Step 8.7 — Full Pipeline Integration Test

```python
# scripts/test_full_pipeline.py
import sys
sys.path.insert(0, 'mcp')

from clarity_layer import clarify
from task_classifier_py import classify_task_type

test_cases = [
    ("Implement file reader", "create a funtion that reads json files form the projct directory and returns parsed content", "code_gen"),
    ("Build ETL pipeline", "read from sqlite transform to json write to lancedb", "pipeline"),
    ("Review auth module", "check the authentication code for security issues", "analysis"),
]

for title, body, expected_type in test_cases:
    clarity = clarify(body)
    task_type = classify_task_type(title, clarity["output"])
    status = "OK" if task_type == expected_type else f"FAIL (got {task_type})"
    print(f"{title[:30]:30s} | type: {task_type:15s} | clarity: {'pass' if clarity['passthrough'] else 'cleaned':8s} | {status}")
```

```bash
python3 scripts/test_full_pipeline.py
npm run build
npx vitest run
```

Write to AGENT_STATE.md:
```json
{
  "phase": "phase8_compression_complete",
  "clarity_layer_created": true,
  "llmlingua_integrated": true,
  "stable_prefix_builder_created": true,
  "cache_tracker_created": true,
  "dispatch_task_tool_added": true,
  "pipeline_test_passed": true,
  "ollama_available": true
}
```

**Phase 5 complete. Then read: `09_TESTING_STRATEGY.md`**
```

***

Say **"next"** for `09_TESTING_STRATEGY.md`.

Bronnen


## `09_TESTING_STRATEGY.md`

```markdown
# 09 — TESTING STRATEGY
## Phase-by-Phase Verification, Success Criteria & Rollback

> **Checkpoint ID:** `phase9_testing`
> **Role:** Reference throughout all phases — not a one-time read
> **Return here:** After every phase completes AND after any unexpected failure

---

## Testing Philosophy

Each phase must be independently verifiable before the next starts.
A phase is only "complete" when ALL of the following are true:
1. Build passes (`npm run build`)
2. Existing tests pass (`npx vitest run`)
3. Phase-specific verification script passes (defined below)
4. AGENT_STATE.md checkpoint written

**Never mark a phase complete on build alone.**

---

## Phase 1 — Research Download Verification

```bash
# Minimum viable: 6 papers + 4 repos + 3 Python packages
echo "=== Papers ===" && ls ~/claude-project-research/papers/*.pdf | wc -l
echo "=== Repos ===" && ls ~/claude-project-research/repos/ | wc -l
echo "=== Python ===" && python3 -c "import llmlingua, lancedb, kuzu; print('OK')"
echo "=== Node ===" && npm run build 2>&1 | tail -3
echo "=== API Cache Fields ===" && python3 ~/claude-project-research/verify_cache_fields.py
```

**Pass criteria:**
- Papers >= 6
- Repos >= 4
- Python: prints `OK`
- Node build: exits 0
- API: no `MISSING` fields

---

## Phase 2 — Codebase Audit Verification

No code was changed. Verify audit understanding:

```bash
# Baseline metrics must be recorded in AGENT_STATE.md
python3 -c "
import json
state = json.load(open('AGENT_STATE.md'))  # or parse YAML
assert 'baseline_metrics' in state, 'baseline_metrics missing from AGENT_STATE'
print('Audit checkpoint OK')
"
```

**Pass criteria:** AGENT_STATE.md contains `baseline_metrics` block with at least one non-null value.

---

## Phase 3 — Architecture Read Verification

No code was changed. Verify plan is formed:

```bash
# AGENT_STATE.md must contain implementation_plan_formed: true
grep -q "implementation_plan_formed" AGENT_STATE.md && echo "OK" || echo "FAIL"
```

---

## Phase 4 — Measurement Layer Verification

```bash
# 1. Build
npm run build || { echo "BUILD FAILED"; exit 1; }

# 2. Unit tests
npx vitest run || { echo "TESTS FAILED"; exit 1; }

# 3. research-db.ts compiles and exports correctly
npx ts-node -e "
import { initResearchDb, writeObservation } from './src/lib/research-db.js';
import { classifyTaskType, inferInteractionPair } from './src/lib/task-classifier.js';
import Database from 'better-sqlite3';
import * as os from 'os';
import * as path from 'path';

const dbPath = path.join(os.tmpdir(), 'test-research.db');
const db = initResearchDb(dbPath);

const obs = {
  id: 'test0001',
  dispatch_id: 'disp0001',
  session_id: 'sess0001',
  interaction_pair: 'user→main',
  task_type: classifyTaskType('implement file reader', 'create a json reader'),
  protocol_condition: 'natural_language',
  pd_was_cached: false,
  tokens: { system_prompt:500, project_context:200, tool_schemas:150,
            user_message:100, tool_outputs:0, total_input:950,
            output:200, cache_write:0, cache_read:0 },
  latency_ms: { clarity_layer:0, compression:5, pd_lookup:0,
                inference:1200, tool_execution:0, total:1205 },
  outcome: 'success', iterations: 1, task_completed: true,
  ts: new Date().toISOString(),
};

writeObservation(db, obs);

const rows = db.prepare('SELECT * FROM dispatch_observations').all();
console.assert(rows.length === 1, 'Row not written');
console.assert(rows.task_type === 'code_gen', 'Task type wrong: ' + rows.task_type);
console.assert(rows.tokens_total_input === 950, 'Tokens wrong');
db.close();
console.log('Phase 4 verification: PASSED');
"

# 4. Verify classifyTaskType correctness
npx ts-node -e "
import { classifyTaskType } from './src/lib/task-classifier.js';
const cases = [
  ['implement file reader', 'create function', 'code_gen'],
  ['test auth module', 'write vitest specs', 'test_gen'],
  ['build etl pipeline', 'transform data', 'pipeline'],
  ['review code', 'analyze for bugs', 'analysis'],
  ['find the auth file', 'search for login', 'retrieval'],
];
let passed = 0;
for (const [title, body, expected] of cases) {
  const got = classifyTaskType(title, body);
  const ok = got === expected;
  console.log((ok ? '✓' : '✗'), title, '->', got, ok ? '' : '(expected ' + expected + ')');
  if (ok) passed++;
}
console.log(passed + '/' + cases.length + ' passed');
if (passed < cases.length) process.exit(1);
"
```

**Pass criteria:** All assertions pass, task classification >= 4/5 correct.

---

## Phase 5 — Database Layer Verification

```bash
# 1. All new MCP tools registered
python3 -c "
import sys; sys.path.insert(0, 'mcp')
from server import mcp
tool_names = [t.name for t in mcp.list_tools()]
required = ['store_memory','query_memory','get_context','set_context',
            'set_file_summary','get_file_summary','find_related_files']
missing = [t for t in required if t not in tool_names]
if missing:
    print('MISSING TOOLS:', missing); exit(1)
print('All tools registered: OK')
"

# 2. Round-trip test: store → query
python3 -c "
import sys; sys.path.insert(0, 'mcp')
import os, tempfile
os.environ['CLAUDE_PROJECT_DIR'] = tempfile.mkdtemp()

# Import and test store_memory → query_memory round trip
# Note: _resolve_paths() must return the tempdir above
# Adjust if your _resolve_paths() reads from .claude-project walk-up

from server import store_memory, query_memory, get_context, set_context

r1 = store_memory('decision', 'Use LanceDB for semantic memory instead of flat files')
assert 'id' in r1, 'store_memory failed: ' + str(r1)
print('store_memory OK:', r1)

r2 = query_memory('vector database memory')
assert len(r2) > 0, 'query_memory returned empty'
print('query_memory OK:', r2['text'][:60])

set_context(stage='phase5_test', blockers=[], critical_facts=['LanceDB chosen'])
ctx = get_context()
assert ctx['stage'] == 'phase5_test', 'set/get context broken'
assert 'LanceDB chosen' in ctx['critical_facts'], 'critical_facts broken'
print('set_context / get_context OK')

print('Phase 5 verification: PASSED')
"

# 3. Obsidian sync is async and does not block
python3 -c "
import sys; sys.path.insert(0, 'mcp')
import time
# store_memory should return in < 500ms even if Obsidian is configured
start = time.monotonic()
from server import store_memory
store_memory('fact', 'timing test')
elapsed = (time.monotonic() - start) * 1000
assert elapsed < 500, f'store_memory blocked for {elapsed:.0f}ms — Obsidian sync not async'
print(f'Obsidian async OK ({elapsed:.0f}ms)')
"
```

**Pass criteria:** All tools registered, round-trip passes, store_memory < 500ms.

---

## Phase 6 — PD Registry Verification

```bash
python3 -c "
import sys; sys.path.insert(0, 'mcp')
import sqlite3, tempfile, os

# Use isolated test DB
db_path = tempfile.mktemp(suffix='.db')
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

# Init tables (call initResearchDb equivalent or inline DDL)
conn.execute('''CREATE TABLE IF NOT EXISTS pd_registry (
    id TEXT PRIMARY KEY, text TEXT NOT NULL, yaml_meta TEXT,
    task_type TEXT, interaction_pair TEXT, created_at TEXT NOT NULL,
    created_by TEXT NOT NULL, use_count INTEGER NOT NULL DEFAULT 0,
    last_used TEXT, deprecated INTEGER NOT NULL DEFAULT 0, superseded_by TEXT
)''')
conn.execute('''CREATE TABLE IF NOT EXISTS pd_usage_log (
    id TEXT PRIMARY KEY, pd_id TEXT NOT NULL, dispatch_id TEXT NOT NULL,
    session_id TEXT NOT NULL, project_id TEXT NOT NULL, tokens_saved INTEGER, ts TEXT NOT NULL
)''')
conn.execute('''CREATE TABLE IF NOT EXISTS interaction_counts (
    pair TEXT NOT NULL, project_id TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
    last_seen TEXT NOT NULL, pd_assigned TEXT, PRIMARY KEY (pair, project_id)
)''')
conn.commit()

from pd_registry import (register_pd_entry, get_pd_entry, search_pd_entries,
                          log_pd_use, deprecate_pd, increment_interaction_count)

# Test 1: Content addressing
pd_text = '''---
pd_version: \"1.0\"
task_type: code_gen
interaction_pair: user→main
***
1. Output files_modified first. 2. Summary one sentence max.'''

r1 = register_pd_entry(conn, pd_text, 'code_gen', 'user→main', 'test')
r2 = register_pd_entry(conn, pd_text, 'code_gen', 'user→main', 'test')
assert r1['id'] == r2['id'], 'Content-addressing broken'
assert r1['is_new'] == True, 'First registration should be new'
assert r2['is_new'] == False, 'Second registration should not be new'
print('Content-addressing: OK')

# Test 2: Retrieval
entry = get_pd_entry(conn, r1['id'])
assert entry['text'] == pd_text, 'Retrieval broken'
print('Retrieval: OK')

# Test 3: Search
results = search_pd_entries(conn, task_type='code_gen')
assert len(results) == 1, 'Search broken'
print('Search: OK')

# Test 4: Usage logging
log_pd_use(conn, r1['id'], 'disp001', 'sess001', 'proj001', tokens_saved=450)
entry2 = get_pd_entry(conn, r1['id'])
assert entry2['use_count'] == 1, 'use_count not incremented'
print('Usage logging: OK')

# Test 5: Interaction threshold
c1 = increment_interaction_count(conn, 'user→main', 'proj001')
c2 = increment_interaction_count(conn, 'user→main', 'proj001')
c3 = increment_interaction_count(conn, 'user→main', 'proj001')
assert c3 == 3, f'Interaction count wrong: {c3}'
print('Interaction counting: OK')

# Test 6: Deprecation
deprecate_pd(conn, r1['id'], superseded_by=None)
results2 = search_pd_entries(conn, task_type='code_gen')
assert len(results2) == 0, 'Deprecated PD returned in search'
print('Deprecation: OK')

print('Phase 6 verification: PASSED')
conn.close()
os.unlink(db_path)
"
```

**Pass criteria:** All 6 sub-tests pass.

---

## Phase 7 — Typed Dispatch Verification

```bash
# Format selection correctness
npx ts-node -e "
import { selectFormat, encodeDispatchBody } from './src/lib/format-encoder.js';

const cases = [
  ['code_gen', 'natural_language', 'typed_pseudocode'],
  ['refactor', 'natural_language', 'typed_pseudocode'],
  ['test_gen', 'natural_language', 'typed_pseudocode'],
  ['pipeline', 'natural_language', 'dsl'],
  ['analysis', 'natural_language', 'toon'],
  ['planning', 'natural_language', 'natural_language'],
  ['documentation', 'natural_language', 'natural_language'],
  ['code_gen', 'pd_negotiated', 'typed_pseudocode'],
];

let passed = 0;
for (const [task, proto, expected] of cases) {
  const got = selectFormat(task as any, proto);
  const ok = got === expected;
  console.log((ok ? '✓' : '✗'), task, proto, '->', got);
  if (ok) passed++;
}
console.log(passed + '/' + cases.length + ' passed');
if (passed < cases.length) process.exit(1);
"

# Encoding produces output for all formats
npx ts-node -e "
import { encodeDispatchBody } from './src/lib/format-encoder.js';
const body = 'implement a JSON file reader that handles nested objects and returns typed results';
const formats = ['typed_pseudocode','codeact','toon','dsl','natural_language'] as const;
for (const fmt of formats) {
  const result = encodeDispatchBody(body, 'code_gen', fmt);
  console.assert(result.encoded_body.length > 0, fmt + ' produced empty output');
  console.log(fmt, '| chars:', result.original_chars, '->', result.encoded_chars, '| ratio:', result.compression_ratio);
}
console.log('Format encoding: OK');
"

npm run build && npx vitest run
```

**Pass criteria:** All 8 format selection cases correct, all 5 encodings non-empty, build + tests pass.

---

## Phase 8 — Compression Layer Verification

```bash
# 1. Clarity Layer
python3 -c "
import sys; sys.path.insert(0, 'mcp')
from clarity_layer import clarify

# Test with typo-heavy input
result = clarify('implment the fiel reader thingy we talked abot', force=True)
print('Clarity output:', result['output'])
print('Passthrough:', result['passthrough'])
print('Latency:', result['latency_ms'], 'ms')
assert len(result['output']) > 0, 'Clarity returned empty'
print('Clarity Layer: OK')
"

# 2. LLMLingua compression
python3 -c "
import sys; sys.path.insert(0, 'mcp')
from server import compress_natural_language

long_text = '''
We need to implement a comprehensive file reader module that will handle
various file formats including JSON, YAML, and plain text files. The module
should provide robust error handling for missing files, malformed content,
and permission issues. It should also support streaming for large files
and provide a clean async API for integration with the rest of the system.
'''
result = compress_natural_language(long_text, target_ratio=0.6)
print('Original chars:', result['original_chars'])
print('Compressed chars:', result['compressed_chars'])
print('Ratio:', result['ratio'])
print('Passthrough:', result['passthrough'])
if not result['passthrough']:
    assert result['ratio'] < 0.95, 'Compression had no effect'
print('LLMLingua: OK')
"

# 3. Stable prefix is deterministic
python3 -c "
import sys; sys.path.insert(0, 'mcp')
from prompt_cache import build_stable_prefix, prefix_hash

ctx = {'id': 'test', 'name': 'TestProject', 'description': 'Test', 'tech_stack': ['ts'], 'agents': {}}
prefix1 = build_stable_prefix(ctx, [], include_dsl=False)
prefix2 = build_stable_prefix(ctx, [], include_dsl=False)
h1 = prefix_hash(prefix1)
h2 = prefix_hash(prefix2)
assert h1 == h2, f'Prefix not deterministic: {h1} != {h2}'
print('Stable prefix determinism: OK')
print('Prefix hash:', h1)
print('Block count:', len(prefix1))
"

# 4. Full pipeline test
python3 scripts/test_full_pipeline.py

npm run build && npx vitest run
```

**Pass criteria:** Clarity returns non-empty output, LLMLingua ratio < 0.95 (or passthrough acknowledged), prefix hash deterministic, pipeline test passes.

---

## Full Integration Test (After All Phases)

```bash
#!/bin/bash
# scripts/full_integration_test.sh
set -e

echo "=== Full Integration Test ==="

echo "--- Build ---"
npm run build

echo "--- Unit tests ---"
npx vitest run

echo "--- MCP tool registry ---"
python3 -c "
import sys; sys.path.insert(0, 'mcp')
from server import mcp
tools = [t.name for t in mcp.list_tools()]
required = [
    'store_memory','query_memory','get_context','set_context',
    'set_file_summary','get_file_summary','find_related_files',
    'register_pd','get_pd','search_pd','log_pd_usage',
    'check_negotiation_threshold','dispatch_task'
]
missing = [t for t in required if t not in tools]
if missing: print('MISSING:', missing); exit(1)
print(f'Tool registry OK: {len(tools)} tools')
"

echo "--- Research DB integrity ---"
python3 -c "
import sqlite3, glob, os
dbs = glob.glob(os.path.expanduser('~/.claude/projects/*/research.db'))
if not dbs: print('No research.db found yet — OK if no dispatches run'); exit(0)
db = sqlite3.connect(dbs)
tables = [r for r in db.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()]
required = ['dispatch_observations','pd_registry','pd_usage_log','file_summaries','interaction_counts']
missing = [t for t in required if t not in tables]
if missing: print('MISSING TABLES:', missing); exit(1)
print('Tables OK:', tables)
db.close()
"

echo "=== All integration tests passed ==="
```

```bash
chmod +x scripts/full_integration_test.sh
./scripts/full_integration_test.sh
```

---

## Rollback Procedures

### Rollback Phase 4 (Measurement)
```bash
# Remove new files
rm src/lib/research-db.ts src/lib/task-classifier.ts
# Revert dispatch-runner.ts to last git commit
git checkout src/lib/dispatch-runner.ts
npm run build
```

### Rollback Phase 5 (Database)
```bash
# New tools were added, not replacing — safe to comment out
# In server.py: comment out store_memory, query_memory, get_context,
#               set_context, set_file_summary, get_file_summary, find_related_files
# Obsidian sync: set obsidian_sync.enabled = true in .claude-project
```

### Rollback Phase 6 (PD Registry)
```bash
rm mcp/pd_registry.py
# In server.py: comment out register_pd, get_pd, search_pd,
#               log_pd_usage, check_negotiation_threshold
# Remove negotiation_controller from .claude-project agents
```

### Rollback Phase 7 (Typed Dispatch)
```bash
rm src/lib/format-encoder.ts
git checkout src/lib/dispatch-runner.ts src/lib/project.ts
npm run build
```

### Rollback Phase 8 (Compression)
```bash
rm mcp/clarity_layer.py mcp/prompt_cache.py mcp/task_classifier_py.py
# In server.py: remove _LINGUA_COMPRESSOR, compress_natural_language, dispatch_task tool
```

---

## Success Metrics (End State)

Record these in AGENT_STATE.md when all phases complete:

| Metric | Baseline | Target | Actual |
|--------|----------|--------|--------|
| Tokens per dispatch (mean) | (recorded Phase 2) | -40% | TBD |
| Cache hit rate (steady state) | 0% | >80% | TBD |
| Context load time | full file reads | <200 tokens via get_context() | TBD |
| File lookup cost | full read (N tokens) | 1 summary (~15 tokens) | TBD |
| PD registry size | 0 | >5 PDs after 1 week | TBD |
| Observation completeness | 0% | 100% dispatches observed | TBD |

**Then read: `AGENT_STATE.md` and write final completion entry.**
```

***

Last file coming up — say **"next"** for `AGENT_STATE.md` (the live resume template).

Bronnen


## `AGENT_STATE.md`

```markdown
# AGENT STATE — Live Progress Tracker
## READ THIS FIRST ON EVERY SESSION START

> **This file is your single source of truth.**
> Update it after every completed step. Never skip this.
> If context compacts, this file tells you exactly where to resume.

---

## CURRENT STATUS

```json
{
  "current_phase": "phase1_research_download",
  "current_step": "step_1_1_create_directories",
  "last_completed_step": null,
  "last_updated": "REPLACE_WITH_TIMESTAMP",
  "session_id": "REPLACE_WITH_SESSION_ID",
  "blocked": false,
  "blocked_reason": null
}
```

---

## HOW TO USE THIS FILE

**On session start:**
1. Read `current_phase` and `current_step`
2. Read only the instruction file for `current_phase`
3. Resume from `current_step` — do not repeat completed steps
4. If `blocked: true` — read `blocked_reason` and write `BLOCKED.md` before anything else

**On step completion:**
1. Update `last_completed_step` with the step you just finished
2. Update `current_step` with the next step
3. Update `last_updated` with current ISO timestamp
4. Run the verification command for that step
5. Record verification result below under the phase

**On context compaction warning:**
1. Immediately finish the current atomic task
2. Write completion to this file
3. Do NOT start any new task — let context compact cleanly

---

## PHASE COMPLETION LOG

### Phase 1 — Research Download
```json
{
  "status": "not_started",
  "step_1_1_create_directories": null,
  "step_1_2_papers_downloaded": null,
  "step_1_2_failures": [],
  "step_1_3_repos_cloned": null,
  "step_1_3_failures": [],
  "step_1_4_python_deps": null,
  "step_1_5_node_build": null,
  "step_1_5_baseline_test_failures": [],
  "step_1_6_api_cache_fields_verified": null,
  "papers_count": 0,
  "repos_count": 0,
  "completed_at": null
}
```

### Phase 2 — Codebase Audit
```json
{
  "status": "not_started",
  "audit_understood": null,
  "baseline_metrics_recorded": null,
  "baseline_metrics": {
    "recent_dispatch_tokens": null,
    "event_log_lines": null,
    "memory_dir_size_mb": null,
    "dispatch_count": null
  },
  "completed_at": null
}
```

### Phase 3 — Architecture Read
```json
{
  "status": "not_started",
  "implementation_plan_formed": null,
  "questions_for_blocked_md": [],
  "completed_at": null
}
```

### Phase 4 — Measurement Layer
```json
{
  "status": "not_started",
  "step_4_1_research_db_ts": null,
  "step_4_2_task_classifier": null,
  "step_4_3_dispatch_runner_upgraded": null,
  "step_4_4_tool_token_count": null,
  "step_4_5_build_passing": null,
  "step_4_5_tests_passing": null,
  "step_4_5_observation_db_created": null,
  "step_4_5_sample_token_count": null,
  "verification_passed": null,
  "completed_at": null
}
```

### Phase 5 — Database Layer
```json
{
  "status": "not_started",
  "step_5_1_db_init_code": null,
  "step_5_2_new_mcp_tools": null,
  "step_5_3_obsidian_decoupled": null,
  "step_5_4_tools_registered": null,
  "step_5_4_round_trip_test_passed": null,
  "step_5_4_obsidian_async_verified": null,
  "verification_passed": null,
  "completed_at": null
}
```

### Phase 6 — PD Registry
```json
{
  "status": "not_started",
  "step_6_1_pd_registry_module": null,
  "step_6_2_pd_mcp_tools": null,
  "step_6_3_negotiation_controller_defined": null,
  "step_6_4_threshold_wired": null,
  "step_6_5_dedup_test_passed": null,
  "step_6_5_search_test_passed": null,
  "step_6_5_usage_log_test_passed": null,
  "step_6_5_deprecation_test_passed": null,
  "verification_passed": null,
  "completed_at": null
}
```

### Phase 7 — Typed Dispatch
```json
{
  "status": "not_started",
  "step_7_1_format_encoder": null,
  "step_7_2_dispatch_interface_extended": null,
  "step_7_3_encoding_wired": null,
  "step_7_4_backend_routing": null,
  "step_7_5_observation_format_fields": null,
  "step_7_6_format_selection_tests": null,
  "step_7_6_encoding_tests": null,
  "step_7_6_build_passing": null,
  "step_7_6_tests_passing": null,
  "verification_passed": null,
  "completed_at": null
}
```

### Phase 8 — Compression Layer
```json
{
  "status": "not_started",
  "step_8_1_clarity_layer": null,
  "step_8_2_prompt_cache_module": null,
  "step_8_3_llmlingua_added": null,
  "step_8_4_dispatch_task_tool": null,
  "step_8_5_python_classifier": null,
  "step_8_6_ollama_verified": null,
  "step_8_7_pipeline_test_passed": null,
  "ollama_available": null,
  "clarity_latency_ms": null,
  "prefix_hash": null,
  "verification_passed": null,
  "completed_at": null
}
```

### Phase 9 — Full Integration Test
```json
{
  "status": "not_started",
  "build_passing": null,
  "unit_tests_passing": null,
  "tool_registry_complete": null,
  "research_db_integrity": null,
  "full_integration_script_passed": null,
  "completed_at": null
}
```

---

## SUCCESS METRICS (fill in at end)

| Metric | Baseline | Final | Delta |
|--------|----------|-------|-------|
| Tokens per dispatch (mean) | TBD | TBD | TBD |
| Cache hit rate (steady state) | 0% | TBD | TBD |
| Context load tokens (session start) | TBD | TBD | TBD |
| File lookup tokens (per file) | TBD | TBD | TBD |
| PD registry size (after 1 week) | 0 | TBD | TBD |
| Observation completeness | 0% | TBD | TBD |

---

## FILES MODIFIED LOG

Record every file touched in each phase.
Format: `[phase] action path`

```
[phase4] created  src/lib/research-db.ts
[phase4] created  src/lib/task-classifier.ts
[phase4] modified src/lib/dispatch-runner.ts
[phase5] modified mcp/server.py
[phase6] created  mcp/pd_registry.py
[phase6] modified mcp/server.py
[phase6] modified src/lib/dispatch-runner.ts
[phase7] created  src/lib/format-encoder.ts
[phase7] modified src/lib/dispatch-runner.ts
[phase7] modified src/lib/project.ts
[phase8] created  mcp/clarity_layer.py
[phase8] created  mcp/prompt_cache.py
[phase8] created  mcp/task_classifier_py.py
[phase8] modified mcp/server.py
```

---

## BLOCKED LOG

If you write BLOCKED.md, record it here:

```json
{
  "blocks": []
}
```

Format for each block:
```json
{
  "phase": "phase_N",
  "step": "step_N_N",
  "question": "exact question",
  "options": ["option A", "option B"],
  "resolved": false,
  "resolution": null
}
```

---

## REGRESSION LOG

If a previously passing test starts failing, record here before investigating:

```json
{
  "regressions": []
}
```

Format:
```json
{
  "detected_at_phase": "phase_N",
  "broken_phase": "phase_M",
  "test": "description of failing test",
  "likely_cause": null,
  "resolved": false
}
```

---

## NOTES FOR NEXT SESSION

> Write free-form notes here at session end.
> This is the first thing read after the status block above.

(empty — fill in at end of each session)

---

## VERSION

AGENT_STATE template version: 1.0.0
Instruction set: claude-project-upgrade v1.0.0
Created: 2026-03-26
```

***

**That's all 10 files — Batch 2 complete.**

Here's the full inventory of everything across both batches:

| # | File | Purpose |
|---|------|---------|
| 00 | `00_MASTER.md` | Entry point, execution order, context strategy |
| 01 | `01_RESEARCH_DOWNLOAD.md` | Papers, repos, deps, env setup |
| 02 | `02_CODEBASE_AUDIT.md` | What exists, what to keep/change/remove |
| 03 | `03_TARGET_ARCHITECTURE.md` | Full system design + all DB schemas |
| 04 | `04_PHASE1_MEASUREMENT.md` | SQLite research DB + DispatchObservation |
| 05 | `05_PHASE2_DATABASE.md` | LanceDB + SQLite MCP tools, Obsidian decoupled |
| 06 | `06_PHASE3_PD_REGISTRY.md` | Content-addressed PD store + negotiation agent |
| 07 | `07_PHASE4_TYPED_DISPATCH.md` | Format encoder + backend routing |
| 08 | `08_PHASE5_COMPRESSION.md` | Clarity layer + LLMLingua + stable prefix |
| 09 | `09_TESTING_STRATEGY.md` | Per-phase tests, success criteria, rollbacks |
| 10 | `AGENT_STATE.md` | Live resume tracker — agent fills this in |

Send these + your research report to Claude Code and point it at `00_MASTER.md` first. It has everything it needs to run autonomously and resume cleanly if context compacts.

Bronnen

