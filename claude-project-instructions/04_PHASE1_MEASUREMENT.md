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